import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertVerificationProfileSupported, missingRequiredProofs, PROFILE_CONTRACTS, selectVerificationProfile } from "../extensions/pi-ios/verification/profiles.ts";

describe("verification policy", () => {
  it("selects adaptive profiles from stage, risk, and changed surface", () => {
    assert.equal(selectVerificationProfile({ stage: "build", risk: "low", changedFiles: ["docs/spec.md"] }), "docs");
    assert.equal(selectVerificationProfile({ stage: "build", risk: "low", changedFiles: ["Sources/App.swift"] }), "quick");
    assert.equal(selectVerificationProfile({ stage: "build", risk: "medium", changedFiles: ["Sources/App.swift"] }), "slice");
    assert.equal(selectVerificationProfile({ stage: "build", risk: "high", changedFiles: ["Sources/App.swift"] }), "integration");
    assert.equal(selectVerificationProfile({ stage: "ship", risk: "medium", changedFiles: [] }), "release");
  });

  it("requires the complete release proof set", () => {
    assert.deepEqual(PROFILE_CONTRACTS.release.requiredProofs, ["simulator", "screenshot", "accessibility", "performance"]);
    assert.equal(PROFILE_CONTRACTS.release.reusable, false);
    const proofs = [
      { kind: "simulator" as const, metadata: {} },
      { kind: "screenshot" as const, metadata: { variant: "compact-light" } },
      { kind: "accessibility" as const, metadata: {} },
      { kind: "performance" as const, metadata: {} },
    ];
    assert.deepEqual(missingRequiredProofs("release", proofs, ["compact-light", "compact-dark"]), ["screenshot"]);
    assert.deepEqual(missingRequiredProofs("integration", [], [], "macos"), []);
    assert.doesNotThrow(() => assertVerificationProfileSupported("integration", "macos"));
    assert.doesNotThrow(() => assertVerificationProfileSupported("release", "macos"));
  });
});
