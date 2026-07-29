import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverRepository } from "../repository/discovery.ts";
import { RuntimeStore } from "../state/runtime-store.ts";

export function registerRuntimeTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_runtime",
    label: "Pi iOS Runtime",
    description: "Inspect or initialize the deterministic Pi iOS project runtime. Initialization creates local .appforge state but does not modify product source.",
    promptSnippet: "Inspect or initialize deterministic Pi iOS project state",
    promptGuidelines: [
      "Use pi_ios_runtime status before claiming that Pi iOS project state or a lifecycle gate exists.",
      "Use pi_ios_runtime initialize only in a trusted Git project and before future write-capable kernel operations.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "initialize"] as const),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const store = new RuntimeStore(repository);
      if (params.action === "initialize" && !ctx.isProjectTrusted()) {
        throw new Error("Refusing to initialize Pi iOS state in an untrusted project");
      }
      const state = params.action === "initialize"
        ? await store.initialize(`pi-session:${ctx.sessionManager.getSessionId()}`)
        : await store.status();
      const text = state
        ? `Pi iOS runtime: revision ${state.revision}, lifecycle ${state.lifecycle}, repository ${state.repositoryId}`
        : "Pi iOS runtime is not initialized for this repository.";
      return {
        content: [{ type: "text", text }],
        details: {
          initialized: state !== null,
          state,
          repository: {
            worktreeRoot: repository.worktreeRoot,
            primaryRoot: repository.primaryRoot,
            head: repository.head,
            branch: repository.branch,
            clean: repository.clean,
          },
        },
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold("pi_ios_runtime "))}${theme.fg("accent", args.action)}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const detail = result.details as { initialized?: boolean; state?: { revision: number; lifecycle: string } } | undefined;
      if (!detail?.initialized) return new Text(theme.fg("warning", "○ runtime not initialized"), 0, 0);
      return new Text(
        theme.fg("success", `✓ runtime r${detail.state?.revision ?? "?"} · ${detail.state?.lifecycle ?? "unknown"}`),
        0,
        0,
      );
    },
  });
}
