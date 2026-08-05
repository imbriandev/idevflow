import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { diagnosePipelines, diagnoseSessions, repairExpiredSessions } from "../recovery/doctor.ts";
import { createDiagnosticReport } from "../recovery/report.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { inspectExistingProject } from "../recovery/existing-project.ts";

export function registerDoctorTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_doctor",
    label: "iDevFlow Doctor",
    description: "Diagnose an existing project, runtime, workers, pipelines, and candidate state; optionally mark only expired writer sessions stale without deleting source.",
    parameters: Type.Object({ action: StringEnum(["audit", "status", "report", "repair"] as const) }),
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
      const diagnostics = [...await diagnoseSessions(repository), ...await diagnosePipelines(repository)];
      return {
        content: [{ type: "text", text: diagnostics.length ? diagnostics.map((item) => `${item.severity}: ${item.sessionId} — ${item.message}. ${item.recommendation}`).join("\n") : "No iDevFlow writer sessions." }],
        details: { diagnostics },
      };
    },
  });
}
