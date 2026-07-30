import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../config/config.ts";
import { loadDefinedProduct, validateIdeaQuality } from "../documents/product.ts";
import { approvePlan, integrateCurrentStage, recordReview } from "../lifecycle/service.ts";
import { loadWorkGraph } from "../planning/work-graph.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { RuntimeStore } from "../state/runtime-store.ts";

export function registerLifecycleTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_lifecycle",
    label: "Pi iOS Lifecycle",
    description: "Integrate a completed single-agent stage, approve a frozen plan, or record a source-bound review verdict.",
    promptSnippet: "Advance deterministic define, plan, build, test, and review gates",
    promptGuidelines: [
      "Use integrate only after finish reports ready_for_integration; document and graph validation happens before integration.",
      "Plan approval requires interactive founder confirmation and is bound to the current graph and commit.",
      "A review pass requires current integration verification and a machine-readable verdict without high or critical findings.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "integrate", "approve_plan", "review"] as const),
      evidence: Type.Optional(Type.String()),
      verificationFingerprint: Type.Optional(Type.String()),
      verdictJson: Type.Optional(Type.String()),
      approvedBy: Type.Optional(Type.String()),
      sliceId: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      if (params.action === "status") {
        const state = await new RuntimeStore(repository).status();
        const sessions = Object.values((await new SessionRegistry(repository).load()).sessions).filter((session) => session.status === "integrated").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        let product: Awaited<ReturnType<typeof loadDefinedProduct>> | undefined;
        let graph: Awaited<ReturnType<typeof loadWorkGraph>> | undefined;
        const source = sessions[0]?.worktreePath;
        if (source) {
          const config = await loadConfig(repository.primaryRoot);
          product = await loadDefinedProduct(source, config.documents).catch(() => undefined);
          if (product) graph = await loadWorkGraph(source, config.documents.workGraph, product.fingerprint).catch(() => undefined);
        }
        return { content: [{ type: "text", text: state ? `Lifecycle ${state.lifecycle} at revision ${state.revision}${product ? `; product ${product.fingerprint}` : ""}${graph ? `; graph ${graph.fingerprint}` : ""}.` : "Pi iOS runtime is not initialized." }], details: { state, product, graph } };
      }
      if (!ctx.isProjectTrusted()) throw new SafetyKernelError("Lifecycle mutation is blocked in an untrusted project");
      if (params.action === "approve_plan") {
        if (!ctx.hasUI) throw new SafetyKernelError("Plan approval fails closed without interactive UI");
        const confirmed = await ctx.ui.confirm("Accept Plan & Continue?", "Approve the exact current work graph and integration commit for single-agent implementation?");
        if (!confirmed) return { content: [{ type: "text", text: "Plan approval cancelled." }], details: { approved: false } };
        const approval = await approvePlan(repository, params.approvedBy?.trim() || "founder");
        return { content: [{ type: "text", text: `Approved graph ${approval.graphFingerprint} at ${approval.planCommit}.` }], details: { approved: true, approval } };
      }
      if (params.action === "review") {
        let verdict: unknown;
        try { verdict = JSON.parse(params.verdictJson ?? ""); } catch (error) { throw new SafetyKernelError("verdictJson must be valid JSON", { cause: error }); }
        const receipt = await recordReview(repository, ctx.sessionManager.getSessionId(), params.verificationFingerprint ?? "", verdict);
        return { content: [{ type: "text", text: `Review passed for ${receipt.sourceCommit}; receipt ${receipt.id}.` }], details: { receipt } };
      }
      const registry = new SessionRegistry(repository);
      const session = await registry.findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (!session) throw new SafetyKernelError("No writer session is available for stage integration");
      let founderAcceptedAssumptionIds: readonly string[] = [];
      if (session.stage === "define") {
        const config = await loadConfig(repository.primaryRoot);
        const product = await loadDefinedProduct(session.worktreePath, config.documents);
        const quality = validateIdeaQuality(product.memory, product.slc);
        if (quality.unresolvedCriticalAssumptionIds.length) {
          if (!ctx.hasUI) throw new SafetyKernelError("Definition with unresolved high-impact assumptions fails closed without interactive founder confirmation");
          const confirmed = await ctx.ui.confirm(
            "Accept unresolved idea assumptions?",
            `Continue with the exact definition while these high-impact assumptions remain unproven: ${quality.unresolvedCriticalAssumptionIds.join(", ")}?`,
          );
          if (!confirmed) return { content: [{ type: "text", text: "Definition integration cancelled; unresolved assumptions remain open." }], details: { integrated: false, unresolvedCriticalAssumptionIds: quality.unresolvedCriticalAssumptionIds } };
          founderAcceptedAssumptionIds = quality.unresolvedCriticalAssumptionIds;
        }
      }
      const receipt = await integrateCurrentStage(repository, session, params.evidence ?? "", params.sliceId, founderAcceptedAssumptionIds);
      return { content: [{ type: "text", text: `Integrated ${receipt.stage} commit ${receipt.sourceCommit}; stage receipt ${receipt.id}.` }], details: { receipt } };
    },
  });
}
