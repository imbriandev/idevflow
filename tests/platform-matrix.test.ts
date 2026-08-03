import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_CONFIG } from "../extensions/canopy/config/config.ts";
import { discoverRepository } from "../extensions/canopy/repository/discovery.ts";
import { validatedPlatformReceipt } from "../extensions/canopy/verification/matrix.ts";
import { VerificationReceiptStore } from "../extensions/canopy/verification/receipts.ts";
import type { VerificationReceipt } from "../extensions/canopy/verification/types.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function receipt(fingerprint: string, platform?: "ios" | "macos"): VerificationReceipt {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: fingerprint, sessionId: "session", profile: "integration", verificationFingerprint: fingerprint,
    sourceFingerprint: "source", sourceCommit: "commit", configurationFingerprint: "config",
    ...(platform ? { project: { platform, kind: "project" as const, root: "/tmp", container: "/tmp/App.xcodeproj", containerName: "App.xcodeproj", scheme: "App", schemes: ["App"] } } : {}),
    toolchain: { xcode: "Xcode 26", swift: "Swift 6.2", developerDirectory: "/Applications/Xcode.app", fingerprint: "toolchain" },
    startedAt: now, finishedAt: now, success: true, reused: false, commands: [], artifacts: [], proofs: [],
  };
}

describe("universal platform receipts", () => {
  it("requires and resolves both exact child receipts", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const store = new VerificationReceiptStore(repository);
    await store.save("ios", receipt("ios", "ios"));
    await store.save("macos", receipt("macos", "macos"));
    const matrix = { ...receipt("matrix"), platformMatrix: { requiredPlatforms: ["ios", "macos"] as const, receiptFingerprints: { ios: "ios", macos: "macos" } } };
    await store.save("matrix", matrix);
    const config = { ...DEFAULT_CONFIG, xcode: { ...DEFAULT_CONFIG.xcode, requiredPlatforms: ["ios", "macos"] as const } };
    assert.equal((await validatedPlatformReceipt(repository, config, "matrix", "ios"))?.verificationFingerprint, "ios");
    assert.equal((await validatedPlatformReceipt(repository, config, "matrix", "macos"))?.verificationFingerprint, "macos");
    assert.equal(await validatedPlatformReceipt(repository, config, "ios", "ios"), undefined);
    await store.save("failed", { ...matrix, verificationFingerprint: "failed", success: false });
    assert.equal(await validatedPlatformReceipt(repository, config, "failed", "ios"), undefined);
  });
});
