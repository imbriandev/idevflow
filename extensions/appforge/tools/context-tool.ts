import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { KNOWLEDGE_SURFACES, selectKnowledge } from "../context/knowledge.ts";
import { recordContextReceipt } from "../context/receipts.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { STAGES } from "../lifecycle/contracts.ts";

export function registerContextTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_context",
    label: "Pi iOS Specialist Context",
    description: "Select a bounded, stage- and surface-specific set of Pi iOS specialist references without loading unrelated context.",
    promptSnippet: "Select bounded specialist iOS references before complex implementation or review",
    promptGuidelines: ["Use pi_ios_context before loading specialist references for SwiftUI, SwiftData, concurrency, testing, accessibility, privacy, monetization, release, widgets, or App Intents work; read only the returned paths that apply."],
    parameters: Type.Object({
      stage: StringEnum(STAGES),
      risk: StringEnum(["low", "medium", "high", "critical"] as const),
      task: Type.String({ minLength: 1 }),
      surfaces: Type.Optional(Type.Array(StringEnum(KNOWLEDGE_SURFACES))),
    }),
    async execute(_id, parameters, _signal, _update, ctx) {
      const selection = selectKnowledge(parameters);
      let receipt;
      if (ctx.isProjectTrusted()) {
        const repository = await discoverRepository(ctx.cwd);
        const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
        if (session && ["active", "ready_for_integration", "integrated"].includes(session.status)) {
          const stageMatches = parameters.stage === session.stage || (parameters.stage === "review" && session.status !== "active") || (parameters.stage === "ship" && session.status !== "active");
          if (!stageMatches) throw new SafetyKernelError(`Context stage ${parameters.stage} does not match current session stage ${session.stage}`);
          if (parameters.stage === "ship" ? parameters.risk !== "critical" : parameters.risk !== session.risk) throw new SafetyKernelError("Context receipt risk must match the session, or be critical for ship");
          receipt = await recordContextReceipt(repository, { session, stage: parameters.stage, risk: parameters.risk, task: parameters.task, selection });
        }
      }
      const text = selection.references.length
        ? `Load specialist references (${selection.estimatedTokens}/${selection.budgetTokens} estimated tokens):\n${selection.references.map((reference) => `- ${reference.path} — ${reference.reason}`).join("\n")}`
        : "No specialist reference is required beyond the selected stage skill and deterministic kernel.";
      return { content: [{ type: "text", text: `${text}${receipt ? `\nRecorded context receipt ${receipt.id}.` : "\nNo eligible writer session; selection was not recorded."}` }], details: { ...selection, ...(receipt ? { receipt } : {}) } };
    },
  });
}
