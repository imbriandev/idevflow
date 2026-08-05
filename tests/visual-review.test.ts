import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVisualVerdict } from "../extensions/idevflow/tools/visual-review-tool.ts";

describe("visual review", () => {
  it("accepts only a structured model verdict", () => {
    const verdict = parseVisualVerdict('```json\n{"verdict":"fix_required","summary":"CTA is unclear","findings":[]}\n```');
    assert.equal(verdict.verdict, "fix_required");
    assert.throws(() => parseVisualVerdict("Looks good"), /JSON/);
  });
});
