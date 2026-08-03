import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../config/config.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { finishSession, heartbeatSession, receiptFingerprint, runPostflight } from "../sessions/service.ts";

export function registerSessionTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "canopy_session",
    label: "Canopy Session",
    description: "Inspect, heartbeat, park, postflight, or finish the current isolated Canopy writer session.",
    promptSnippet: "Manage Canopy writer heartbeat, postflight, and finish",
    promptGuidelines: [
      "Call canopy_session postflight with concise evidence after all source changes and checks are complete.",
      "Call canopy_session finish only after postflight and without modifying files afterward.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "heartbeat", "resume", "park", "postflight", "finish"] as const),
      evidence: Type.Optional(Type.String()),
      verificationFingerprint: Type.Optional(Type.String()),
      message: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const registry = new SessionRegistry(repository);
      let session = await registry.findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (!session) throw new SafetyKernelError("No current Canopy writer session");
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
