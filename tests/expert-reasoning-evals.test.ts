import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectKnowledge } from "../extensions/appforge/context/knowledge.ts";

describe("iOS specialist reasoning evaluations", () => {
  const cases = [
    { name: "SwiftUI primary-flow accessibility", input: { stage: "build" as const, risk: "medium" as const, task: "Build a SwiftUI onboarding NavigationStack with Dynamic Type and VoiceOver labels" }, expected: ["swiftui-experience"] },
    { name: "SwiftData migration and actor boundary", input: { stage: "plan" as const, risk: "high" as const, task: "Plan SwiftData migration, CloudKit sync, delete rules, and actor-safe persistence" }, expected: ["swift-state", "privacy-security"] },
    { name: "permission and sensitive-data change", input: { stage: "review" as const, risk: "critical" as const, task: "Review camera permission, Keychain token storage, analytics logs, and data deletion" }, expected: ["privacy-security", "review-audit"] },
    { name: "StoreKit restore", input: { stage: "test" as const, risk: "high" as const, task: "Test StoreKit subscription restore, revocation, offline launch, and paywall disclosure" }, expected: ["monetization", "testing-quality", "privacy-security"] },
    { name: "WidgetKit and App Intents", input: { stage: "plan" as const, risk: "medium" as const, task: "Plan WidgetKit timeline refresh and an App Intent for a SwiftUI shortcut" }, expected: ["native-integrations"] },
  ];

  for (const evaluation of cases) {
    it(`selects domain guidance for ${evaluation.name}`, () => {
      const selection = selectKnowledge(evaluation.input);
      const ids = selection.references.map((reference) => reference.id);
      for (const expected of evaluation.expected) assert.equal(ids.includes(expected), true, `${evaluation.name} omitted ${expected}`);
      assert.ok(selection.references.length <= 4);
      assert.ok(selection.estimatedTokens <= selection.budgetTokens);
    });
  }
});
