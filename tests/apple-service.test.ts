import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveSigningEvidence, signingFindings, signingTargets } from "../extensions/idevflow/apple/service.ts";

describe("Apple signing audit", () => {
  it("reports missing team and distribution identity without exposing credentials", () => {
    const targets = signingTargets([{ target: "VerseRise", buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: "com.example.app", CODE_SIGN_IDENTITY: "Apple Development" } }]);
    assert.deepEqual(targets, [{ target: "VerseRise", bundleId: "com.example.app", identity: "Apple Development" }]);
    assert.match(signingFindings(targets, ["Apple Development: Founder"] ).join("\n"), /DEVELOPMENT_TEAM is missing/);
    assert.match(signingFindings(targets, ["Apple Development: Founder"] ).join("\n"), /No Apple Distribution identity/);
  });

  it("records an archive distribution-signing verdict without storing entitlements", () => {
    const evidence = archiveSigningEvidence("/tmp/App.app", "Authority=Apple Distribution: Founder\nTeamIdentifier=TEAM123\n<?xml version=\"1.0\"?><plist><dict/></plist>");
    assert.equal(evidence.distributionSigned, true);
    assert.equal(evidence.teamId, "TEAM123");
    assert.match(evidence.entitlementsFingerprint, /^[0-9a-f]{64}$/);
  });

  it("accepts configured distribution signing", () => {
    const targets = signingTargets([{ target: "App", buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: "com.example.app", DEVELOPMENT_TEAM: "TEAM123", CODE_SIGN_IDENTITY: "Apple Distribution" } }]);
    assert.equal(signingFindings(targets, ["Apple Distribution: Founder"]).length, 0);
  });
});
