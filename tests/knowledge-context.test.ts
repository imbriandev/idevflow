import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { KNOWLEDGE_REFERENCES, detectKnowledgeSurfaces, selectKnowledge } from "../extensions/appforge/context/knowledge.ts";

const root = process.cwd();

describe("specialist knowledge routing", () => {
  it("selects a bounded, readable cold path for high-risk persistence and concurrency work", async () => {
    const selection = selectKnowledge({ stage: "plan", risk: "high", task: "Migrate SwiftData persistence with CloudKit sync and async actor boundaries" });
    assert.deepEqual(detectKnowledgeSurfaces("Migrate SwiftData persistence with CloudKit sync and async actor boundaries"), ["swiftdata", "concurrency"]);
    assert.equal(selection.references.some((reference) => reference.id === "swift-state"), true);
    assert.equal(selection.references.some((reference) => reference.id === "privacy-security"), true);
    assert.ok(selection.references.length <= 4);
    assert.ok(selection.estimatedTokens <= selection.budgetTokens);
    await Promise.all(selection.references.map((reference) => access(reference.path)));
  });

  it("routes release, StoreKit, and accessibility work without preloading unrelated references", () => {
    const selection = selectKnowledge({ stage: "ship", risk: "critical", task: "TestFlight release for StoreKit restore and VoiceOver primary flow", surfaces: ["release"] });
    assert.equal(selection.references.some((reference) => reference.id === "release-testflight"), true);
    assert.equal(selection.references.some((reference) => reference.id === "monetization"), true);
    assert.equal(selection.references.some((reference) => reference.id === "testing-quality"), true);
    assert.equal(selection.references.some((reference) => reference.id === "native-integrations"), false);
  });

  it("keeps skills and the legacy coverage ledger aligned with the specialist knowledge base", async () => {
    await Promise.all(KNOWLEDGE_REFERENCES.map((reference) => access(join(root, reference.path))));
    for (const stage of ["define", "plan", "build", "test", "review", "ship", "learn"]) {
      const skill = await readFile(join(root, "skills", `ios-${stage}`, "SKILL.md"), "utf8");
      assert.match(skill, /pi_ios_context/);
    }
    const ledger = await readFile(join(root, "references", "legacy-coverage.md"), "utf8");
    assert.equal((ledger.match(/^\| `[^`]+\.md` \|/gm) ?? []).length, 44);
    assert.match(ledger, /No legacy Python script/);
  });
});
