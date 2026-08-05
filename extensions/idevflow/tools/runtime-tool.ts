import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { applyConfigMigration, discoverConfigMigration, initializeConfig, loadConfig } from "../config/config.ts";
import { inspectBaseline } from "../git/baseline.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { CONTINUATION_DISPOSITIONS, adoptExistingProject, chooseExistingProjectContinuation, hasExistingAppleProject } from "../recovery/existing-project.ts";

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
      action: StringEnum(["status", "initialize", "migrate", "adopt_existing", "choose_continuation"] as const),
      disposition: Type.Optional(StringEnum(CONTINUATION_DISPOSITIONS)),
      outcome: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const store = new RuntimeStore(repository);
      if (params.action !== "status" && !ctx.isProjectTrusted()) {
        throw new Error(`Refusing to ${params.action} iDevFlow state in an untrusted project`);
      }
      if (params.action === "adopt_existing") {
        if (!ctx.hasUI) throw new Error("Existing-project adoption fails closed without interactive approval");
        if (!await hasExistingAppleProject(repository.primaryRoot)) throw new Error("No existing Apple-platform project was detected for adoption");
        const approved = await ctx.ui.confirm("Adopt existing project?", "This acknowledges that existing code is not iDevFlow verification or release evidence. It does not modify source or advance the lifecycle.");
        if (!approved) return { content: [{ type: "text", text: "Existing-project adoption cancelled." }], details: { adopted: false } };
        const adoption = await adoptExistingProject(repository, `pi-session:${ctx.sessionManager.getSessionId()}`);
        return { content: [{ type: "text", text: `Existing project adopted with an audit snapshot at ${adoption.repository.head ?? "uncommitted baseline"}. Define the current product before planning the next change.` }], details: { adopted: true, adoption } };
      }
      if (params.action === "choose_continuation") {
        if (!ctx.hasUI) throw new Error("Existing-project continuation fails closed without interactive approval");
        if (!params.disposition || !params.outcome) throw new Error("Continuation requires disposition and founder outcome");
        const approved = await ctx.ui.confirm("Choose existing-project continuation?", `Continue by ${params.disposition.replaceAll("_", " ")}: ${params.outcome}`);
        if (!approved) return { content: [{ type: "text", text: "Existing-project continuation cancelled." }], details: { selected: false } };
        const adoption = await chooseExistingProjectContinuation(repository, params.disposition, params.outcome, `pi-session:${ctx.sessionManager.getSessionId()}`);
        return { content: [{ type: "text", text: `Founder continuation selected: ${adoption.continuation!.disposition.replaceAll("_", " ")}. Define the current product state and this outcome before planning.` }], details: { selected: true, adoption } };
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
