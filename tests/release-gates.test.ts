import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMacDistributionManifest, loadReleaseManifest, validateMacSecurityGate, validateMonetizationGate, validatePrivacyGate } from "../extensions/pi-ios/release/gates.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), "pi-ios-gates-")); roots.push(value); return value; }

describe("release gates", () => {
  it("blocks unresolved high privacy findings", async () => {
    const project = await root();
    await writeFile(join(project, "privacy.json"), JSON.stringify({ schemaVersion: 1, decision: "go", dataPractices: [], permissions: [], findings: [{ severity: "high", status: "open", evidence: "Unencrypted export" }] }));
    await assert.rejects(validatePrivacyGate(project, "privacy.json"), /unresolved/);
  });

  it("requires monetization reconciliation when StoreKit behavior is detected", async () => {
    const project = await root();
    await mkdir(join(project, "Sources"));
    await writeFile(join(project, "Sources/App.swift"), "import StoreKit\nfunc buy() async { _ = try? await product.purchase() }\n");
    await assert.rejects(validateMonetizationGate(project, "monetization.json"), /manifest is missing/);
    await writeFile(join(project, "monetization.json"), JSON.stringify({ schemaVersion: 1, entitlement: "pro", products: [{ productId: "com.example.pro" }], paywallRevision: "v1", appStoreSnapshotFingerprint: "sha256:appstore", providerSnapshotFingerprint: "sha256:provider", requiredProofs: ["purchase", "restore"], providedProofs: ["purchase", "restore"] }));
    assert.equal((await validateMonetizationGate(project, "monetization.json")).status, "ready");
  });

  it("validates macOS sandbox, entitlements, and distribution targets", async () => {
    const project = await root();
    await writeFile(join(project, "App.entitlements"), "<plist><dict><key>com.apple.security.app-sandbox</key><true/></dict></plist>");
    await writeFile(join(project, "release.json"), JSON.stringify({ schemaVersion: 1, platform: "macos", version: "1.0", build: "1", bundleId: "com.example.mac", target: "notarized", releaseNotes: "Beta", knownIssues: [], supportUrl: "https://example.com/support", privacyUrl: "https://example.com/privacy", security: { entitlementsPath: "App.entitlements", sandbox: true, hardenedRuntime: true, signingIdentity: "Developer ID Application: Example", teamId: "TEAM123", notarizationProfile: "notary-profile" } }));
    const manifest = await loadMacDistributionManifest(project, "release.json", "notarized");
    const gate = await validateMacSecurityGate(project, manifest.manifest, { platform: "macos", kind: "project", root: project, container: join(project, "App.xcodeproj"), containerName: "App.xcodeproj", scheme: "App", schemes: ["App"], deploymentTarget: "26.0", entitlementsPath: "App.entitlements", hardenedRuntime: true, bundleIdentifier: "com.example.mac", marketingVersion: "1.0", buildNumber: "1" });
    assert.equal(gate.sandbox, true);
    const invalid = { ...manifest.manifest, security: { ...manifest.manifest.security, entitlementsPath: "missing.entitlements" } };
    await assert.rejects(validateMacSecurityGate(project, invalid, { platform: "macos", kind: "project", root: project, container: join(project, "App.xcodeproj"), containerName: "App.xcodeproj", scheme: "App", schemes: ["App"], hardenedRuntime: true }), /entitlements path/);
  });

  it("validates HTTPS release metadata and exact target", async () => {
    const project = await root();
    await writeFile(join(project, "release.json"), JSON.stringify({ schemaVersion: 1, version: "1.0", build: "1", bundleId: "com.example", target: "testflight-internal", releaseNotes: "Beta", knownIssues: [], supportUrl: "https://example.com/support", privacyUrl: "https://example.com/privacy" }));
    assert.equal((await loadReleaseManifest(project, "release.json", "testflight-internal")).manifest.build, "1");
    await assert.rejects(loadReleaseManifest(project, "release.json", "testflight-external"), /does not match/);
  });
});
