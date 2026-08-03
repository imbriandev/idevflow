import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { acquireFileLock } from "../extensions/idevflow/state/file-lock.ts";
import { LockTimeoutError } from "../extensions/idevflow/state/errors.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function lockFixture(): { root: string; lockPath: string } {
  const root = join(tmpdir(), `idev-lock-${randomUUID()}`);
  roots.push(root);
  return { root, lockPath: join(root, "locks", "runtime.lock") };
}

describe("cross-process file lock", () => {
  it("does not reap a lock owned by a live local process", async () => {
    const { lockPath } = lockFixture();
    const first = await acquireFileLock(lockPath);
    await assert.rejects(
      acquireFileLock(lockPath, { timeoutMs: 20, staleMs: 0, retryMs: 2 }),
      LockTimeoutError,
    );
    await first.release();
  });

  it("reaps a stale lock whose local owner is dead", async () => {
    const { lockPath } = lockFixture();
    await mkdir(lockPath, { recursive: true });
    await writeFile(
      join(lockPath, "owner.json"),
      JSON.stringify({ token: "dead", pid: 2_147_483_647, hostname: hostname(), acquiredAt: "2000-01-01T00:00:00Z" }),
    );
    const old = new Date("2000-01-01T00:00:00Z");
    await utimes(lockPath, old, old);

    const acquired = await acquireFileLock(lockPath, { timeoutMs: 100, staleMs: 1, retryMs: 2 });
    assert.notEqual(acquired.owner.token, "dead");
    await acquired.release();
  });

  it("makes release idempotent for its own handle", async () => {
    const { lockPath } = lockFixture();
    const lock = await acquireFileLock(lockPath);
    await lock.release();
    await lock.release();
  });
});
