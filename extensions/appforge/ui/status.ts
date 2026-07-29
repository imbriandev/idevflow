import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
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
  if (!state.stage) {
    return "Pi iOS is idle. Start with /ios:define or inspect an existing app with /ios:plan.";
  }
  const contract = STAGE_CONTRACTS[state.stage];
  const request = state.request?.trim() || "(no explicit request)";
  return [
    `Stage: ${state.stage}`,
    `Purpose: ${contract.purpose}`,
    `Request: ${request}`,
    `Started: ${state.startedAt ?? "unknown"}`,
    `Next: ${contract.defaultNext}`,
  ].join("\n");
}
