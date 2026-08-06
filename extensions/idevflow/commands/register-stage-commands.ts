import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { STAGES, STAGE_CONTRACTS, type Stage } from "../lifecycle/contracts.ts";
import {
  persistSessionState,
  type SessionState,
} from "../state/session-state.ts";
import { updateStatus } from "../ui/status.ts";

export type StateReader = () => SessionState;
export type StateWriter = (state: SessionState) => void;

function kickoffPrompt(stage: Stage, request: string): string {
  return `[IDEVFLOW:${stage}] Follow idev-${stage}.\nRequest: ${request || "Find the narrowest responsible task."}\nUse kernel evidence; do not claim a gate passed from prose.`;
}

async function dispatchPrompt(pi: ExtensionAPI, ctx: ExtensionContext, prompt: string): Promise<void> {
  if (ctx.isIdle()) {
    pi.sendUserMessage(prompt);
    return;
  }
  pi.sendUserMessage(prompt, { deliverAs: "followUp" });
}

export function registerStageCommands(
  pi: ExtensionAPI,
  readState: StateReader,
  writeState: StateWriter,
): void {
  for (const stage of STAGES) {
    const contract = STAGE_CONTRACTS[stage];
    pi.registerCommand(contract.command, {
      description: contract.purpose,
      handler: async (args, ctx) => {
        const state: SessionState = {
          schemaVersion: 1,
          stage,
          request: args.trim(),
          startedAt: new Date().toISOString(),
        };
        writeState(state);
        persistSessionState(pi, state);
        updateStatus(ctx, readState());
        await dispatchPrompt(pi, ctx, kickoffPrompt(stage, state.request ?? ""));
      },
    });
  }
}
