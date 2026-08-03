import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { registerPipelineTool } from "../extensions/idevflow/tools/pipeline-tool.ts";
import { registerReleaseTool } from "../extensions/idevflow/tools/release-tool.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { delete process.env.IDEVFLOW_WORKER_PACKET; for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

type Tool = { readonly name: string; readonly execute: (id: string, parameters: any, signal: AbortSignal | undefined, update: undefined, context: any) => Promise<unknown> };
function mockAgentTools(): Map<string, Tool> {
  const tools = new Map<string, Tool>();
  const extension = { registerTool(tool: Tool) { tools.set(tool.name, tool); } };
  registerPipelineTool(extension as any, "/extension.ts");
  registerReleaseTool(extension as any);
  return tools;
}
function context(cwd: string, trusted: boolean): any {
  return { cwd, hasUI: false, isProjectTrusted: () => trusted, sessionManager: { getSessionId: () => "mock-agent" }, ui: { confirm: async () => true } };
}

describe("mock-agent workflow evaluations", () => {
  it("keeps coordinator and release authority outside an untrusted or worker agent", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const tools = mockAgentTools();
    const evaluations = [
      {
        name: "worker cannot query or operate the coordinator",
        run: async () => { process.env.IDEVFLOW_WORKER_PACKET = "/packet.json"; return tools.get("idev_pipeline")!.execute("call", { action: "status" }, undefined, undefined, context(fixture.root, true)); },
        error: /workers cannot invoke coordinator/,
      },
      {
        name: "untrusted mock agent cannot create a release candidate",
        run: async () => tools.get("idev_release")!.execute("call", { action: "create_candidate", verificationFingerprint: "receipt" }, undefined, undefined, context(fixture.root, false)),
        error: /blocked in an untrusted project/,
      },
    ];
    for (const evaluation of evaluations) await assert.rejects(evaluation.run(), evaluation.error, evaluation.name);
  });
});
