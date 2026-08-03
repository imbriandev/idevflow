import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { appendFile } from "node:fs/promises";
import { discoverRepository } from "../extensions/canopy/repository/discovery.ts";
import { SessionRegistry } from "../extensions/canopy/sessions/registry.ts";
import type { WriterSession } from "../extensions/canopy/sessions/types.ts";
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
    branch: `canopy/${id}`,
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
