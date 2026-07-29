import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerContextTool } from "../extensions/appforge/tools/context-tool.ts";

describe("specialist context tool", () => {
  it("registers a read-only bounded selector with readable package paths", async () => {
    let tool: any;
    registerContextTool({ registerTool(value: unknown) { tool = value; } } as any);
    assert.equal(tool.name, "pi_ios_context");
    const result = await tool.execute("id", { stage: "build", risk: "medium", task: "SwiftUI VoiceOver and Dynamic Type primary flow", surfaces: ["swiftui", "accessibility"] });
    assert.match(result.content[0].text, /swiftui-experience\.md/);
    assert.equal(result.details.references.some((reference: { path: string }) => reference.path.endsWith("/references/swiftui-experience.md")), true);
    assert.ok(result.details.estimatedTokens <= result.details.budgetTokens);
  });
});
