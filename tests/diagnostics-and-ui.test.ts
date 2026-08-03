import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { createDiagnosticReport } from "../extensions/idevflow/recovery/report.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { registerPipelineTool } from "../extensions/idevflow/tools/pipeline-tool.ts";
import { registerReleaseTool } from "../extensions/idevflow/tools/release-tool.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

type RegisteredTool = { readonly name: string; readonly execute: (id: string, params: any, signal: AbortSignal | undefined, update: undefined, context: any) => Promise<unknown> };
function toolRegistry(): { readonly tools: Map<string, RegisteredTool>; readonly registerTool: (tool: RegisteredTool) => void } {
  const tools = new Map<string, RegisteredTool>();
  return { tools, registerTool(tool) { tools.set(tool.name, tool); } };
}
function nonInteractiveContext(cwd: string): any {
  return { cwd, hasUI: false, isProjectTrusted: () => true, sessionManager: { getSessionId: () => "noninteractive" }, ui: { confirm: async () => { throw new Error("confirm must not be called without UI"); } } };
}
function rejectingInteractiveContext(cwd: string): any {
  return { cwd, hasUI: true, isProjectTrusted: () => true, sessionManager: { getSessionId: () => "interactive" }, ui: { confirm: async () => false } };
}

describe("production diagnostics and interaction gates", () => {
  it("emits metadata-only diagnostics without exposing writer task content", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const now = new Date().toISOString();
    const secretTask = "repair token=super-secret-value-never-report";
    const session: WriterSession = { id: randomUUID(), piSessionId: "diagnostic", stage: "build", task: secretTask, risk: "low", status: "stale", branch: "idev/diagnostic", worktreePath: fixture.root, baseCommit: repository.head!, claims: ["README.md"], createdAt: now, heartbeatAt: now, leaseExpiresAt: now, statusReason: "test" };
    await new SessionRegistry(repository).start(session, "test");
    const report = await createDiagnosticReport(repository);
    assert.equal(report.sessions.stale, 1);
    assert.equal(report.health, "attention");
    assert.doesNotMatch(JSON.stringify(report), /super-secret-value-never-report/);
  });

  it("fails approval-required release and pipeline actions closed without an interactive UI", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const registry = toolRegistry();
    registerPipelineTool(registry as any, "/extension.ts");
    registerReleaseTool(registry as any);
    const context = nonInteractiveContext(fixture.root);
    await assert.rejects(registry.tools.get("idev_pipeline")!.execute("id", { action: "approve_risk", pipelineId: "demo", sliceId: "high-risk" }, undefined, undefined, context), /fails closed without interactive UI/);
    await assert.rejects(registry.tools.get("idev_release")!.execute("id", { action: "approve" }, undefined, undefined, context), /fails closed without interactive UI/);
  });

  it("honors an interactive cancellation before coordinator mutation", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const registry = toolRegistry(); registerPipelineTool(registry as any, "/extension.ts");
    const result: any = await registry.tools.get("idev_pipeline")!.execute("id", { action: "cancel", pipelineId: "does-not-need-to-exist", reason: "test cancellation" }, undefined, undefined, rejectingInteractiveContext(fixture.root));
    assert.equal(result.details.cancelled, false);
    assert.match(result.content[0].text, /cancelled/);
  });
});
