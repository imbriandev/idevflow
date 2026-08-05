import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { founderStatus, type CoordinatorSnapshot } from "../coordinator/service.ts";
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
  const founder = founderStatus(snapshot);
  return [
    `iDevFlow · ${founder.stage}`,
    `What this means: ${founder.meaning}`,
    `Current checkpoint: ${founder.blocked}`,
    `Your choices: ${founder.choices.join(" · ")}`,
    `You can say: “${founder.suggestedRequest}”`,
    ...(snapshot.candidateStatus ? [`Handoff: ${snapshot.candidateStatus}`] : []),
    "Ask for technical details only if you want them.",
  ].join("\n");
}

export function updateCoordinatorStatus(ctx: ExtensionContext, snapshot: CoordinatorSnapshot): void {
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", `iDevFlow · ${founderStatus(snapshot).stage}`));
}
