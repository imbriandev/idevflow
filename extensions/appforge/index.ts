import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerStageCommands } from "./commands/register-stage-commands.ts";
import { registerToolGate } from "./policy/tool-gate.ts";
import { loadConfig } from "./config/config.ts";
import { inspectBaseline } from "./git/baseline.ts";
import { STAGE_CONTRACTS } from "./lifecycle/contracts.ts";
import { discoverRepository } from "./repository/discovery.ts";
import { loadCandidate } from "./release/service.ts";
import { SessionRegistry } from "./sessions/registry.ts";
import { heartbeatSession } from "./sessions/service.ts";
import { RuntimeStore } from "./state/runtime-store.ts";
import {
  emptySessionState,
  restoreSessionState,
  type SessionState,
} from "./state/session-state.ts";
import { registerDoctorTool } from "./tools/doctor-tool.ts";
import { registerExecTool } from "./tools/exec-tool.ts";
import { registerPreflightTool } from "./tools/preflight-tool.ts";
import { registerLifecycleTool } from "./tools/lifecycle-tool.ts";
import { registerReleaseTool } from "./tools/release-tool.ts";
import { registerProofTool } from "./tools/proof-tool.ts";
import { registerRuntimeTool } from "./tools/runtime-tool.ts";
import { registerSessionTool } from "./tools/session-tool.ts";
import { registerSimulatorTool } from "./tools/simulator-tool.ts";
import { registerVerificationTool } from "./tools/verification-tool.ts";
import { formatDashboard, updateStatus } from "./ui/status.ts";

export default function piIosExtension(pi: ExtensionAPI): void {
  let state: SessionState = emptySessionState();

  async function refreshWriterLease(ctx: ExtensionContext): Promise<void> {
    try {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (session?.status === "active") {
        await heartbeatSession(repository, session, await loadConfig(repository.primaryRoot));
      }
    } catch {
      // No initialized Git project or writer session: there is no lease to refresh.
    }
  }

  registerRuntimeTool(pi);
  registerLifecycleTool(pi);
  registerReleaseTool(pi);
  registerPreflightTool(pi, () => state);
  registerSessionTool(pi);
  registerExecTool(pi);
  registerSimulatorTool(pi);
  registerProofTool(pi);
  registerVerificationTool(pi);
  registerDoctorTool(pi);
  registerToolGate(pi, () => state);
  registerStageCommands(
    pi,
    () => state,
    (next) => {
      state = next;
    },
  );

  pi.registerCommand("ios", {
    description: "Show Pi iOS workflow status and recommended next action",
    handler: async (_args, ctx) => {
      const lines = [formatDashboard(state)];
      try {
        const repository = await discoverRepository(ctx.cwd);
        const runtime = await new RuntimeStore(repository).status();
        const config = await loadConfig(repository.primaryRoot);
        const baseline = await inspectBaseline(repository, config);
        const writer = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
        const candidate = await loadCandidate(repository);
        lines.push(`Runtime: ${runtime ? `r${runtime.revision} · ${runtime.lifecycle}` : "not initialized"}`);
        lines.push(`Baseline: ${baseline.ready ? "ready" : baseline.problems.join("; ")}`);
        lines.push(`Writer: ${writer ? `${writer.id} · ${writer.status} · ${writer.branch}` : "none"}`);
        lines.push(`Candidate: ${candidate ? `${candidate.status} · ${candidate.commit.slice(0, 12)} · ${candidate.target}` : "none"}`);
      } catch (error) {
        lines.push(`Project status unavailable: ${(error as Error).message}`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    state = restoreSessionState(ctx);
    updateStatus(ctx, state);
    await refreshWriterLease(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    await refreshWriterLease(ctx);
  });

  pi.on("before_agent_start", async () => {
    if (!state.stage) return;
    const contract = STAGE_CONTRACTS[state.stage];
    return {
      message: {
        customType: "pi-ios-stage-contract",
        content: `Active Pi iOS stage: ${state.stage}. ${contract.purpose} Forbidden actions: ${contract.forbidden.join("; ")}. Deterministic gates remain authoritative.`,
        display: false,
      },
    };
  });
}
