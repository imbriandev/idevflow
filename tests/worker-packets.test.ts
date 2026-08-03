import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkerPacket, packetDigest, readWorkerPacket, writeWorkerPacket } from "../extensions/idevflow/workers/packets.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("worker task packets", () => {
  it("writes immutable secret-free packets and detects tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-packet-")); roots.push(root);
    const packet = buildWorkerPacket({ packetId: "packet", pipelineId: "pipeline", repositoryFingerprint: "repo", graphFingerprint: "graph", planCommit: "commit", integrationEpoch: "epoch", maxRepairCycles: 2, slice: { id: "slice", title: "Slice", goal: "Implement slice", paths: ["Sources/Slice.swift"], risk: "medium", dependsOn: [], acceptance: ["works"], verificationProfile: "integration", platforms: ["ios", "macos"] } });
    const path = join(root, "packet.json");
    const digest = await writeWorkerPacket(path, packet);
    assert.equal(packetDigest(await readWorkerPacket(path, digest)), digest);
    assert.deepEqual(packet.platforms, ["ios", "macos"]);
    await writeFile(path, JSON.stringify({ ...packet, goal: "tampered" }));
    await assert.rejects(readWorkerPacket(path, digest), /digest mismatch/);
  });

  it("rejects credential-shaped packet content", () => {
    assert.throws(() => buildWorkerPacket({ packetId: "packet", pipelineId: "pipeline", repositoryFingerprint: "repo", graphFingerprint: "graph", planCommit: "commit", integrationEpoch: "epoch", maxRepairCycles: 2, slice: { id: "slice", title: "Slice", goal: "token=do-not-copy", paths: ["Sources"], risk: "low", dependsOn: [], acceptance: ["works"], verificationProfile: "quick" } }), /sensitive/);
  });
});
