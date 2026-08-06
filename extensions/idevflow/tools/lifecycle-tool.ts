import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../config/config.ts";
import { loadDefinedProduct } from "../documents/product.ts";
import { approvePlan, definitionAcceptance, integrateCurrentStage, recordReview, startMaintenance, startTestRepair } from "../lifecycle/service.ts";
import { loadWorkGraph } from "../planning/work-graph.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { RuntimeStore } from "../state/runtime-store.ts";

export function selectIntegrationSession(sessions: readonly WriterSession[], piSessionId: string, requestedSessionId?: string): WriterSession | undefined {
  const ready = sessions.filter((session) => session.status === "ready_for_integration");
  if (requestedSessionId) return ready.find((session) => session.id === requestedSessionId);
  return ready.filter((session) => session.piSessionId === piSessionId).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
    ?? (ready.length === 1 ? ready[0] : undefined);
}

export function registerLifecycleTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_lifecycle",
    label: "iDevFlow Lifecycle",
    description: "Integrate a completed stage, start a bounded test repair, start maintenance, approve a frozen plan, or record a source-bound review verdict.",
    promptSnippet: "Advance deterministic define, plan, build, test, and review gates",
    promptGuidelines: [
      "Use integrate only after finish reports ready_for_integration; document and graph validation happens before integration.",
      "Plan approval requires interactive founder confirmation and is bound to the current graph and commit.",
      "A review pass requires current integration verification and a machine-readable verdict without high or critical findings.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "integrate", "start_test_repair", "start_maintenance", "approve_plan", "review"] as const),
      evidence: Type.Optional(Type.String()),
      verificationFingerprint: Type.Optional(Type.String()),
      verdictJson: Type.Optional(Type.String()),
      approvedBy: Type.Optional(Type.String()),
      sliceId: Type.Optional(Type.String()),
      sessionId: Type.Optional(Type.String()),
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
        return { content: [{ type: "text", text: state ? `Lifecycle ${state.lifecycle} at revision ${state.revision}${product ? `; product ${product.fingerprint}` : ""}${graph ? `; graph ${graph.fingerprint}` : ""}.` : "iDevFlow runtime is not initialized." }], details: { state, product, graph } };
      }
      if (!ctx.isProjectTrusted()) throw new SafetyKernelError("Lifecycle mutation is blocked in an untrusted project");
      if (params.action === "start_test_repair") {
        const reason = params.evidence?.trim() ?? "";
        if (!reason) throw new SafetyKernelError("Test repair requires observed failing behavior or an external blocker");
        await startTestRepair(repository, ctx.sessionManager.getSessionId(), reason);
        return { content: [{ type: "text", text: "Test repair started. Reproduce, repair the narrowest cause, and integrate fresh evidence." }], details: { started: true } };
      }
      if (params.action === "start_maintenance") {
        const reason = params.evidence?.trim() ?? "";
        if (!reason) throw new SafetyKernelError("Maintenance requires evidence describing the user-visible issue or change");
        await startMaintenance(repository, ctx.sessionManager.getSessionId(), reason);
        return { content: [{ type: "text", text: "Maintenance started. Plan the narrowest verified change before implementation." }], details: { started: true } };
      }
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
      const session = selectIntegrationSession(Object.values((await registry.load()).sessions), ctx.sessionManager.getSessionId(), params.sessionId);
      if (!session) throw new SafetyKernelError("No unique completed writer session is available for integration; provide sessionId when multiple sessions are ready");
      let founderAcceptedAssumptionIds: readonly string[] = [];
      let founderAcceptedCritique = false;
      if (session.stage === "define") {
        if (!ctx.hasUI) throw new SafetyKernelError("Definition integration fails closed without interactive founder confirmation");
        const acceptance = await definitionAcceptance(repository, session);
        founderAcceptedCritique = await ctx.ui.confirm(acceptance.prompt.title, acceptance.prompt.message);
        if (!founderAcceptedCritique) return { content: [{ type: "text", text: "Definition integration cancelled; founder acceptance is required." }], details: { integrated: false, unresolvedCriticalAssumptionIds: acceptance.unresolvedCriticalAssumptionIds } };
        founderAcceptedAssumptionIds = acceptance.unresolvedCriticalAssumptionIds;
      }
      const receipt = await integrateCurrentStage(repository, session, params.evidence ?? "", params.sliceId, founderAcceptedAssumptionIds, founderAcceptedCritique);
      return { content: [{ type: "text", text: `Integrated ${receipt.stage} commit ${receipt.sourceCommit}; stage receipt ${receipt.id}.` }], details: { receipt } };
    },
  });
}
