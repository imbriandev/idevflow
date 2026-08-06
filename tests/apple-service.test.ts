import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { archiveSigningEvidence, signingFindings, signingTargets, testFlightExportOptions, testFlightUploadArguments } from "../extensions/idevflow/apple/service.ts";
import { priceDate } from "../extensions/idevflow/tools/apple-tool.ts";

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

  it("exports an App Store IPA and uploads it without exposing the private key", () => {
    assert.match(testFlightExportOptions(), /app-store-connect/);
    const args = testFlightUploadArguments("/tmp/App.ipa");
    assert.deepEqual(args, ["upload", "/tmp/App.ipa"]);
    assert.doesNotMatch(args.join(" "), /AuthKey|KEY_ID|ISSUER_ID|BEGIN PRIVATE KEY/);
  });

  it("requires unambiguous UTC instants for remote price changes", () => {
    assert.equal(priceDate("2026-01-15T00:00:00Z", "startDate"), "2026-01-15T00:00:00Z");
    assert.throws(() => priceDate("2026-01-15", "startDate"), /ISO-8601 UTC/);
  });

  it("uses App Store Connect's current app and IAP price-schedule endpoints", async () => {
    const bridge = await readFile(new URL("../extensions/idevflow/apple/automic-vault.mjs", import.meta.url), "utf8");
    assert.match(bridge, /\/v1\/apps\/\$\{owner\.app\.id\}\/appPriceSchedule/);
    assert.match(bridge, /\/v2\/inAppPurchases\/\$\{owner\.purchase\.id\}\/iapPriceSchedule/);
    assert.match(bridge, /\/v1\/apps\/\$\{owner\.app\.id\}\/appPricePoints/);
    assert.match(bridge, /\/v2\/inAppPurchases\/\$\{owner\.purchase\.id\}\/pricePoints/);
    assert.doesNotMatch(bridge, /PriceScheduleManualPrices/);
  });
});
