import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { startTestRepair } from "../extensions/idevflow/lifecycle/service.ts";
import { RuntimeStore } from "../extensions/idevflow/state/runtime-store.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("test repair route", () => {
  it("allows one founder-approved repair from defined without creating a plan", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const runtime = new RuntimeStore(repository);
    await runtime.initialize("test");
    await runtime.transition("defined", "existing project adopted", "test", 1);
    await startTestRepair(repository, "founder-session", "StoreKit sandbox purchase returns notEntitled");
    assert.equal((await runtime.status())?.lifecycle, "testing");
    const repair = JSON.parse(await readFile(`${fixture.root}/.idevflow/repairs/test.json`, "utf8"));
    assert.equal(repair.returnTo, "defined");
    await assert.rejects(startTestRepair(repository, "founder-session", "duplicate"), /already active/);
  });
});
