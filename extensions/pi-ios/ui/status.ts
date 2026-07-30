import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CoordinatorSnapshot } from "../coordinator/service.ts";
import { STAGE_CONTRACTS } from "../lifecycle/contracts.ts";
import type { SessionState } from "../state/session-state.ts";

const STATUS_KEY = "pi-ios";

export function updateStatus(ctx: ExtensionContext, state: SessionState): void {
  if (!state.stage) {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Pi iOS · idle"));
    return;
  }
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", `Pi iOS · ${state.stage}`));
}

export function formatDashboard(state: SessionState): string {
  if (!state.stage) return "Pi iOS is idle.";
  const contract = STAGE_CONTRACTS[state.stage];
  return [`Stage override: ${state.stage}`, `Purpose: ${contract.purpose}`, `Next: ${contract.defaultNext}`].join("\n");
}

export function formatCoordinatorDashboard(snapshot: CoordinatorSnapshot): string {
  return [
    `Lifecycle: ${snapshot.lifecycle ?? "not initialized"}${snapshot.revision ? ` · r${snapshot.revision}` : ""}`,
    `Next safe action: ${snapshot.route}`,
    `Reason: ${snapshot.reason}`,
    `Baseline: ${snapshot.baselineReady ? "ready" : "blocked"}`,
    `Writer: ${snapshot.activeWriter ? "active" : "none"}`,
    `Pipeline: ${snapshot.activePipeline ? "active" : "none"}`,
    `Worker policy: ${snapshot.workerRecommendation.mode}`,
    ...(snapshot.candidateStatus ? [`Candidate: ${snapshot.candidateStatus}`] : []),
  ].join("\n");
}

export function updateCoordinatorStatus(ctx: ExtensionContext, snapshot: CoordinatorSnapshot): void {
  const lifecycle = snapshot.lifecycle ?? "setup";
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", `Pi iOS · ${lifecycle} → ${snapshot.route}`));
}
