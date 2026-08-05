import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../config/config.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { releaseSimulatorLease } from "../simulator/service.ts";
import { finishSession, heartbeatSession, receiptFingerprint, reopenCompletedSession, runPostflight } from "../sessions/service.ts";

export function registerSessionTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_session",
    label: "iDevFlow Session",
    description: "Inspect, heartbeat, park, postflight, or finish the current isolated iDevFlow writer session.",
    promptSnippet: "Manage iDevFlow writer heartbeat, postflight, and finish",
    promptGuidelines: [
      "Call idev_session postflight with concise evidence after all source changes and checks are complete.",
      "Call idev_session finish only after postflight and without modifying files afterward.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "heartbeat", "resume", "reopen", "park", "postflight", "finish"] as const),
      evidence: Type.Optional(Type.String()),
      verificationFingerprint: Type.Optional(Type.String()),
      message: Type.Optional(Type.String()),
      sessionId: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const registry = new SessionRegistry(repository);
      let session = await registry.findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (params.action === "reopen") {
        const ready = Object.values((await registry.load()).sessions).filter((candidate) => candidate.status === "ready_for_integration");
        session = params.sessionId ? ready.find((candidate) => candidate.id === params.sessionId) : ready.length === 1 ? ready[0] : undefined;
        if (!session) throw new SafetyKernelError("No unique completed session is available to reopen; provide sessionId when multiple sessions are ready");
        if (!ctx.isProjectTrusted() || !ctx.hasUI) throw new SafetyKernelError("Reopening a completed session requires a trusted project with interactive founder confirmation");
        const confirmed = await ctx.ui.confirm("Reopen completed session for repair?", "This preserves the completed commit as the new base, transfers writer ownership to this chat, and requires fresh postflight before integration.");
        if (!confirmed) return { content: [{ type: "text", text: "Completed-session reopen cancelled." }], details: { reopened: false } };
        session = await reopenCompletedSession(repository, session, ctx.sessionManager.getSessionId(), params.message ?? "integration validation requires repair");
      }
      if (!session) throw new SafetyKernelError("No current iDevFlow writer session");
      if (params.action === "resume") {
        if (session.status !== "parked" && session.status !== "stale") {
          throw new SafetyKernelError(`Only parked or stale sessions can resume; found ${session.status}`);
        }
        const resumed = await registry.resume(session, params.message?.trim() || "explicitly resumed by owning Pi session", `pi-session:${session.piSessionId}`);
        session = resumed.sessions[session.id]!;
        session = await heartbeatSession(repository, session, await loadConfig(repository.primaryRoot), true);
      } else if (params.action === "heartbeat") {
        session = await heartbeatSession(repository, session, await loadConfig(repository.primaryRoot));
      } else if (params.action === "park") {
        if (session.status !== "active" && session.status !== "postflight_passed") throw new SafetyKernelError(`Only active or postflight sessions can park; found ${session.status}`);
        await releaseSimulatorLease(repository, await loadConfig(repository.primaryRoot), session.id);
        const state = await registry.changeStatus(session.id, "parked", params.message?.trim() || "parked by owning Pi session", `pi-session:${session.piSessionId}`);
        session = state.sessions[session.id]!;
      } else if (params.action === "postflight") {
        const receipt = await runPostflight(repository, session, params.evidence ?? "", params.verificationFingerprint ?? "");
        return {
          content: [{ type: "text", text: `Postflight passed for ${receipt.changedFiles.length} changed file(s). Receipt ${receiptFingerprint(receipt)}.` }],
          details: { sessionId: session.id, receipt },
        };
      } else if (params.action === "finish") {
        const commit = await finishSession(repository, session, params.message ?? "");
        return {
          content: [{ type: "text", text: `Session ${session.id} committed as ${commit} and is ready for controlled integration.` }],
          details: { sessionId: session.id, commit, status: "ready_for_integration" },
        };
      }
      return {
        content: [{ type: "text", text: `Session ${session.id}: ${session.status}; lease ${session.leaseExpiresAt}; claims ${session.claims.join(", ")}.` }],
        details: { session },
      };
    },
  });
}
