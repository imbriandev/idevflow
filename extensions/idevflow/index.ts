import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerStageCommands } from "./commands/register-stage-commands.ts";
import { coordinatorBrief } from "./coordinator/prompt.ts";
import { inspectCoordinator, isLikelyiDevFlowIntent, stageForRoute } from "./coordinator/service.ts";
import { registerToolGate } from "./policy/tool-gate.ts";
import { loadConfig } from "./config/config.ts";
import { STAGE_CONTRACTS } from "./lifecycle/contracts.ts";
import { discoverRepository } from "./repository/discovery.ts";
import { SessionRegistry } from "./sessions/registry.ts";
import { heartbeatSession } from "./sessions/service.ts";
import { emptySessionState, type SessionState } from "./state/session-state.ts";
import { registerContextTool } from "./tools/context-tool.ts";
import { registerBlockerTool } from "./tools/blocker-tool.ts";
import { registerAppleTool } from "./tools/apple-tool.ts";
import { registerDoctorTool } from "./tools/doctor-tool.ts";
import { registerFlowTool } from "./tools/flow-tool.ts";
import { registerExecTool } from "./tools/exec-tool.ts";
import { registerPreflightTool } from "./tools/preflight-tool.ts";
import { registerLifecycleTool } from "./tools/lifecycle-tool.ts";
import { registerReleaseTool } from "./tools/release-tool.ts";
import { registerProofTool } from "./tools/proof-tool.ts";
import { registerRuntimeTool } from "./tools/runtime-tool.ts";
import { registerSessionTool } from "./tools/session-tool.ts";
import { registerSimulatorTool } from "./tools/simulator-tool.ts";
import { registerVerificationTool } from "./tools/verification-tool.ts";
import { registerVisualReviewTool } from "./tools/visual-review-tool.ts";
import { formatCoordinatorDashboard, updateCoordinatorStatus, updateStatus } from "./ui/status.ts";
import { checkForUpdate } from "./ui/update.ts";

export default function piIosExtension(pi: ExtensionAPI): void {
  let state: SessionState = emptySessionState();

  async function refreshWriterLease(ctx: ExtensionContext): Promise<void> {
    try {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (session?.status === "active") await heartbeatSession(repository, session, await loadConfig(repository.primaryRoot));
    } catch {
      // No initialized Git project or writer session: there is no lease to refresh.
    }
  }

  registerFlowTool(pi);
  registerRuntimeTool(pi);
  registerContextTool(pi);
  registerBlockerTool(pi);
  registerAppleTool(pi);
  registerLifecycleTool(pi);
  registerReleaseTool(pi);
  registerPreflightTool(pi);
  registerSessionTool(pi);
  registerExecTool(pi);
  registerSimulatorTool(pi);
  registerProofTool(pi);
  registerVisualReviewTool(pi);
  registerVerificationTool(pi);
  registerDoctorTool(pi);
  registerToolGate(pi, () => state);
  registerStageCommands(pi, () => state, (next) => { state = next; });

  pi.registerCommand("idev", {
    description: "Show the state-aware iDevFlow coordinator dashboard",
    handler: async (_args, ctx) => {
      try {
        const repository = await discoverRepository(ctx.cwd);
        const snapshot = await inspectCoordinator(repository, ctx.sessionManager.getSessionId());
        updateCoordinatorStatus(ctx, snapshot);
        ctx.ui.notify(formatCoordinatorDashboard(snapshot), "info");
      } catch (error) {
        ctx.ui.notify(`iDevFlow project status unavailable: ${(error as Error).message}`, "warning");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    // Slash commands are one-chat hints; durable project state routes every new Pi session.
    state = emptySessionState();
    updateStatus(ctx, state);
    await refreshWriterLease(ctx);
    try {
      const repository = await discoverRepository(ctx.cwd);
      const snapshot = await inspectCoordinator(repository, ctx.sessionManager.getSessionId());
      if (snapshot.initialized) updateCoordinatorStatus(ctx, snapshot);
      const update = await checkForUpdate();
      if (update.available) ctx.ui.notify(`iDevFlow ${update.available} is available (installed: ${update.current}). Run pi install -l npm:idevflow@beta, then /reload.`, "info");
    } catch {
      // Pi remains available outside a trusted or initialized project.
    }
  });

  pi.on("turn_start", async (_event, ctx) => {
    await refreshWriterLease(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    try {
      const repository = await discoverRepository(ctx.cwd);
      const snapshot = await inspectCoordinator(repository, ctx.sessionManager.getSessionId());
      if (!snapshot.initialized && !isLikelyiDevFlowIntent(event.prompt)) return;
      updateCoordinatorStatus(ctx, snapshot);
      // Durable writer ownership wins. A persisted slash-command hint is valid only for its current lifecycle route.
      const stage = snapshot.activeWriterStage ?? (state.stage === stageForRoute(snapshot.route) ? state.stage : undefined);
      if (stage) {
        const contract = STAGE_CONTRACTS[stage];
        return { message: { customType: "idev-stage-contract", content: `[IDEVFLOW:${stage}] ${contract.purpose} Follow the stage skill; kernel tools are authoritative.`, display: false } };
      }
      return { message: { customType: "idev-coordinator", content: coordinatorBrief(snapshot), display: false } };
    } catch {
      // A non-Git or unavailable project should not change ordinary Pi conversation behavior.
    }
  });
}
