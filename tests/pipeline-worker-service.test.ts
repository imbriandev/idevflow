import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { initializeConfig } from "../extensions/idevflow/config/config.ts";
import { PipelineService } from "../extensions/idevflow/pipeline/service.ts";
import { PipelineStore } from "../extensions/idevflow/pipeline/store.ts";
import { PIPELINE_SCHEMA_VERSION, type PipelineSliceState, type WorkerRunRecord } from "../extensions/idevflow/pipeline/types.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { sourceFingerprint } from "../extensions/idevflow/verification/fingerprint.ts";
import { VerificationReceiptStore } from "../extensions/idevflow/verification/receipts.ts";
import type { VerificationReceipt } from "../extensions/idevflow/verification/types.ts";
import { buildWorkerPacket, writeWorkerPacket } from "../extensions/idevflow/workers/packets.ts";
import { reportWorkerRepair, submitPipelineWorker } from "../extensions/idevflow/workers/service.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { delete process.env.IDEVFLOW_WORKER_PACKET; delete process.env.IDEVFLOW_WORKER_PACKET_DIGEST; delete process.env.IDEVFLOW_WORKER_CAPABILITY; for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function setup(id: string) {
  const fixture = await createGitFixture(); cleanups.push(fixture.cleanup); await initializeConfig(fixture.root);
  const repository = await discoverRepository(fixture.root); const capability = randomUUID(); const packetId = randomUUID();
  const packet = buildWorkerPacket({ packetId, pipelineId: id, repositoryFingerprint: repository.fingerprint, graphFingerprint: "graph", planCommit: repository.head!, integrationEpoch: repository.head!, maxRepairCycles: 2, slice: { id: "slice", title: "Slice", goal: "Implement slice", paths: ["README.md"], risk: "medium", dependsOn: [], acceptance: ["works"], verificationProfile: "integration" } });
  const packetPath = join(fixture.root, ".idevflow", "pipeline", "packets", `${packetId}.json`); await mkdir(join(fixture.root, ".idevflow", "pipeline", "packets"), { recursive: true }); const digest = await writeWorkerPacket(packetPath, packet);
  const run: WorkerRunRecord = { runId: randomUUID(), packetId, packetPath, packetDigest: digest, capabilityHash: createHash("sha256").update(capability).digest("hex"), state: "running", attempt: 1, pid: process.pid, startedAt: new Date().toISOString(), leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), stdoutPath: "/tmp/out", stderrPath: "/tmp/err" };
  const slice: PipelineSliceState = { id: "slice", title: "Slice", goal: "Implement slice", claims: ["README.md"], risk: "medium", dependsOn: [], acceptance: ["works"], verificationProfile: "integration", status: "working", riskApproved: true, attempts: 1, repairCycles: 0, runs: [run] };
  const now = new Date().toISOString(); await new PipelineStore(repository).create({ schemaVersion: PIPELINE_SCHEMA_VERSION, id, repositoryFingerprint: repository.fingerprint, graphFingerprint: "graph", planCommit: repository.head!, integrationEpoch: repository.head!, status: "running", createdAt: now, coordinator: { ownerPiSessionId: "owner", acquiredAt: now, heartbeatAt: now, expiresAt: new Date(Date.now() + 60_000).toISOString() }, slices: { slice }, batches: [] }, "test");
  process.env.IDEVFLOW_WORKER_PACKET = packetPath; process.env.IDEVFLOW_WORKER_PACKET_DIGEST = digest; process.env.IDEVFLOW_WORKER_CAPABILITY = capability;
  return { fixture, repository, packet };
}

describe("pipeline worker authority", () => {
  it("enforces the deterministic repair budget", async () => {
    const { repository } = await setup("repair-pipeline");
    assert.equal((await reportWorkerRepair(repository, "worker", "first finding")).allowed, true);
    assert.equal((await reportWorkerRepair(repository, "worker", "second finding")).allowed, true);
    const exhausted = await reportWorkerRepair(repository, "worker", "third finding");
    assert.equal(exhausted.allowed, false);
    assert.equal((await new PipelineStore(repository).load("repair-pipeline"))?.slices.slice?.status, "repair_exhausted");
  });

  it("reconciles a lost worker and permits one bounded explicit retry", async () => {
    const { repository } = await setup("lost-pipeline");
    await new PipelineStore(repository).mutate("lost-pipeline", "expire", "test", (pipeline) => {
      const slice = pipeline.slices.slice!;
      return { ...pipeline, slices: { slice: { ...slice, runs: slice.runs.map((run) => ({ ...run, pid: 999_999, leaseExpiresAt: new Date(0).toISOString() })) } } };
    });
    const service = new PipelineService(repository, "/fake.ts");
    const reconciled = await service.reconcile("lost-pipeline", "owner");
    assert.equal(reconciled.slices.slice?.status, "worker_lost");
    const retried = await service.retrySlice("lost-pipeline", "slice", "owner", "worker crashed during reload");
    assert.equal(retried.slices.slice?.status, "pending");
  });

  it("accepts only source-bound ready-session test and review receipts", async () => {
    const { repository } = await setup("submit-pipeline");
    const now = new Date().toISOString();
    const postflight = { evidence: "build", changedFiles: ["README.md"], diffHash: "diff", verificationReceiptId: "pre", verificationFingerprint: "pre-fingerprint", verificationProfile: "integration", recordedAt: now };
    const session: WriterSession = { id: randomUUID(), piSessionId: "worker", stage: "build", task: "Implement slice", risk: "medium", status: "ready_for_integration", branch: "main", worktreePath: repository.primaryRoot, baseCommit: repository.head!, claims: ["README.md"], createdAt: now, heartbeatAt: now, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), postflight, commit: repository.head! };
    await new SessionRegistry(repository).start(session, "test");
    const source = await sourceFingerprint(session); const verification: VerificationReceipt = { schemaVersion: 1, id: randomUUID(), sessionId: session.id, profile: "integration", verificationFingerprint: "final-fingerprint", sourceFingerprint: source.fingerprint, sourceCommit: source.commit, configurationFingerprint: "config", toolchain: { xcode: "Xcode 26", swift: "Apple Swift version 6.2", developerDirectory: "/Xcode", fingerprint: "toolchain" }, startedAt: now, finishedAt: now, success: true, reused: false, commands: [], artifacts: [], proofs: [] };
    await new VerificationReceiptStore(repository).save(verification.verificationFingerprint, verification);
    const receipts = await submitPipelineWorker(repository, "worker", verification.verificationFingerprint, { verdict: "pass", summary: "slice passed", residualRisk: "combined verification", findings: [] });
    assert.equal(receipts.review.verdict, "pass");
    assert.equal((await new PipelineStore(repository).load("submit-pipeline"))?.slices.slice?.status, "ready_to_integrate");
  });
});
