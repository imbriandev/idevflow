import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { access, mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneExpiredArtifactDirectories } from "../extensions/idevflow/artifacts/retention.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("artifact retention", () => {
  it("prunes only expired unpreserved verification directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-retention-"));
    roots.push(root);
    const expired = join(root, "expired");
    const preserved = join(root, "preserved");
    const current = join(root, "current");
    await Promise.all([mkdir(expired), mkdir(preserved), mkdir(current)]);
    const old = new Date("2000-01-01T00:00:00Z");
    await Promise.all([utimes(expired, old, old), utimes(preserved, old, old)]);
    const removed = await pruneExpiredArtifactDirectories(root, 1, new Set(["preserved"]));
    assert.deepEqual(removed, [expired]);
    await assert.rejects(access(expired));
    await access(preserved);
    await access(current);
  });
});
