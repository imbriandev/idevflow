import { loadConfig } from "../config/config.ts";
import { loadDefinedProduct } from "../documents/product.ts";
import { inspectBaseline } from "../git/baseline.ts";
import type { Risk } from "../lifecycle/contracts.ts";
import { PipelineStore } from "../pipeline/store.ts";
import type { WorkSlice } from "../planning/work-graph.ts";
import { loadWorkGraph } from "../planning/work-graph.ts";
import { loadCandidate } from "../release/service.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { RuntimeStore } from "../state/runtime-store.ts";

export type CoordinatorRoute =
  | "initialize"
  | "baseline_blocked"
  | "define"
  | "plan"
  | "founder_plan_approval"
  | "build"
  | "test"
  | "review"
  | "ship"
  | "founder_ship_approval"
  | "learn"
  | "resume_writer"
  | "observe_pipeline"
  | "repair";

export interface WorkerRecommendation {
  readonly mode: "single_agent" | "pipeline_eligible" | "pipeline_blocked_by_risk" | "pipeline_unavailable";
  readonly reason: string;
  readonly eligibleSliceIds: readonly string[];
}

export interface CoordinatorSnapshot {
  readonly initialized: boolean;
  readonly lifecycle?: string;
  readonly revision?: number;
  readonly route: CoordinatorRoute;
  readonly reason: string;
  readonly baselineReady: boolean;
  readonly activeWriter: boolean;
  readonly activePipeline: boolean;
  readonly candidateStatus?: string | undefined;
  readonly workerRecommendation: WorkerRecommendation;
}

const ACTIVE_PIPELINE_STATUSES = new Set(["approved", "running", "paused", "blocked", "candidate_ready", "stale_candidate"]);
const HIGH_RISK = new Set<Risk>(["high", "critical"]);

export function recommendWorkerDelegation(slices: readonly WorkSlice[]): WorkerRecommendation {
  const ready = slices.filter((slice) => slice.dependsOn.length === 0);
  if (ready.length < 2) return { mode: "single_agent", reason: "Fewer than two dependency-ready slices are available.", eligibleSliceIds: ready.map((slice) => slice.id) };
  const highRisk = ready.filter((slice) => HIGH_RISK.has(slice.risk));
  if (highRisk.length) {
    return { mode: "pipeline_blocked_by_risk", reason: `High-risk approval is required for: ${highRisk.map((slice) => slice.id).join(", ")}.`, eligibleSliceIds: ready.filter((slice) => !HIGH_RISK.has(slice.risk)).map((slice) => slice.id) };
  }
  return { mode: "pipeline_eligible", reason: "Multiple independent low/medium-risk slices are ready; pipeline dispatch may be proposed when the founder asks to build or parallelize.", eligibleSliceIds: ready.map((slice) => slice.id) };
}

function unavailableRecommendation(reason: string): WorkerRecommendation {
  return { mode: "pipeline_unavailable", reason, eligibleSliceIds: [] };
}

function lifecycleRoute(lifecycle: string): { route: CoordinatorRoute; reason: string } {
  switch (lifecycle) {
    case "idea": return { route: "define", reason: "Product definition is the next valid lifecycle step." };
    case "defined": return { route: "plan", reason: "The defined product needs a frozen implementation plan." };
    case "planned": return { route: "founder_plan_approval", reason: "The plan is frozen and requires founder approval before implementation." };
    case "plan_approved": return { route: "build", reason: "Implementation may begin only against the approved work graph." };
    case "building": return { route: "build", reason: "Continue the approved implementation path or inspect its writer receipt." };
    case "built": return { route: "test", reason: "Built source needs focused behavioral verification." };
    case "testing": return { route: "test", reason: "Continue bounded diagnosis, repair, and verification." };
    case "tested":
    case "reviewing": return { route: "review", reason: "The exact tested commit needs an evidence-linked review verdict." };
    case "review_passed":
    case "candidate_verified": return { route: "ship", reason: "The reviewed candidate can proceed through fresh release verification." };
    case "ready_for_ship_approval": return { route: "founder_ship_approval", reason: "The exact candidate requires founder promotion approval." };
    case "promoted": return { route: "ship", reason: "Create the explicit manual TestFlight handoff package." };
    case "testflight_handoff": return { route: "learn", reason: "Use delivery evidence and feedback to choose the next bet." };
    default: return { route: "repair", reason: "Lifecycle is interrupted or requires a bounded repair decision." };
  }
}

export function isLikelyPiIosIntent(prompt: string): boolean {
  return /\b(ios|iphone|ipad|swiftui|swiftdata|testflight|app\s+(idea|build|beta)|build\s+(an|my)\s+app|product\s+idea)\b|ý tưởng\s*(app|ứng dụng)|xây\s*(app|ứng dụng)|làm\s*(app|ứng dụng)|tiếp tục/i.test(prompt);
}

export async function inspectCoordinator(repository: RepositoryDescriptor, piSessionId: string): Promise<CoordinatorSnapshot> {
  const runtime = await new RuntimeStore(repository).status();
  if (!runtime) {
    return { initialized: false, route: "initialize", reason: "Pi iOS runtime is not initialized for this trusted project.", baselineReady: false, activeWriter: false, activePipeline: false, workerRecommendation: unavailableRecommendation("Initialize runtime before planning or implementation.") };
  }

  const config = await loadConfig(repository.primaryRoot);
  const baseline = await inspectBaseline(repository, config);
  const registry = new SessionRegistry(repository);
  const sessions = Object.values((await registry.load()).sessions);
  const activeWriter = sessions.some((session) => session.status === "active" || session.status === "ready_for_integration");
  const pipelines = await new PipelineStore(repository).list();
  const activePipeline = pipelines.some((pipeline) => ACTIVE_PIPELINE_STATUSES.has(pipeline.status));
  const candidate = await loadCandidate(repository);

  if (!baseline.ready) {
    return { initialized: true, lifecycle: runtime.lifecycle, revision: runtime.revision, route: "baseline_blocked", reason: baseline.problems.join("; "), baselineReady: false, activeWriter, activePipeline, candidateStatus: candidate?.status, workerRecommendation: unavailableRecommendation("Restore a clean, valid Git baseline before coordinator work.") };
  }
  if (activeWriter) {
    return { initialized: true, lifecycle: runtime.lifecycle, revision: runtime.revision, route: "resume_writer", reason: "An authorized writer session already owns active work.", baselineReady: true, activeWriter: true, activePipeline, candidateStatus: candidate?.status, workerRecommendation: unavailableRecommendation("Do not start overlapping work while a writer session is active or awaiting integration.") };
  }
  if (activePipeline) {
    return { initialized: true, lifecycle: runtime.lifecycle, revision: runtime.revision, route: "observe_pipeline", reason: "A pipeline already owns the approved graph; inspect, reconcile, resume, or pause it instead of creating another.", baselineReady: true, activeWriter: false, activePipeline: true, candidateStatus: candidate?.status, workerRecommendation: unavailableRecommendation("Existing pipeline ownership prevents duplicate dispatch.") };
  }

  const route = lifecycleRoute(runtime.lifecycle);
  let workerRecommendation = unavailableRecommendation("Worker dispatch is available only after plan approval with a current work graph.");
  if (runtime.lifecycle === "plan_approved") {
    try {
      const product = await loadDefinedProduct(repository.primaryRoot, config.documents);
      const graph = await loadWorkGraph(repository.primaryRoot, config.documents.workGraph, product.fingerprint);
      workerRecommendation = recommendWorkerDelegation(graph.graph.slices);
    } catch {
      workerRecommendation = unavailableRecommendation("The approved product and work graph must be readable and current before worker dispatch can be considered.");
    }
  }

  return { initialized: true, lifecycle: runtime.lifecycle, revision: runtime.revision, route: route.route, reason: route.reason, baselineReady: true, activeWriter: false, activePipeline: false, candidateStatus: candidate?.status, workerRecommendation };
}
