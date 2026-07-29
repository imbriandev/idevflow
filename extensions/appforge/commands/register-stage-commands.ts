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
  const contract = STAGE_CONTRACTS[stage];
  return `[PI IOS STAGE: ${stage.toUpperCase()}]\n\nRead and follow the available \`ios-${stage}\` skill before acting.\n\nFounder request:\n${request || "Inspect the trusted project and determine the narrowest responsible task for this stage."}\n\nContract:\n- Purpose: ${contract.purpose}\n- Required evidence: ${contract.requiredEvidence.join("; ")}\n- Forbidden: ${contract.forbidden.join("; ")}\n- Default next route: ${contract.defaultNext}\n\nFor non-trivial iOS product, SwiftUI, persistence, concurrency, testing, privacy, monetization, accessibility, performance, widget, App Intent, audit, or release work, call \`pi_ios_context\` with this stage, risk, task, and relevant surfaces before loading specialist references. Read only returned references.\n\nDo not claim a deterministic gate has passed unless a Pi iOS kernel tool provides that result.`;
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
