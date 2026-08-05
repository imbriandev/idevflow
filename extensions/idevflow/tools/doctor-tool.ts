import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { diagnoseLocks, diagnosePipelines, diagnoseSessions, diagnoseSimulatorLeases, releaseActiveSession, releaseLock, repairExpiredSessions, type DoctorLockTarget } from "../recovery/doctor.ts";
import { createDiagnosticReport } from "../recovery/report.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { inspectExistingProject } from "../recovery/existing-project.ts";

export function registerDoctorTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_doctor",
    label: "iDevFlow Doctor",
    description: "Diagnose iDevFlow state; repair expired sessions or explicitly release an orphaned active writer session without deleting source.",
    parameters: Type.Object({
      action: StringEnum(["audit", "status", "report", "repair", "release", "release_lock"] as const),
      sessionId: Type.Optional(Type.String()),
      reason: Type.Optional(Type.String()),
      lockTarget: Type.Optional(StringEnum(["runtime", "sessions", "pipeline", "simulators", "integration"] as const)),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      if (params.action === "audit") {
        const audit = await inspectExistingProject(repository);
        return { content: [{ type: "text", text: `Existing-project audit: ${audit.signals.join(", ") || "no Apple-project markers"}; tests: ${audit.testDirectories.join(", ") || "not found"}; automation: ${audit.automation.join(", ") || "not found"}; Git baseline is ${audit.repository.clean ? "clean" : "dirty"}. No source or lifecycle state changed.` }], details: { audit } };
      }
      if (params.action === "report") {
        const report = await createDiagnosticReport(repository);
        return { content: [{ type: "text", text: `iDevFlow diagnostic report: ${report.health}; ${report.sessions.total} writer session(s), ${report.pipelines.total} pipeline(s), ${report.diagnostics.length} diagnostic(s).` }], details: { report } };
      }
      if (params.action === "repair") {
        if (!ctx.isProjectTrusted()) throw new Error("Doctor repair requires a trusted project");
        if (!ctx.hasUI) throw new Error("Doctor repair fails closed without interactive approval");
        const approved = await ctx.ui.confirm("Repair iDevFlow registry?", "Expired sessions will be marked stale. No branch or worktree will be deleted.");
        if (!approved) return { content: [{ type: "text", text: "Doctor repair cancelled." }], details: { repaired: [] } };
        const repaired = await repairExpiredSessions(repository, `pi-session:${ctx.sessionManager.getSessionId()}`);
        return { content: [{ type: "text", text: `Doctor marked ${repaired.length} expired session(s) stale; all worktrees were preserved.` }], details: { repaired } };
      }
      if (params.action === "release") {
        if (!ctx.isProjectTrusted()) throw new Error("Doctor release requires a trusted project");
        if (!ctx.hasUI) throw new Error("Doctor release fails closed without interactive approval");
        if (!params.sessionId?.trim() || !params.reason?.trim()) throw new Error("Doctor release requires sessionId and reason");
        const approved = await ctx.ui.confirm(`Release writer session ${params.sessionId}?`, "This immediately frees its claims and simulator lease. Its branch and worktree will be preserved.");
        if (!approved) return { content: [{ type: "text", text: "Doctor release cancelled." }], details: {} };
        const released = await releaseActiveSession(repository, params.sessionId, params.reason, `pi-session:${ctx.sessionManager.getSessionId()}`);
        return { content: [{ type: "text", text: `Doctor released ${released.id}; its branch, worktree, and source evidence were preserved.` }], details: { released } };
      }
      if (params.action === "release_lock") {
        if (!ctx.isProjectTrusted()) throw new Error("Doctor lock release requires a trusted project");
        if (!ctx.hasUI) throw new Error("Doctor lock release fails closed without interactive approval");
        if (!params.lockTarget || !params.reason?.trim()) throw new Error("Doctor lock release requires lockTarget and reason");
        const approved = await ctx.ui.confirm(`Force-release ${params.lockTarget} lock?`, "Only continue after confirming its owner is gone. A live operation may be corrupted.");
        if (!approved) return { content: [{ type: "text", text: "Doctor lock release cancelled." }], details: {} };
        const released = await releaseLock(repository, params.lockTarget as DoctorLockTarget);
        return { content: [{ type: "text", text: released ? `Doctor released the ${params.lockTarget} lock.` : `No ${params.lockTarget} lock was present.` }], details: { released } };
      }
      const diagnostics = [...await diagnoseSessions(repository), ...await diagnoseSimulatorLeases(repository), ...await diagnosePipelines(repository), ...await diagnoseLocks(repository)];
      return {
        content: [{ type: "text", text: diagnostics.length ? diagnostics.map((item) => `${item.severity}: ${item.sessionId} — ${item.message}. ${item.recommendation}`).join("\n") : "No iDevFlow writer sessions." }],
        details: { diagnostics },
      };
    },
  });
}
