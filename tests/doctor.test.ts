import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_CONFIG } from "../extensions/idevflow/config/config.ts";
import { diagnoseSessions, releaseActiveSession, repairExpiredSessions } from "../extensions/idevflow/recovery/doctor.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import { SimulatorLeaseStore } from "../extensions/idevflow/simulator/leases.ts";
import { heartbeatSession } from "../extensions/idevflow/sessions/service.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("doctor", () => {
  it("reports unregistered iDevFlow worktrees without deleting them", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const orphan = join(fixture.root, "..", `${fixture.root.split("/").pop()}-orphan`);
    await execFileAsync("git", ["worktree", "add", "-b", "idev/orphan", orphan], { cwd: fixture.root });
    cleanups.push(async () => {
      await execFileAsync("git", ["worktree", "remove", "--force", orphan], { cwd: fixture.root }).catch(() => undefined);
      await rm(orphan, { recursive: true, force: true });
    });
    const diagnostics = await diagnoseSessions(await discoverRepository(fixture.root));
    assert.equal(diagnostics.some((item) => item.sessionId.startsWith("orphan:") && item.severity === "warning"), true);
  });

  it("manually releases an active session without deleting its worktree", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const registry = new SessionRegistry(repository);
    const active: WriterSession = {
      id: "active",
      piSessionId: "pi-gone",
      stage: "build",
      task: "preserve me",
      risk: "medium",
      status: "active",
      branch: "idev/preserve",
      worktreePath: fixture.root,
      baseCommit: "a".repeat(40),
      claims: ["README.md"],
      createdAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await registry.start(active, "test");
    const leases = new SimulatorLeaseStore(repository);
    await leases.acquire([{ udid: "device", name: "iPhone", runtimeIdentifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-0", runtimeVersion: "26.0", state: "Shutdown" }], active.id, 60);
    const released = await releaseActiveSession(repository, active.id, "owning Pi session is gone", "test");
    assert.equal(released.status, "stale");
    assert.equal(Object.keys((await leases.load()).leases).length, 0);
    assert.equal(released.worktreePath, fixture.root);
    assert.match(released.statusReason!, /manually released/);
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
      branch: "idev/preserve",
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
