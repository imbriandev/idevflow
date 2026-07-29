import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { appendFile, readFile } from "node:fs/promises";
import { discoverRepository } from "../extensions/appforge/repository/discovery.ts";
import { JournalCorruptionError, RevisionConflictError } from "../extensions/appforge/state/errors.ts";
import { RuntimeStore } from "../extensions/appforge/state/runtime-store.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fixtureStore(): Promise<RuntimeStore> {
  const fixture = await createGitFixture();
  cleanups.push(fixture.cleanup);
  return new RuntimeStore(await discoverRepository(fixture.root), { timeoutMs: 2_000, retryMs: 2 });
}

describe("runtime event store", () => {
  it("initializes once under concurrent callers", async () => {
    const store = await fixtureStore();
    const states = await Promise.all(Array.from({ length: 8 }, (_, index) => store.initialize(`actor-${index}`)));
    assert.equal(new Set(states.map((state) => state.repositoryId)).size, 1);
    assert.deepEqual(new Set(states.map((state) => state.revision)), new Set([1]));
    assert.equal((await store.status())?.lifecycle, "idea");
  });

  it("persists a hash-chained lifecycle transition and snapshot", async () => {
    const store = await fixtureStore();
    const initial = await store.initialize("test");
    const defined = await store.transition("defined", "SLC accepted", "test", initial.revision);
    assert.equal(defined.revision, 2);
    assert.equal(defined.lifecycle, "defined");
    assert.equal((await store.status())?.lastEventHash, defined.lastEventHash);

    const snapshot = JSON.parse(await readFile(store.snapshotPath, "utf8")) as { state: { revision: number } };
    assert.equal(snapshot.state.revision, 2);
  });

  it("rejects stale optimistic revisions", async () => {
    const store = await fixtureStore();
    await store.initialize("test");
    await store.transition("defined", "accepted", "test", 1);
    await assert.rejects(store.transition("planned", "stale writer", "test", 1), RevisionConflictError);
  });

  it("repairs only an incomplete final journal record while holding the lock", async () => {
    const store = await fixtureStore();
    const initial = await store.initialize("test");
    await appendFile(store.journalPath, "{\"partial\":", "utf8");
    await assert.rejects(store.status(), JournalCorruptionError);

    const repaired = await store.initialize("repair");
    assert.equal(repaired.revision, initial.revision);
    const journal = await readFile(store.journalPath, "utf8");
    assert.equal(journal.endsWith("\n"), true);
    assert.equal(journal.includes("partial"), false);
  });

  it("fails closed on a complete tampered journal record", async () => {
    const store = await fixtureStore();
    await store.initialize("test");
    await appendFile(store.journalPath, `${JSON.stringify({ schemaVersion: 1, id: "tampered" })}\n`, "utf8");
    await assert.rejects(store.initialize("repair"), JournalCorruptionError);
  });
});
