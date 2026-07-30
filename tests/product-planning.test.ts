import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateIdeaQuality, validateProductMemory, validateSlcSpec } from "../extensions/pi-ios/documents/product.ts";
import { validateWorkGraph } from "../extensions/pi-ios/planning/work-graph.ts";

const memory = {
  schemaVersion: 2,
  product: { name: "App", targetUser: "Founders", problem: "Risk", promise: "Proof" },
  principles: ["Narrow"],
  decisions: [],
  ideaValidation: {
    learningQuestion: "Will founders complete a verified handoff in their first session?",
    primaryAssumptionId: "assumption-1",
    claims: [
      { id: "evidence-1", claim: "Founder reports release uncertainty", kind: "founder_evidence", source: "Founder interview, 2026-07-30", confidence: "medium", impact: "medium", validationPlan: "Compare onboarding completion in TestFlight", status: "open" },
      { id: "assumption-1", claim: "A guided handoff reduces uncertainty", kind: "assumption", confidence: "low", impact: "high", validationPlan: "Ask beta testers after one handoff", status: "open" },
    ],
  },
};
const slc = {
  schemaVersion: 2,
  title: "SLC",
  simple: ["One flow"],
  lovable: ["Fast"],
  complete: ["Handoff"],
  nonGoals: ["Upload"],
  successSignals: ["Beta completion"],
  risks: ["Drift"],
  experienceExpectations: { empty: "Explain how to begin", loading: "Show progress", failure: "Preserve entered work and explain recovery", accessibility: "Primary actions have labels", privacy: "State what remains local", trust: "Explain the manual handoff boundary" },
};

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

describe("product memory and work graph", () => {
  it("validates evidence-aware deterministic product documents", () => {
    const validatedMemory = validateProductMemory(memory);
    const validatedSlc = validateSlcSpec(slc);
    assert.equal(validatedMemory.product.name, "App");
    assert.equal(validatedSlc.complete[0], "Handoff");
    assert.deepEqual(validateIdeaQuality(validatedMemory, validatedSlc).unresolvedCriticalAssumptionIds, ["assumption-1"]);
  });

  it("requires sourced evidence, an open primary hypothesis, and complete experience expectations", () => {
    const unsourced = clone(memory);
    delete (unsourced.ideaValidation.claims[0] as { source?: string }).source;
    assert.throws(() => validateProductMemory(unsourced), /source is required/);
    const resolvedPrimary = clone(memory);
    resolvedPrimary.ideaValidation.claims[1]!.status = "confirmed";
    assert.throws(() => validateProductMemory(resolvedPrimary), /primaryAssumptionId/);
    const incompleteSlc = clone(slc);
    incompleteSlc.experienceExpectations.privacy = "";
    assert.throws(() => validateSlcSpec(incompleteSlc), /privacy/);
  });

  it("keeps legacy documents readable but rejects them for new definition quality gates", () => {
    const legacyMemory = { schemaVersion: 1, product: memory.product, principles: memory.principles, decisions: [] };
    const legacySlc = { schemaVersion: 1, title: slc.title, simple: slc.simple, lovable: slc.lovable, complete: slc.complete, nonGoals: slc.nonGoals, successSignals: slc.successSignals, risks: slc.risks };
    assert.equal(validateProductMemory(legacyMemory).schemaVersion, 1);
    assert.throws(() => validateIdeaQuality(validateProductMemory(legacyMemory), validateSlcSpec(legacySlc)), /schema version 2/);
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
