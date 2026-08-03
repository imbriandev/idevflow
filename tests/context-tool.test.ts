import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { rm } from "node:fs/promises";
import { initializeConfig } from "../extensions/idevflow/config/config.ts";
import { loadContextReceipt } from "../extensions/idevflow/context/receipts.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { writePreflight } from "../extensions/idevflow/sessions/service.ts";
import { RuntimeStore } from "../extensions/idevflow/state/runtime-store.ts";
import { registerContextTool } from "../extensions/idevflow/tools/context-tool.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function registeredTool(): any {
  let tool: any;
  registerContextTool({ registerTool(value: unknown) { tool = value; } } as any);
  return tool;
}

describe("specialist context tool", () => {
  it("registers a read-only bounded selector with readable package paths", async () => {
    const tool = registeredTool();
    assert.equal(tool.name, "idev_context");
    const result = await tool.execute("id", { stage: "build", risk: "medium", task: "SwiftUI VoiceOver and Dynamic Type primary flow", surfaces: ["swiftui", "accessibility"] }, undefined, undefined, { isProjectTrusted: () => false });
    assert.match(result.content[0].text, /swiftui-experience\.md/);
    assert.equal(result.details.references.some((reference: { path: string }) => reference.path.endsWith("/references/swiftui-experience.md")), true);
    assert.ok(result.details.estimatedTokens <= result.details.budgetTokens);
  });

  it("records a high-risk selection against the active writer session", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup, async () => rm(`${fixture.root}.idev-worktrees`, { recursive: true, force: true }));
    const repository = await discoverRepository(fixture.root); await initializeConfig(fixture.root); await new RuntimeStore(repository).initialize("test");
    const session = await writePreflight(repository, { piSessionId: "context-tool", stage: "build", task: "Migrate SwiftData records", risk: "high", paths: ["README.md"] });
    const result = await registeredTool().execute("id", { stage: "build", risk: "high", task: "Migrate SwiftData records", surfaces: ["swiftdata"] }, undefined, undefined, { cwd: fixture.root, isProjectTrusted: () => true, sessionManager: { getSessionId: () => "context-tool" } });
    assert.equal(result.details.receipt.sessionId, session.id);
    assert.equal((await loadContextReceipt(repository, session.id, "build"))?.risk, "high");
    const planning = await registeredTool().execute("id", { stage: "plan", risk: "medium", task: "Plan a future SwiftUI change", surfaces: ["swiftui"] }, undefined, undefined, { cwd: fixture.root, isProjectTrusted: () => true, sessionManager: { getSessionId: () => "context-tool" } });
    assert.equal(planning.details.receipt, undefined);
  });
});
