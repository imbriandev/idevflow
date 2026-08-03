import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { applyConfigMigration, discoverConfigMigration, initializeConfig, loadConfig } from "../config/config.ts";
import { inspectBaseline } from "../git/baseline.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { RuntimeStore } from "../state/runtime-store.ts";

export function registerRuntimeTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_runtime",
    label: "iDevFlow Runtime",
    description: "Inspect or initialize the deterministic iDevFlow project runtime. Initialization creates local .idevflow state but does not modify product source.",
    promptSnippet: "Inspect or initialize deterministic iDevFlow project state",
    promptGuidelines: [
      "Use idev_runtime status before claiming that iDevFlow project state or a lifecycle gate exists.",
      "Use idev_runtime initialize only in a trusted Git project and before future write-capable kernel operations.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "initialize", "migrate"] as const),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const store = new RuntimeStore(repository);
      if (params.action !== "status" && !ctx.isProjectTrusted()) {
        throw new Error(`Refusing to ${params.action} iDevFlow state in an untrusted project`);
      }
      if (params.action === "migrate") {
        if (!ctx.hasUI) throw new Error("Config migration fails closed without interactive approval");
        const approved = await ctx.ui.confirm("Migrate iDevFlow config?", "A backup will be written before applying the versioned migration.");
        if (!approved) return { content: [{ type: "text", text: "iDevFlow config migration cancelled." }], details: { migrated: false } };
      }
      const state = params.action === "initialize"
        ? await store.initialize(`pi-session:${ctx.sessionManager.getSessionId()}`)
        : await store.status();
      const migration = await discoverConfigMigration(repository.primaryRoot);
      const config = params.action === "initialize"
        ? await initializeConfig(repository.primaryRoot)
        : params.action === "migrate"
          ? await applyConfigMigration(repository.primaryRoot)
          : migration.config ?? await loadConfig(repository.primaryRoot);
      const baseline = await inspectBaseline(repository, config);
      const text = state
        ? `iDevFlow runtime: revision ${state.revision}, lifecycle ${state.lifecycle}, repository ${state.repositoryId}; baseline ${baseline.ready ? "ready" : "blocked"}.`
        : "iDevFlow runtime is not initialized for this repository.";
      return {
        content: [{ type: "text", text }],
        details: {
          initialized: state !== null,
          state,
          config,
          migration,
          baseline,
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
        `${theme.fg("toolTitle", theme.bold("idev_runtime "))}${theme.fg("accent", args.action)}`,
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
