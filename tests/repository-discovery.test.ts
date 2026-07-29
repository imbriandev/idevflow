import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { discoverRepository } from "../extensions/appforge/repository/discovery.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("repository discovery", () => {
  it("uses one identity and primary root across linked worktrees", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const linked = join(fixture.root, "..", `${fixture.root.split("/").pop()}-linked`);
    cleanups.push(async () => {
      await execFileAsync("git", ["worktree", "remove", "--force", linked], { cwd: fixture.root }).catch(() => undefined);
    });
    await execFileAsync("git", ["worktree", "add", "-b", "feature/test", linked], { cwd: fixture.root });
    await mkdir(join(linked, "nested"));

    const primary = await discoverRepository(fixture.root);
    const worktree = await discoverRepository(join(linked, "nested"));
    assert.equal(worktree.fingerprint, primary.fingerprint);
    assert.equal(worktree.primaryRoot, primary.primaryRoot);
    assert.notEqual(worktree.worktreeRoot, primary.worktreeRoot);
    assert.equal(primary.clean, true);
  });
});
