import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { appendFile } from "node:fs/promises";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

function session(id: string, claim: string): WriterSession {
  const now = new Date().toISOString();
  return {
    id,
    piSessionId: `pi-${id}`,
    stage: "build",
    task: id,
    risk: "medium",
    status: "active",
    branch: `idev/${id}`,
    worktreePath: `/tmp/${id}`,
    baseCommit: "a".repeat(40),
    claims: [claim],
    createdAt: now,
    heartbeatAt: now,
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("writer session registry", () => {
  it("serializes exclusive claims across concurrent sessions", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const registry = new SessionRegistry(await discoverRepository(fixture.root));
    const results = await Promise.allSettled([
      registry.start(session("one", "Sources/App"), "test"),
      registry.start(session("two", "Sources/App/File.swift"), "test"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(Object.keys((await registry.load()).sessions).length, 1);
  });

  it("repairs an incomplete final event only during a locked mutation", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const registry = new SessionRegistry(await discoverRepository(fixture.root));
    await registry.start(session("one", "Sources/One"), "test");
    await appendFile(registry.journalPath, "{\"partial\":", "utf8");
    await assert.rejects(registry.load(), /incomplete final record/);
    await registry.start(session("two", "Sources/Two"), "test");
    assert.equal(Object.keys((await registry.load()).sessions).length, 2);
  });

  it("does not let a released session revive through stale in-memory state", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const registry = new SessionRegistry(await discoverRepository(fixture.root));
    const active = session("released", "Sources/App");
    await registry.start(active, "test");
    await registry.changeStatus(active.id, "stale", "manual recovery", "test");
    await assert.rejects(registry.heartbeat(active.id, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString(), "test"), /requires active/);
    await assert.rejects(registry.claim(active.id, ["Sources/Other"], "test"), /requires active/);
    await assert.rejects(registry.recordPostflight(active.id, { evidence: "old session", changedFiles: ["Sources/App"], diffHash: "x", verificationReceiptId: "x", verificationFingerprint: "x", verificationProfile: "quick", recordedAt: new Date().toISOString() }, "test"), /requires active/);
  });

  it("reopens a completed session on its completed commit for a fresh postflight", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const registry = new SessionRegistry(await discoverRepository(fixture.root));
    const completed = { ...session("completed", "docs"), status: "ready_for_integration" as const, commit: "b".repeat(40) };
    await registry.start(completed, "test");
    const reopened = (await registry.reopen(completed, "new-pi-chat", "schema repair", "test")).sessions[completed.id]!;
    assert.equal(reopened.status, "active");
    assert.equal(reopened.piSessionId, "new-pi-chat");
    assert.equal(reopened.baseCommit, completed.commit);
    assert.equal(reopened.commit, undefined);
    assert.equal(reopened.postflight, undefined);
  });

  it("repairs a partial tail only through explicit recovery", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const registry = new SessionRegistry(await discoverRepository(fixture.root));
    await registry.start(session("one", "Sources/One"), "test");
    await appendFile(registry.journalPath, "{\"partial\":", "utf8");
    assert.equal(await registry.repairPartialTail(), true);
    assert.equal(Object.keys((await registry.load()).sessions).length, 1);
  });

  it("refuses to resume a parked session after another session claims its path", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const registry = new SessionRegistry(await discoverRepository(fixture.root));
    const parked = session("parked", "Sources/App");
    await registry.start(parked, "test");
    await registry.changeStatus(parked.id, "parked", "pause", "test");
    await registry.start(session("owner", "Sources/App/File.swift"), "test");
    await assert.rejects(registry.resume({ ...parked, status: "parked" }, "resume", "test"), /overlaps/);
  });
});
