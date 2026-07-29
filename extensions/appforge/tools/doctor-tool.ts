import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { diagnoseSessions, repairExpiredSessions } from "../recovery/doctor.ts";
import { discoverRepository } from "../repository/discovery.ts";

export function registerDoctorTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_doctor",
    label: "Pi iOS Doctor",
    description: "Diagnose writer sessions and conservatively mark expired sessions stale without deleting branches or worktrees.",
    parameters: Type.Object({ action: StringEnum(["status", "repair"] as const) }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      if (params.action === "repair") {
        if (!ctx.isProjectTrusted()) throw new Error("Doctor repair requires a trusted project");
        if (!ctx.hasUI) throw new Error("Doctor repair fails closed without interactive approval");
        const approved = await ctx.ui.confirm("Repair Pi iOS registry?", "Expired sessions will be marked stale. No branch or worktree will be deleted.");
        if (!approved) return { content: [{ type: "text", text: "Doctor repair cancelled." }], details: { repaired: [] } };
        const repaired = await repairExpiredSessions(repository, `pi-session:${ctx.sessionManager.getSessionId()}`);
        return { content: [{ type: "text", text: `Doctor marked ${repaired.length} expired session(s) stale; all worktrees were preserved.` }], details: { repaired } };
      }
      const diagnostics = await diagnoseSessions(repository);
      return {
        content: [{ type: "text", text: diagnostics.length ? diagnostics.map((item) => `${item.severity}: ${item.sessionId} — ${item.message}. ${item.recommendation}`).join("\n") : "No Pi iOS writer sessions." }],
        details: { diagnostics },
      };
    },
  });
}
