import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { discoverRepository } from "../extensions/appforge/repository/discovery.ts";
import { RuntimeStore } from "../extensions/appforge/state/runtime-store.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("runtime Git exclusion", () => {
  it("keeps local runtime state out of source status without editing tracked ignore files", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    await execFileAsync("git", ["rm", ".gitignore"], { cwd: fixture.root });
    await execFileAsync("git", ["-c", "user.name=Pi iOS Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "remove ignore"], { cwd: fixture.root });
    const repository = await discoverRepository(fixture.root);
    await new RuntimeStore(repository).initialize("test");
    const status = await execFileAsync("git", ["status", "--porcelain"], { cwd: fixture.root, encoding: "utf8" });
    assert.equal(status.stdout, "");
    assert.match(await readFile(join(repository.commonGitDirectory, "info", "exclude"), "utf8"), /^\.appforge\/$/m);
  });
});
