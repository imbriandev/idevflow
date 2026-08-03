import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStage, STAGES, STAGE_CONTRACTS } from "../extensions/idevflow/lifecycle/contracts.ts";

describe("stage contracts", () => {
  it("defines exactly seven unique lifecycle stages", () => {
    assert.equal(STAGES.length, 7);
    assert.equal(new Set(STAGES).size, 7);
  });

  it("binds every stage to its namespaced command", () => {
    for (const stage of STAGES) {
      assert.equal(STAGE_CONTRACTS[stage].command, `idev:${stage}`);
      assert.ok(STAGE_CONTRACTS[stage].requiredEvidence.length > 0);
      assert.ok(STAGE_CONTRACTS[stage].forbidden.length > 0);
    }
  });

  it("validates stage names", () => {
    assert.equal(isStage("build"), true);
    assert.equal(isStage("deploy"), false);
  });
});
