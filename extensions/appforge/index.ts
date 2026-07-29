import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerStageCommands } from "./commands/register-stage-commands.ts";
import { STAGE_CONTRACTS } from "./lifecycle/contracts.ts";
import {
  emptySessionState,
  restoreSessionState,
  type SessionState,
} from "./state/session-state.ts";
import { formatDashboard, updateStatus } from "./ui/status.ts";

export default function piIosExtension(pi: ExtensionAPI): void {
  let state: SessionState = emptySessionState();

  registerStageCommands(
    pi,
    () => state,
    (next) => {
      state = next;
    },
  );

  pi.registerCommand("ios", {
    description: "Show Pi iOS workflow status and recommended next action",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatDashboard(state), "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    state = restoreSessionState(ctx);
    updateStatus(ctx, state);
  });

  pi.on("before_agent_start", async () => {
    if (!state.stage) return;
    const contract = STAGE_CONTRACTS[state.stage];
    return {
      message: {
        customType: "pi-ios-stage-contract",
        content: `Active Pi iOS stage: ${state.stage}. ${contract.purpose} Forbidden actions: ${contract.forbidden.join("; ")}. Deterministic gates remain authoritative.`,
        display: false,
      },
    };
  });
}
