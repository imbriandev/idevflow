import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { PipelineService } from "../pipeline/service.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";

export function registerPipelineTool(pi: ExtensionAPI, extensionPath: string): void {
  pi.registerTool({
    name: "pi_ios_pipeline",
    label: "Pi iOS Pipeline",
    description: "Create, run, reconcile, pause, approve risk, or cancel the bounded multi-agent work-graph pipeline.",
    promptSnippet: "Coordinate isolated Pi workers and integration epochs",
    promptGuidelines: [
      "Use pi_ios_pipeline create only for the exact approved plan, then run dependency-ready workers under bounded concurrency.",
      "Use pi_ios_pipeline reconcile after reload or interruption; never infer worker completion from prose or process exit alone.",
      "High and critical slices require interactive risk approval. Only the coordinator can integrate worker receipts.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "create", "run", "reconcile", "approve_risk", "retry_slice", "pause", "resume", "takeover", "cancel"] as const),
      pipelineId: Type.Optional(Type.String()),
      sliceId: Type.Optional(Type.String()),
      reason: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      if (process.env.PI_IOS_WORKER_PACKET) throw new SafetyKernelError("Pipeline workers cannot invoke coordinator operations");
      const repository = await discoverRepository(ctx.cwd);
      const service = new PipelineService(repository, extensionPath);
      const piSessionId = ctx.sessionManager.getSessionId();
      if (params.action === "status") {
        const result = await service.status(params.pipelineId);
        return { content: [{ type: "text", text: result.pipelines.length ? result.pipelines.map((pipeline) => `${pipeline.id}: ${pipeline.status} r${pipeline.revision}; ${Object.values(pipeline.slices).filter((slice) => slice.status === "integrated").length}/${Object.keys(pipeline.slices).length} integrated`).join("\n") : "No pipelines." }], details: result };
      }
      if (!ctx.isProjectTrusted()) throw new SafetyKernelError("Pipeline operations require a trusted project");
      const id = params.pipelineId?.trim();
      if (!id) throw new SafetyKernelError("pipelineId is required");
      if (params.action === "create") {
        const pipeline = await service.create(id, piSessionId);
        return { content: [{ type: "text", text: `Pipeline ${id} created at epoch ${pipeline.integrationEpoch} with ${Object.keys(pipeline.slices).length} slices.` }], details: { pipeline } };
      }
      if (params.action === "run") {
        const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
        const pipeline = await service.run(id, piSessionId, { ...(model ? { model } : {}), ...(ctx.thinkingLevel ? { thinkingLevel: ctx.thinkingLevel } : {}), ...(signal ? { signal } : {}), onProgress: (message) => { onUpdate?.({ content: [{ type: "text", text: message }], details: { pipelineId: id, running: true } }); } });
        return { content: [{ type: "text", text: `Pipeline ${id}: ${pipeline.status}; ${Object.values(pipeline.slices).filter((slice) => slice.status === "integrated").length}/${Object.keys(pipeline.slices).length} integrated.` }], details: { pipeline } };
      }
      if (params.action === "reconcile") {
        const pipeline = await service.reconcile(id, piSessionId);
        return { content: [{ type: "text", text: `Pipeline ${id} reconciled at revision ${pipeline.revision}: ${pipeline.status}.` }], details: { pipeline } };
      }
      if (params.action === "approve_risk") {
        if (!params.sliceId) throw new SafetyKernelError("sliceId is required for risk approval");
        if (!ctx.hasUI) throw new SafetyKernelError("High-risk slice approval fails closed without interactive UI");
        const confirmed = await ctx.ui.confirm("Approve high-risk pipeline slice?", `Pipeline ${id}, slice ${params.sliceId}. This authorizes isolated implementation only, never integration or release authority.`);
        if (!confirmed) return { content: [{ type: "text", text: "Risk approval cancelled." }], details: { approved: false } };
        const pipeline = await service.approveRisk(id, params.sliceId, piSessionId);
        return { content: [{ type: "text", text: `Approved implementation risk for ${params.sliceId}.` }], details: { approved: true, pipeline } };
      }
      if (params.action === "retry_slice") {
        if (!params.sliceId) throw new SafetyKernelError("sliceId is required for worker retry");
        if (!ctx.hasUI) throw new SafetyKernelError("Worker retry fails closed without interactive UI");
        const confirmed = await ctx.ui.confirm("Retry lost pipeline slice?", "A fresh worker and worktree will start; prior unintegrated source remains preserved for diagnosis.");
        if (!confirmed) return { content: [{ type: "text", text: "Worker retry cancelled." }], details: { retried: false } };
        const pipeline = await service.retrySlice(id, params.sliceId, piSessionId, params.reason ?? "");
        return { content: [{ type: "text", text: `Slice ${params.sliceId} returned to pending with preserved prior source.` }], details: { retried: true, pipeline } };
      }
      if (params.action === "takeover") {
        if (!ctx.hasUI) throw new SafetyKernelError("Coordinator takeover fails closed without interactive UI");
        const confirmed = await ctx.ui.confirm("Take over expired pipeline coordinator?", params.reason ?? "No reason provided");
        if (!confirmed) return { content: [{ type: "text", text: "Coordinator takeover cancelled." }], details: { takenOver: false } };
        const pipeline = await service.takeover(id, piSessionId, params.reason ?? "");
        return { content: [{ type: "text", text: `Coordinator lease for ${id} transferred to this Pi session.` }], details: { takenOver: true, pipeline } };
      }
      if (params.action === "cancel") {
        if (!ctx.hasUI) throw new SafetyKernelError("Pipeline cancellation fails closed without interactive UI");
        const confirmed = await ctx.ui.confirm("Cancel pipeline and stop workers?", "Worker worktrees and unintegrated source will be preserved.");
        if (!confirmed) return { content: [{ type: "text", text: "Pipeline cancellation cancelled." }], details: { cancelled: false } };
        const pipeline = await service.cancel(id, piSessionId, params.reason ?? "");
        return { content: [{ type: "text", text: `Pipeline ${id} cancelled; source preserved.` }], details: { cancelled: true, pipeline } };
      }
      const pipeline = params.action === "pause" ? await service.pause(id, piSessionId, params.reason ?? "") : await service.resume(id, piSessionId, params.reason ?? "");
      return { content: [{ type: "text", text: `Pipeline ${id}: ${pipeline.status}.` }], details: { pipeline } };
    },
  });
}
