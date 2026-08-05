import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { BLOCKER_KINDS, BlockerStore } from "../blockers/store.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { RuntimeStore } from "../state/runtime-store.ts";

export function registerBlockerTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_blocker",
    label: "iDevFlow Blockers",
    description: "Record and resolve durable metadata-only blockers. It never changes lifecycle state or treats an external blocker as verified evidence.",
    parameters: Type.Object({
      action: StringEnum(["status", "open", "resolve"] as const),
      kind: Type.Optional(StringEnum(BLOCKER_KINDS)),
      title: Type.Optional(Type.String()),
      nextAction: Type.Optional(Type.String()),
      blockerId: Type.Optional(Type.String()),
      resolution: Type.Optional(Type.String()),
      sourceCommit: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const store = new BlockerStore(repository);
      if (params.action === "status") {
        const blockers = await store.list();
        const open = blockers.filter((blocker) => blocker.status === "open");
        return { content: [{ type: "text", text: open.length ? `${open.length} open blocker(s): ${open.map((blocker) => `[${blocker.kind}] ${blocker.title}`).join("; ")}` : "No open iDevFlow blockers." }], details: { blockers, open } };
      }
      if (!ctx.isProjectTrusted()) throw new SafetyKernelError("Blocker mutation is blocked in an untrusted project");
      if (!await new RuntimeStore(repository).status()) throw new SafetyKernelError("Initialize iDevFlow runtime before recording blockers");
      if (params.action === "open") {
        if (!params.kind || !params.title || !params.nextAction) throw new SafetyKernelError("Opening a blocker requires kind, title, and nextAction");
        const blocker = await store.open({ kind: params.kind, title: params.title, nextAction: params.nextAction, ...(params.sourceCommit ? { sourceCommit: params.sourceCommit } : {}), actor: `pi-session:${ctx.sessionManager.getSessionId()}` });
        return { content: [{ type: "text", text: `Opened ${blocker.kind} blocker ${blocker.id}: ${blocker.title}` }], details: { blocker } };
      }
      if (!ctx.hasUI) throw new SafetyKernelError("Resolving a blocker fails closed without interactive founder confirmation");
      if (!params.blockerId || !params.resolution) throw new SafetyKernelError("Resolving a blocker requires blockerId and resolution");
      const confirmed = await ctx.ui.confirm("Resolve blocker?", "Confirm that the stated evidence closes this blocker. This does not advance lifecycle state or replace required verification.");
      if (!confirmed) return { content: [{ type: "text", text: "Blocker resolution cancelled." }], details: { resolved: false } };
      const blocker = await store.resolve(params.blockerId, params.resolution, `pi-session:${ctx.sessionManager.getSessionId()}`);
      return { content: [{ type: "text", text: `Resolved blocker ${blocker.id}; lifecycle and release gates remain unchanged.` }], details: { blocker } };
    },
  });
}
