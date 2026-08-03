import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateIdeaQuality, validateLearningUpdate, validateProductMemory, validateSlcSpec } from "../extensions/pi-ios/documents/product.ts";
import { validateWorkGraph } from "../extensions/pi-ios/planning/work-graph.ts";

const memory = {
  schemaVersion: 3,
  product: { name: "App", targetUser: "Founders", problem: "Risk", promise: "Proof" },
  principles: ["Narrow"],
  decisions: [],
  ideaValidation: {
    learningQuestion: "Will founders complete a verified handoff in their first session?",
    primaryAssumptionId: "assumption-1",
    claims: [
      { id: "evidence-1", claim: "Founder reports release uncertainty", kind: "founder_evidence", source: "Founder interview, 2026-07-30", confidence: "medium", impact: "medium", validationPlan: "Compare onboarding completion in TestFlight", status: "open", scope: "product", sourceUrls: [], learningEvidenceIds: [] },
      { id: "assumption-1", claim: "A guided handoff reduces uncertainty", kind: "assumption", confidence: "low", impact: "high", validationPlan: "Ask beta testers after one handoff", status: "open", scope: "product", sourceUrls: [], learningEvidenceIds: [] },
    ],
    skepticalCritique: { alternative: "Continue using a release checklist", adoptionRisk: "Founders may not trust a new workflow", invalidatingSignal: "Testers prefer their existing checklist", unresolvedClaimIds: ["assumption-1"] },
    learningEvidence: [],
    discovery: { disposition: "evidence_sufficient", rationale: "Founder evidence directly describes the problem", records: [] },
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
    const uncitedMarketClaim = clone(memory);
    uncitedMarketClaim.ideaValidation.claims[0]!.scope = "market";
    assert.throws(() => validateProductMemory(uncitedMarketClaim), /HTTPS source URL/);
    const resolvedPrimary = clone(memory);
    resolvedPrimary.ideaValidation.claims[1]!.status = "confirmed";
    assert.throws(() => validateIdeaQuality(validateProductMemory(resolvedPrimary), validateSlcSpec(slc)), /learning evidence/);
    const incompleteSlc = clone(slc);
    incompleteSlc.experienceExpectations.privacy = "";
    assert.throws(() => validateSlcSpec(incompleteSlc), /privacy/);
  });

  it("requires a complete discovery record for research or prototype dispositions", () => {
    const missingResearch = clone(memory) as any;
    missingResearch.ideaValidation.discovery.disposition = "research_completed";
    assert.throws(() => validateProductMemory(missingResearch), /matching record/);
    const incompletePrototype = clone(memory) as any;
    incompletePrototype.ideaValidation.discovery.disposition = "prototype_completed";
    incompletePrototype.ideaValidation.discovery.records = [{ id: "prototype-1", kind: "prototype", hypothesisClaimIds: ["assumption-1"], method: "click-through", source: "Founder test", finding: "Participant reached the primary screen", limitation: "One participant" }];
    assert.throws(() => validateProductMemory(incompletePrototype), /artifactPath, userTask, and observedResult/);
  });

  it("requires evidence-linked claim conclusions during learning", () => {
    const previous = validateProductMemory(memory);
    const next = clone(memory) as any;
    next.ideaValidation.claims[1]!.status = "confirmed";
    next.ideaValidation.claims[1]!.learningEvidenceIds = ["beta-1"];
    next.ideaValidation.skepticalCritique.unresolvedClaimIds = [];
    next.ideaValidation.learningEvidence = [{ id: "beta-1", kind: "tester_feedback", source: "Beta interview", finding: "The handoff felt clearer" }];
    validateLearningUpdate(previous, validateProductMemory(next));
    assert.throws(() => validateLearningUpdate(previous, previous), /at least one existing claim status/);
  });

  it("keeps legacy documents readable but rejects them for new definition quality gates", () => {
    const legacyMemory = { schemaVersion: 1, product: memory.product, principles: memory.principles, decisions: [] };
    const legacySlc = { schemaVersion: 1, title: slc.title, simple: slc.simple, lovable: slc.lovable, complete: slc.complete, nonGoals: slc.nonGoals, successSignals: slc.successSignals, risks: slc.risks };
    assert.equal(validateProductMemory(legacyMemory).schemaVersion, 1);
    assert.throws(() => validateIdeaQuality(validateProductMemory(legacyMemory), validateSlcSpec(legacySlc)), /schema version 3/);
  });

  it("binds schema-2 work slices to Apple platforms", () => {
    const graph = validateWorkGraph({ schemaVersion: 2, title: "Universal", sourceSpecFingerprint: "spec", architecture: [{ id: "ADR-1", title: "Shared", decision: "Use one SwiftUI target", rationale: "Shared source", status: "accepted" }], slices: [{ id: "shared", title: "Shared", goal: "Build both", paths: ["Sources"], risk: "medium", dependsOn: [], acceptance: ["Works"], verificationProfile: "integration", platforms: ["ios", "macos"] }] }, "/tmp/project", "spec");
    assert.deepEqual(graph.slices[0]!.platforms, ["ios", "macos"]);
    assert.throws(() => validateWorkGraph({ ...graph, slices: [{ ...graph.slices[0], platforms: ["watchos"] }] }, "/tmp/project", "spec"), /invalid platform/);
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
