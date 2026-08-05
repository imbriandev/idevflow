import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { BlockerStore } from "../extensions/idevflow/blockers/store.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("blocker ledger", () => {
  it("persists classified blockers and requires an explicit resolution", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const store = new BlockerStore(await discoverRepository(fixture.root));
    const blocker = await store.open({ kind: "external_validation", title: "Sandbox purchase cannot complete", nextAction: "Run purchase and restore on a physical sandbox device", actor: "founder" });
    assert.equal((await store.list())[0]?.status, "open");
    await assert.rejects(() => store.resolve(blocker.id, "token=should-not-be-stored", "founder"), /credentials/);
    const resolved = await store.resolve(blocker.id, "Physical device receipt recorded.", "founder");
    assert.equal(resolved.status, "resolved");
    assert.equal((await store.list())[0]?.resolution, "Physical device receipt recorded.");
  });
});
