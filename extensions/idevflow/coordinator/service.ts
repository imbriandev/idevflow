import { loadConfig } from "../config/config.ts";
import { inspectBaseline } from "../git/baseline.ts";
import type { Stage } from "../lifecycle/contracts.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { hasExistingAppleProject, isExistingProjectAdopted, loadExistingProjectAdoption } from "../recovery/existing-project.ts";

export type CoordinatorRoute =
  | "initialize"
  | "baseline_blocked"
  | "define"
  | "existing_audit"
  | "existing_continuation"
  | "plan"
  | "founder_plan_approval"
  | "build"
  | "test"
  | "review"
  | "ship"
  | "founder_ship_approval"
  | "maintenance"
  | "learn"
  | "resume_writer"
  | "integrate_writer"
  | "repair";

export interface FounderStatus {
  readonly stage: string;
  readonly blocked: string;
  readonly choices: readonly string[];
  /** Plain-language explanation of the current checkpoint. */
  readonly meaning: string;
  /** A natural-language request the founder can send without knowing a command or tool. */
  readonly suggestedRequest: string;
}

export interface CoordinatorSnapshot {
  readonly initialized: boolean;
  readonly lifecycle?: string;
  readonly revision?: number;
  readonly route: CoordinatorRoute;
  readonly reason: string;
  readonly baselineReady: boolean;
  readonly activeWriter: boolean;
  /** Internal routing only; never render task or worktree details. */
  readonly activeWriterStage?: Stage;
  readonly integrationReadyStage?: string;
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
    case "promoted": return { route: "ship", reason: "Archive, export, and upload the exact approved internal beta." };
    case "testflight_handoff": return { route: "maintenance", reason: "The product is shipped. Record learning, or explicitly start a narrow maintenance loop for a bug or change." };
    default: return { route: "repair", reason: "Lifecycle is interrupted or requires a bounded repair decision." };
  }
}

export function founderStatus(snapshot: CoordinatorSnapshot): FounderStatus {
  const stage: Record<CoordinatorRoute, string> = {
    initialize: "Set up iDevFlow", baseline_blocked: "Project needs attention", define: "Shape the app", existing_audit: "Assess existing app", existing_continuation: "Choose current outcome", plan: "Plan the build", founder_plan_approval: "Approve the build plan", build: "Build the app", test: "Prove the behavior", review: "Review the evidence", ship: "Prepare TestFlight beta", founder_ship_approval: "Approve beta upload", maintenance: "Improve the shipped app", learn: "Learn from feedback", resume_writer: "Continue work", integrate_writer: "Choose completed work", repair: "Recover workflow",
  };
  const choices: Partial<Record<CoordinatorRoute, readonly string[]>> = {
    existing_audit: ["Assess this app"],
    existing_continuation: ["Fix a problem", "Validate release readiness", "Build a feature"],
    integrate_writer: ["Accept it", "Repair it", "Keep it and start over"],
    maintenance: ["Record feedback", "Fix a problem", "Plan a change"],
    founder_plan_approval: ["Approve the plan", "Revise the plan"],
    founder_ship_approval: ["Approve handoff preparation", "Keep working"],
    baseline_blocked: ["Fix project changes", "See technical details"],
    resume_writer: ["Continue work", "See progress"],
  };
  const guidance: Record<CoordinatorRoute, Pick<FounderStatus, "meaning" | "suggestedRequest">> = {
    initialize: {
      meaning: "iDevFlow has not set up its local project notebook yet. This does not change your app source.",
      suggestedRequest: "Set up iDevFlow for this project, then help me define the app.",
    },
    baseline_blocked: {
      meaning: "There are local source changes that could be mixed into new work. Decide what to keep before starting another change.",
      suggestedRequest: "Show me the project changes and recommend the safest next step.",
    },
    define: {
      meaning: "Agree on the smallest useful app outcome before spending time building it.",
      suggestedRequest: "Help me define the smallest complete first version of this app.",
    },
    existing_audit: {
      meaning: "Your app already has code. First inspect its current health without changing anything.",
      suggestedRequest: "Assess this existing app and explain the highest-priority issues in plain language.",
    },
    existing_continuation: {
      meaning: "Choose one immediate outcome so the next work stays focused.",
      suggestedRequest: "I want to fix a problem in the current app.",
    },
    plan: {
      meaning: "Turn the agreed outcome into a small, reviewable build plan.",
      suggestedRequest: "Plan the smallest safe way to build the defined app outcome.",
    },
    founder_plan_approval: {
      meaning: "The build plan is ready. This checkpoint prevents the app from being changed against a plan you have not seen.",
      suggestedRequest: "Explain the plan in plain language, including trade-offs, then let me approve or revise it.",
    },
    build: {
      meaning: "The agreed work can now be implemented and checked in an isolated workspace.",
      suggestedRequest: "Build the next approved slice and keep me updated in plain language.",
    },
    test: {
      meaning: "Prove the behavior works before treating the change as complete.",
      suggestedRequest: "Test the current change and explain any failure and its next step simply.",
    },
    review: {
      meaning: "Review the tested change for user impact and technical risk before preparing a beta.",
      suggestedRequest: "Review this change and give me a clear go, fix, or defer recommendation.",
    },
    ship: {
      meaning: "Prepare a verified internal beta. Uploading requires one separate approval; choosing testers remains manual.",
      suggestedRequest: "Prepare this version for internal TestFlight and show me the exact beta candidate.",
    },
    founder_ship_approval: {
      meaning: "The exact beta candidate is ready for your approval. This prevents a different commit from being uploaded by accident.",
      suggestedRequest: "Summarize what will be uploaded, known risks, and the remaining tester steps before I approve it.",
    },
    maintenance: {
      meaning: "The app has been handed off. Start a small maintenance loop only for a concrete bug or change.",
      suggestedRequest: "I need to fix this user-visible problem: [describe what the user sees].",
    },
    learn: {
      meaning: "Use feedback to choose the next small bet rather than building every request.",
      suggestedRequest: "Here is feedback from users: [paste it]. Help me decide what to do now, later, or not at all.",
    },
    resume_writer: {
      meaning: "A build is already in progress. Continue or inspect that work before starting something overlapping.",
      suggestedRequest: "Show me the progress of the current work and what decision, if any, you need from me.",
    },
    integrate_writer: {
      meaning: "Completed work is waiting for your product decision: accept it, repair it, or keep it aside.",
      suggestedRequest: "Summarize the completed work, evidence, and any risks so I can choose accept, repair, or keep it aside.",
    },
    repair: {
      meaning: "The workflow needs a small recovery decision before it can safely continue.",
      suggestedRequest: "Explain what needs recovery in plain language and recommend the safest next action.",
    },
  };
  const blocked = snapshot.route === "baseline_blocked"
    ? "Uncommitted product changes need attention before a new build starts."
    : snapshot.route === "resume_writer"
      ? "Another build is already in progress."
      : snapshot.route === "integrate_writer"
        ? `Completed ${snapshot.integrationReadyStage ?? "work"} needs your decision.`
        : snapshot.reason;
  return {
    stage: stage[snapshot.route],
    blocked,
    choices: choices[snapshot.route] ?? ["Continue"],
    ...guidance[snapshot.route],
  };
}

export function stageForRoute(route: CoordinatorRoute): Stage | undefined {
  return route === "define" || route === "plan" || route === "build" || route === "test" || route === "review" || route === "ship" || route === "learn" ? route : undefined;
}

export function isLikelyiDevFlowIntent(prompt: string): boolean {
  return /\b(ios|macos|iphone|ipad|swiftui|swiftdata|testflight|app\s+(idea|build|beta)|build\s+(an|my)\s+app|product\s+idea)\b|ý tưởng\s*(app|ứng dụng)|xây\s*(app|ứng dụng)|làm\s*(app|ứng dụng)|tiếp tục/i.test(prompt);
}

export async function inspectCoordinator(repository: RepositoryDescriptor, _piSessionId: string): Promise<CoordinatorSnapshot> {
  const runtime = await new RuntimeStore(repository).status();
  if (!runtime) return { initialized: false, route: "initialize", reason: "iDevFlow runtime is not initialized for this trusted project.", baselineReady: false, activeWriter: false };
  const config = await loadConfig(repository.primaryRoot);
  const baseline = await inspectBaseline(repository, config);
  const sessions = Object.values((await new SessionRegistry(repository).load()).sessions);
  const activeSession = sessions.filter((session) => session.status === "active").sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const integrationReady = sessions.filter((session) => session.status === "ready_for_integration").sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const common = { initialized: true, lifecycle: runtime.lifecycle, revision: runtime.revision };
  if (runtime.lifecycle === "idea" && !activeSession && !integrationReady && await hasExistingAppleProject(repository.primaryRoot) && !await isExistingProjectAdopted(repository)) return { ...common, route: "existing_audit", reason: "An existing Apple-platform project was detected. Audit it read-only before defining or changing iDevFlow lifecycle state.", baselineReady: baseline.ready, activeWriter: false };
  if (!baseline.ready) return { ...common, route: "baseline_blocked", reason: baseline.problems.join("; "), baselineReady: false, activeWriter: Boolean(activeSession) };
  if (activeSession) return { ...common, route: "resume_writer", reason: "An authorized writer session already owns active work.", baselineReady: true, activeWriter: true, activeWriterStage: activeSession.stage, ...(integrationReady ? { integrationReadyStage: integrationReady.stage } : {}) };
  if (integrationReady) return { ...common, route: "integrate_writer", reason: `A completed ${integrationReady.stage} session is ready for founder-confirmed integration.`, baselineReady: true, activeWriter: false, integrationReadyStage: integrationReady.stage };
  const route = lifecycleRoute(runtime.lifecycle);
  if (runtime.lifecycle === "idea" && await hasExistingAppleProject(repository.primaryRoot)) {
    const adoption = await loadExistingProjectAdoption(repository.primaryRoot);
    if (!adoption?.continuation) return { ...common, route: "existing_continuation", reason: "The current project audit is adopted. The founder must choose one outcome: repair, release validation, or feature work.", baselineReady: true, activeWriter: false };
    return { ...common, route: "define", reason: `Define the current product state for ${adoption.continuation.disposition.replaceAll("_", " ")}: ${adoption.continuation.outcome}`, baselineReady: true, activeWriter: false };
  }
  return { ...common, route: route.route, reason: route.reason, baselineReady: true, activeWriter: false };
}
