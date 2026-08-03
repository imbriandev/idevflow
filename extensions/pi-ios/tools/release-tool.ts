import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { discoverRepository } from "../repository/discovery.ts";
import { createCandidate, createMacDistributionHandoff, createTestFlightHandoff, issuePromotionApproval, loadCandidate, promoteCandidate } from "../release/service.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { SafetyKernelError } from "../state/errors.ts";

export function registerReleaseTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_release",
    label: "Pi iOS Release",
    description: "Create an exact iOS candidate or macOS distribution handoff; approvals, signing, upload, notarization, and distribution remain explicit boundaries.",
    promptSnippet: "Operate candidate, approval, promotion, and TestFlight handoff gates",
    promptGuidelines: [
      "Candidate creation requires fresh release verification plus privacy, monetization, and release manifest gates.",
      "mac_handoff requires a macOS security manifest, fresh release verification, and interactive founder acknowledgement.",
      "Approval is interactive, expiring, single-use, and bound to candidate commit, fingerprint, and target.",
      "Promotion changes only the local base branch. It never pushes, uploads, or distributes.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "create_candidate", "approve", "promote", "handoff", "mac_handoff"] as const),
      verificationFingerprint: Type.Optional(Type.String()),
      target: Type.Optional(StringEnum(["testflight-internal", "testflight-external", "mac-app-store", "notarized"] as const)),
      approvalToken: Type.Optional(Type.String()),
      actor: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      if (params.action === "status") {
        const candidate = await loadCandidate(repository);
        return { content: [{ type: "text", text: candidate ? `Candidate ${candidate.fingerprint}: ${candidate.status}, ${candidate.commit}, ${candidate.target}.` : "No release candidate." }], details: { candidate } };
      }
      if (!ctx.isProjectTrusted()) throw new SafetyKernelError("Release mutation is blocked in an untrusted project");
      if (params.action === "create_candidate") {
        if (params.target === "mac-app-store" || params.target === "notarized") throw new SafetyKernelError("Use mac_handoff for macOS distribution targets");
        const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
        if (!session) throw new SafetyKernelError("Candidate creation requires a source-bound writer session");
        const candidate = await createCandidate(repository, session, params.verificationFingerprint ?? "", params.target);
        return { content: [{ type: "text", text: `Candidate ${candidate.fingerprint} is ready for ${candidate.target}; no push or upload occurred.` }], details: { candidate } };
      }
      if (params.action === "mac_handoff") {
        if (params.target !== "mac-app-store" && params.target !== "notarized") throw new SafetyKernelError("mac_handoff requires target mac-app-store or notarized");
        if (!ctx.hasUI) throw new SafetyKernelError("macOS distribution handoff fails closed without interactive UI");
        const confirmed = await ctx.ui.confirm("Prepare macOS distribution handoff?", "Record a source-bound manual handoff. Signing, archive, notarization/upload, and distribution will not occur.");
        if (!confirmed) return { content: [{ type: "text", text: "macOS distribution handoff cancelled." }], details: { handedOff: false } };
        const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
        if (!session) throw new SafetyKernelError("macOS handoff requires a source-bound writer session");
        const result = await createMacDistributionHandoff(repository, session, params.verificationFingerprint ?? "", params.target, params.actor?.trim() || "founder");
        return { content: [{ type: "text", text: `macOS ${params.target} handoff written to ${result.handoffPath}. No signing, upload, notarization, or distribution occurred.` }], details: { handedOff: true, ...result } };
      }
      if (params.action === "approve") {
        if (!ctx.hasUI) throw new SafetyKernelError("Ship approval fails closed without interactive UI");
        const confirmed = await ctx.ui.confirm("Approve exact TestFlight candidate?", "This approves local promotion only. Push, upload, and distribution remain separate and will not occur.");
        if (!confirmed) return { content: [{ type: "text", text: "Candidate approval cancelled." }], details: { approved: false } };
        const result = await issuePromotionApproval(repository, params.actor?.trim() || "founder");
        return { content: [{ type: "text", text: `Candidate approved until ${result.approval.expiresAt}. Use the returned single-use token only for exact local promotion.` }], details: { approved: true, ...result } };
      }
      if (params.action === "promote") {
        const candidate = await promoteCandidate(repository, params.approvalToken ?? "");
        return { content: [{ type: "text", text: `Promoted ${candidate.commit} locally to the base branch. Push/upload/distribution: not performed.` }], details: { candidate, pushed: false, archived: false, uploaded: false, distributed: false } };
      }
      if (!ctx.hasUI) throw new SafetyKernelError("TestFlight handoff acknowledgement fails closed without interactive UI");
      const confirmed = await ctx.ui.confirm("Prepare verified TestFlight handoff?", "Record the manual handoff package and explicit next steps without push, upload, or distribution?");
      if (!confirmed) return { content: [{ type: "text", text: "TestFlight handoff cancelled." }], details: { handedOff: false } };
      const result = await createTestFlightHandoff(repository, params.actor?.trim() || "founder");
      return { content: [{ type: "text", text: `Verified manual TestFlight handoff written to ${result.handoffPath}. No remote operation occurred.` }], details: { handedOff: true, ...result } };
    },
  });
}
