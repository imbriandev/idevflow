import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { definitionAcceptancePrompt } from "../extensions/idevflow/tools/lifecycle-tool.ts";

describe("definition acceptance prompt", () => {
  it("presents critique and all unresolved high-impact assumptions in one confirmation", () => {
    const prompt = definitionAcceptancePrompt(
      { alternative: "Use a checklist", adoptionRisk: "Founders may not switch", invalidatingSignal: "Testers prefer the checklist" },
      ["assumption-1", "assumption-2"],
    );
    assert.equal(prompt.title, "Accept definition and known risks?");
    assert.match(prompt.message, /Use a checklist/);
    assert.match(prompt.message, /assumption-1, assumption-2/);
    assert.match(prompt.message, /exact definition/);
  });
});
