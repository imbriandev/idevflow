import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_CONFIG } from "../extensions/appforge/config/config.ts";
import { diagnoseSessions, repairExpiredSessions } from "../extensions/appforge/recovery/doctor.ts";
import { discoverRepository } from "../extensions/appforge/repository/discovery.ts";
import { SessionRegistry } from "../extensions/appforge/sessions/registry.ts";
import { heartbeatSession } from "../extensions/appforge/sessions/service.ts";
import type { WriterSession } from "../extensions/appforge/sessions/types.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("doctor", () => {
  it("reports unregistered Pi iOS worktrees without deleting them", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const orphan = join(fixture.root, "..", `${fixture.root.split("/").pop()}-orphan`);
    await execFileAsync("git", ["worktree", "add", "-b", "pi-ios/orphan", orphan], { cwd: fixture.root });
    cleanups.push(async () => {
      await execFileAsync("git", ["worktree", "remove", "--force", orphan], { cwd: fixture.root }).catch(() => undefined);
      await rm(orphan, { recursive: true, force: true });
    });
    const diagnostics = await diagnoseSessions(await discoverRepository(fixture.root));
    assert.equal(diagnostics.some((item) => item.sessionId.startsWith("orphan:") && item.severity === "warning"), true);
  });

  it("marks expired sessions stale without deleting worktree metadata", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const registry = new SessionRegistry(repository);
    const expired: WriterSession = {
      id: "expired",
      piSessionId: "pi-expired",
      stage: "build",
      task: "preserve me",
      risk: "medium",
      status: "active",
      branch: "pi-ios/preserve",
      worktreePath: fixture.root,
      baseCommit: "a".repeat(40),
      claims: ["README.md"],
      createdAt: "2000-01-01T00:00:00.000Z",
      heartbeatAt: "2000-01-01T00:00:00.000Z",
      leaseExpiresAt: "2000-01-01T00:01:00.000Z",
    };
    await registry.start(expired, "test");
    await assert.rejects(heartbeatSession(repository, expired, DEFAULT_CONFIG), /lease expired/);
    assert.equal((await diagnoseSessions(repository))[0]?.severity, "warning");
    const repaired = await repairExpiredSessions(repository, "test");
    assert.equal(repaired[0]?.status, "stale");
    assert.equal(repaired[0]?.worktreePath, expired.worktreePath);
  });
});
