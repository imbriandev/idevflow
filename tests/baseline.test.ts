import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { loadConfig } from "../extensions/idevflow/config/config.ts";
import { inspectBaseline } from "../extensions/idevflow/git/baseline.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("baseline", () => {
  it("allows only local Pi settings without hiding source changes", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    await mkdir(`${fixture.root}/.pi`, { recursive: true });
    await writeFile(`${fixture.root}/.pi/settings.json`, "{}\n");
    const repository = await discoverRepository(fixture.root);
    const config = await loadConfig(fixture.root);
    const localOnly = await inspectBaseline(repository, config);
    assert.equal(localOnly.ready, true);
    assert.deepEqual(localOnly.localOnlyChanges, [".pi/settings.json"]);

    await writeFile(`${fixture.root}/Source.swift`, "changed\n");
    const dirty = await inspectBaseline(repository, config);
    assert.equal(dirty.ready, false);
  });
});
