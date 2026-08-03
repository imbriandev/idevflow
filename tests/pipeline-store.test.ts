import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { PipelineStore } from "../extensions/idevflow/pipeline/store.ts";
import { PIPELINE_SCHEMA_VERSION } from "../extensions/idevflow/pipeline/types.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe("pipeline journal", () => {
  it("persists hash-chained mutations and repairs only a partial tail under mutation", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const store = new PipelineStore(repository);
    const now = new Date().toISOString();
    const initial = await store.create({ schemaVersion: PIPELINE_SCHEMA_VERSION, id: "golden-pipeline", repositoryFingerprint: repository.fingerprint, graphFingerprint: "graph", planCommit: repository.head!, integrationEpoch: repository.head!, status: "approved", createdAt: now, coordinator: { ownerPiSessionId: "owner", acquiredAt: now, heartbeatAt: now, expiresAt: new Date(Date.now() + 60_000).toISOString() }, slices: {}, batches: [] }, "test");
    assert.equal(initial.revision, 1);
    const next = await store.mutate("golden-pipeline", "started", "test", (state) => ({ ...state, status: "running" }));
    assert.equal(next.revision, 2);
    await appendFile(join(store.journals, "golden-pipeline.jsonl"), "partial");
    await assert.rejects(store.load("golden-pipeline"), /incomplete/);
    const repaired = await store.mutate("golden-pipeline", "paused", "test", (state) => ({ ...state, status: "paused" }));
    assert.equal(repaired.revision, 3);
    cleanups.push(async () => rm(`${fixture.root}.idev-worktrees`, { recursive: true, force: true }));
  });

  it("fails closed on a complete corrupted pipeline journal record", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root); const store = new PipelineStore(repository); const now = new Date().toISOString();
    await store.create({ schemaVersion: PIPELINE_SCHEMA_VERSION, id: "tampered-pipeline", repositoryFingerprint: repository.fingerprint, graphFingerprint: "graph", planCommit: repository.head!, integrationEpoch: repository.head!, status: "approved", createdAt: now, coordinator: { ownerPiSessionId: "owner", acquiredAt: now, heartbeatAt: now, expiresAt: new Date(Date.now() + 60_000).toISOString() }, slices: {}, batches: [] }, "test");
    await appendFile(join(store.journals, "tampered-pipeline.jsonl"), "{\"not\":\"a valid event\"}\n");
    await assert.rejects(store.load("tampered-pipeline"), /Invalid pipeline event/);
    await assert.rejects(store.mutate("tampered-pipeline", "must_not_repair", "test", (state) => state), /Invalid pipeline event/);
  });
});
