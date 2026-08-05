import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CoordinatorSnapshot } from "../coordinator/service.ts";
import { STAGE_CONTRACTS } from "../lifecycle/contracts.ts";
import type { SessionState } from "../state/session-state.ts";

const STATUS_KEY = "idevflow";

export function updateStatus(ctx: ExtensionContext, state: SessionState): void {
  if (!state.stage) {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "iDevFlow · idle"));
    return;
  }
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", `iDevFlow · ${state.stage}`));
}

export function formatDashboard(state: SessionState): string {
  if (!state.stage) return "iDevFlow is idle.";
  const contract = STAGE_CONTRACTS[state.stage];
  return [`Stage override: ${state.stage}`, `Purpose: ${contract.purpose}`, `Next: ${contract.defaultNext}`].join("\n");
}

export function formatCoordinatorDashboard(snapshot: CoordinatorSnapshot): string {
  const next = snapshot.route === "existing_audit" ? "Audit existing project (read-only)" : snapshot.route === "maintenance" ? "Record learning or start maintenance" : snapshot.route.replaceAll("_", " ");
  return [
    ...(snapshot.route === "existing_audit" ? ["Existing project detected · not yet adopted"] : []),
    `Lifecycle: ${snapshot.lifecycle ?? "not initialized"}${snapshot.revision ? ` · r${snapshot.revision}` : ""}`,
    `Next safe action: ${next}`,
    `Reason: ${snapshot.reason}`,
    `Baseline: ${snapshot.baselineReady ? "ready" : "blocked"}`,
    `Writer: ${snapshot.activeWriter ? "active" : "none"}`,
    `Pipeline: ${snapshot.activePipeline ? "active" : "none"}`,
    `Platforms: ${snapshot.requiredPlatforms?.map((platform) => `${platform}=${snapshot.platformStatus?.[platform] ?? "missing"}`).join(", ") ?? "not configured"}`,
    `Worker policy: ${snapshot.workerRecommendation.mode}`,
    ...(snapshot.route === "existing_audit" ? ["Run: idev_doctor audit · then confirm: idev_runtime adopt_existing"] : []),
    ...(snapshot.route === "maintenance" ? ["For a bug/change: idev_lifecycle start_maintenance with its user-visible impact"] : []),
    ...(snapshot.candidateStatus ? [`Candidate: ${snapshot.candidateStatus}`] : []),
  ].join("\n");
}

export function updateCoordinatorStatus(ctx: ExtensionContext, snapshot: CoordinatorSnapshot): void {
  const lifecycle = snapshot.lifecycle ?? "setup";
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", `iDevFlow · ${lifecycle} → ${snapshot.route}`));
}
