import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateProductMemory, validateSlcSpec } from "../extensions/appforge/documents/product.ts";
import { validateWorkGraph } from "../extensions/appforge/planning/work-graph.ts";

const memory = { schemaVersion: 1, product: { name: "App", targetUser: "Founders", problem: "Risk", promise: "Proof" }, principles: ["Narrow"], decisions: [] };
const slc = { schemaVersion: 1, title: "SLC", simple: ["One flow"], lovable: ["Fast"], complete: ["Handoff"], nonGoals: ["Upload"], successSignals: ["Beta"], risks: ["Drift"] };

describe("product memory and work graph", () => {
  it("validates complete deterministic product documents", () => {
    assert.equal(validateProductMemory(memory).product.name, "App");
    assert.equal(validateSlcSpec(slc).complete[0], "Handoff");
  });

  it("rejects stale, cyclic, and independently overlapping work graphs", () => {
    const base = { schemaVersion: 1, title: "Plan", sourceSpecFingerprint: "spec", architecture: [{ id: "ADR-1", title: "A", decision: "D", rationale: "R", status: "accepted" }] };
    assert.throws(() => validateWorkGraph({ ...base, sourceSpecFingerprint: "old", slices: [] }, "/tmp/project", "spec"), /stale/);
    const cycle = [
      { id: "a", title: "A", goal: "A", paths: ["A"], risk: "low", dependsOn: ["b"], acceptance: ["A"], verificationProfile: "quick" },
      { id: "b", title: "B", goal: "B", paths: ["B"], risk: "low", dependsOn: ["a"], acceptance: ["B"], verificationProfile: "quick" },
    ];
    assert.throws(() => validateWorkGraph({ ...base, slices: cycle }, "/tmp/project", "spec"), /cycle/);
    const overlap = [
      { id: "a", title: "A", goal: "A", paths: ["Sources"], risk: "low", dependsOn: [], acceptance: ["A"], verificationProfile: "quick" },
      { id: "b", title: "B", goal: "B", paths: ["Sources/Feature"], risk: "low", dependsOn: [], acceptance: ["B"], verificationProfile: "quick" },
    ];
    assert.throws(() => validateWorkGraph({ ...base, slices: overlap }, "/tmp/project", "spec"), /overlapping/);
  });
});
