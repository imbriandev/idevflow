import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../config/config.ts";
import { inspectBaseline } from "../git/baseline.ts";
import { RISKS, STAGES, STAGE_CONTRACTS } from "../lifecycle/contracts.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { writePreflight } from "../sessions/service.ts";
import type { SessionState } from "../state/session-state.ts";
import { assertPacketPath, readWorkerPacket } from "../workers/packets.ts";

export function registerPreflightTool(pi: ExtensionAPI, readState: () => SessionState): void {
  pi.registerTool({
    name: "idev_preflight",
    label: "iDevFlow Preflight",
    description: "Validate a iDevFlow stage and, for writes, create or reuse an isolated writer worktree with exclusive path claims.",
    promptSnippet: "Authorize iDevFlow writes and allocate a claimed worktree",
    promptGuidelines: [
      "Call idev_preflight with write=true before edit or write in an active iDevFlow stage.",
      "After write preflight, use the returned worktree; built-in edit/write paths are redirected and checked by the iDevFlow gate.",
    ],
    parameters: Type.Object({
      stage: StringEnum(STAGES),
      task: Type.String({ minLength: 1 }),
      risk: StringEnum(RISKS),
      paths: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      write: Type.Boolean(),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const selectedStage = readState().stage;
      const workerPacketPath = process.env.IDEVFLOW_WORKER_PACKET;
      if (workerPacketPath) {
        const discovered = await discoverRepository(ctx.cwd);
        const packet = await readWorkerPacket(await assertPacketPath(workerPacketPath, discovered.primaryRoot), process.env.IDEVFLOW_WORKER_PACKET_DIGEST);
        const requestedPaths = [...params.paths].sort();
        if (params.stage !== "build" || !params.write || params.task !== packet.task || params.risk !== packet.risk || JSON.stringify(requestedPaths) !== JSON.stringify([...packet.claims].sort())) {
          throw new Error("Worker preflight must exactly match its immutable task packet");
        }
      }
      if (selectedStage && selectedStage !== params.stage) {
        throw new Error(`Preflight stage ${params.stage} does not match active stage ${selectedStage}`);
      }
      if (params.write && !STAGE_CONTRACTS[params.stage].writeCapable) {
        throw new Error(`Stage ${params.stage} is read-only and cannot receive write preflight`);
      }
      if (params.write && !ctx.isProjectTrusted()) throw new Error("Write preflight requires a trusted project");
      const repository = await discoverRepository(ctx.cwd);
      const runtime = await new RuntimeStore(repository).status();
      const config = await loadConfig(repository.primaryRoot);
      const baseline = await inspectBaseline(repository, config);
      if (!params.write) {
        return {
          content: [{ type: "text", text: `Read preflight: runtime ${runtime ? `r${runtime.revision}` : "not initialized"}; baseline ${baseline.ready ? "ready" : "blocked"}.` }],
          details: { write: false, runtime, baseline },
        };
      }
      const session = await writePreflight(repository, {
        piSessionId: ctx.sessionManager.getSessionId(),
        stage: params.stage,
        task: params.task,
        risk: params.risk,
        paths: params.paths,
      });
      return {
        content: [{ type: "text", text: `Write preflight passed. Session ${session.id}; worktree ${session.worktreePath}; claims: ${session.claims.join(", ")}.` }],
        details: { write: true, session, baseline },
      };
    },
  });
}
