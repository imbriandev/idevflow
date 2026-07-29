import { StringEnum } from "@earendil-works/pi-ai";
import { truncateTail, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../config/config.ts";
import { hardenManagedArgs, validateManagedCommand } from "../policy/shell-policy.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { leaseIsValid } from "../sessions/types.ts";

export function registerExecTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_exec",
    label: "Pi iOS Exec",
    description: "Run an allowlisted Git, Swift, Xcode, or simulator command inside the current authorized writer worktree. Output is tail-truncated to 50KB/2000 lines.",
    promptSnippet: "Run allowlisted build and test commands in the Pi iOS worktree",
    promptGuidelines: ["Use pi_ios_exec instead of mutating bash commands during an active Pi iOS stage."],
    parameters: Type.Object({
      executable: StringEnum(["git", "swift", "xcodebuild", "xcrun"] as const),
      args: Type.Array(Type.String()),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      validateManagedCommand(params.executable, params.args);
      const hardenedArgs = hardenManagedArgs(params.executable, params.args);
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findByPiSession(ctx.sessionManager.getSessionId());
      if (!session || session.status !== "active") throw new SafetyKernelError("Managed execution requires an active writer session");
      if (!leaseIsValid(session)) throw new SafetyKernelError(`Managed execution blocked: session ${session.id} lease expired`);
      const config = await loadConfig(repository.primaryRoot);
      onUpdate?.({ content: [{ type: "text", text: `Running ${params.executable} in ${session.worktreePath}…` }], details: { sessionId: session.id } });
      const result = await pi.exec(params.executable, hardenedArgs, {
        cwd: session.worktreePath,
        ...(signal ? { signal } : {}),
        timeout: config.verificationTimeoutSeconds * 1000,
      });
      const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const truncated = truncateTail(combined);
      const text = `${truncated.content}${truncated.truncated ? "\n[Output truncated by Pi iOS]" : ""}\nexit=${result.code}`;
      if (result.code !== 0) throw new Error(text);
      return { content: [{ type: "text", text }], details: { sessionId: session.id, args: hardenedArgs, code: result.code, killed: result.killed, truncated: truncated.truncated } };
    },
  });
}
