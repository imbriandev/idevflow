import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { discoverRepository } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { blockPipelineWorker, heartbeatPipelineWorker, reportWorkerRepair, submitPipelineWorker } from "../workers/service.ts";

export function registerPipelineWorkerTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_pipeline_worker",
    label: "Pi iOS Pipeline Worker",
    description: "Report heartbeat, bounded repair, block evidence, or exact completion from an isolated Pi iOS worker process.",
    parameters: Type.Object({
      action: StringEnum(["heartbeat", "repair", "block", "submit"] as const),
      evidence: Type.Optional(Type.String()),
      verificationFingerprint: Type.Optional(Type.String()),
      verdictJson: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      if (!process.env.PI_IOS_WORKER_PACKET) throw new SafetyKernelError("pi_ios_pipeline_worker is available only inside an authorized worker process");
      const repository = await discoverRepository(ctx.cwd);
      const piSessionId = ctx.sessionManager.getSessionId();
      if (params.action === "heartbeat") {
        await heartbeatPipelineWorker(repository, piSessionId);
        return { content: [{ type: "text", text: "Worker and writer leases refreshed." }], details: { heartbeat: true } };
      }
      if (params.action === "repair") {
        const result = await reportWorkerRepair(repository, piSessionId, params.evidence ?? "");
        return { content: [{ type: "text", text: result.allowed ? `Repair cycle ${result.repairCycles}/${result.maximum} authorized.` : `Repair budget exhausted at ${result.repairCycles}/${result.maximum}; stop.` }], details: result };
      }
      if (params.action === "block") {
        await blockPipelineWorker(repository, piSessionId, params.evidence ?? "");
        return { content: [{ type: "text", text: "Worker block evidence recorded; source worktree preserved." }], details: { blocked: true } };
      }
      let verdict: unknown;
      try { verdict = JSON.parse(params.verdictJson ?? ""); } catch (error) { throw new SafetyKernelError("verdictJson must be valid JSON", { cause: error }); }
      const receipts = await submitPipelineWorker(repository, piSessionId, params.verificationFingerprint ?? "", verdict);
      return { content: [{ type: "text", text: `Build/test/review receipts submitted for ${receipts.test.sourceCommit}. Integration authority remains with the coordinator.` }], details: { receipts }, terminate: true };
    },
  });
}
