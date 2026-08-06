import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STAGE_CONTRACTS } from "../lifecycle/contracts.ts";
import { classifyReadOnlyShell, hardenReadOnlyShell } from "./shell-policy.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { pathIsClaimed, resolveSafeWritePath } from "../git/claims.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { leaseIsValid } from "../sessions/types.ts";
import type { SessionState } from "../state/session-state.ts";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function registerToolGate(pi: ExtensionAPI, readState: () => SessionState): void {
  pi.on("tool_call", async (event, ctx) => {
    const hintedStage = readState().stage;
    if (!hintedStage) return;

    if (event.toolName === "edit" || event.toolName === "write") {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findByPiSession(ctx.sessionManager.getSessionId());
      const stage = session?.stage ?? hintedStage ?? "build";
      if (!STAGE_CONTRACTS[stage].writeCapable) return { block: true, reason: `Stage ${stage} is read-only; enter a write-capable stage first.` };
      if (!session || session.status !== "active") {
        return { block: true, reason: "iDevFlow write blocked: run idev_preflight with write=true first." };
      }
      if (!leaseIsValid(session)) {
        return { block: true, reason: `iDevFlow write blocked: session ${session.id} lease expired; run doctor repair and resume explicitly.` };
      }
      const input = event.input as { path?: string };
      if (typeof input.path !== "string") return { block: true, reason: "iDevFlow write blocked: missing path." };
      let resolved: { absolute: string; projectPath: string };
      try {
        resolved = await resolveSafeWritePath(input.path, session.worktreePath);
      } catch (error) {
        return { block: true, reason: `iDevFlow write blocked: ${(error as Error).message}` };
      }
      if (!pathIsClaimed(resolved.projectPath, session.claims)) {
        return { block: true, reason: `iDevFlow write blocked: ${resolved.projectPath} is outside claims ${session.claims.join(", ")}.` };
      }
      input.path = resolved.absolute;
      return;
    }

    if (event.toolName === "bash") {
      const input = event.input as { command?: string };
      const command = input.command ?? "";
      const decision = classifyReadOnlyShell(command);
      if (!decision.allowed) {
        return { block: true, reason: `iDevFlow shell gate: ${decision.reason}. Use idev_exec for allowlisted build/test operations.` };
      }
      const hardened = hardenReadOnlyShell(command);
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findByPiSession(ctx.sessionManager.getSessionId());
      input.command = session ? `cd ${shellQuote(session.worktreePath)} && ${hardened}` : hardened;
    }
  });
}
