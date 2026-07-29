import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateArtifact } from "../extensions/pi-ios/artifacts/manifest.ts";
import { collectProof } from "../extensions/pi-ios/verification/proofs.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("quality proofs", () => {
  it("copies and hashes a screenshot proof with required metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-proof-"));
    roots.push(root);
    const screenshot = join(root, "screen.png");
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(1, 16);
    png.writeUInt32BE(1, 20);
    await writeFile(screenshot, png);
    const proof = await collectProof({ kind: "screenshot", path: screenshot, metadata: { variant: "compact-light", sourceFingerprint: "source" } }, join(root, "artifacts"));
    assert.equal(proof.kind, "screenshot");
    assert.equal(await validateArtifact(proof.artifact), true);
  });

  it("rejects unsubstantiated accessibility and performance proof", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-proof-"));
    roots.push(root);
    const artifact = join(root, "proof.json");
    await writeFile(artifact, "{}\n");
    await assert.rejects(collectProof({ kind: "accessibility", path: artifact, metadata: { passed: false, sourceFingerprint: "source" } }, root));
    await assert.rejects(collectProof({ kind: "performance", path: artifact, metadata: { passed: true, sourceFingerprint: "source" } }, root));
  });
});
