import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { initializeConfig, loadConfig } from "../extensions/idevflow/config/config.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { RuntimeStore } from "../extensions/idevflow/state/runtime-store.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import { finishSession, runPostflight, writePreflight } from "../extensions/idevflow/sessions/service.ts";
import { verifySession } from "../extensions/idevflow/verification/engine.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup() {
  const fixture = await createGitFixture();
  cleanups.push(fixture.cleanup);
  await execFileAsync("git", ["config", "user.name", "iDevFlow Tests"], { cwd: fixture.root });
  await execFileAsync("git", ["config", "user.email", "tests@example.invalid"], { cwd: fixture.root });
  const repository = await discoverRepository(fixture.root);
  await new RuntimeStore(repository).initialize("test");
  await initializeConfig(repository.primaryRoot);
  cleanups.push(async () => rm(`${fixture.root}.idev-worktrees`, { recursive: true, force: true }));
  return { fixture, repository };
}

describe("writer session service", () => {
  it("runs preflight, catches scope drift, records postflight, and commits exact source", async () => {
    const { fixture, repository } = await setup();
    let session = await writePreflight(repository, {
      piSessionId: "pi-one",
      stage: "build",
      task: "update fixture",
      risk: "medium",
      paths: ["README.md"],
    });
    assert.notEqual(session.worktreePath, fixture.root);
    await writeFile(`${session.worktreePath}/README.md`, "# Updated\n", "utf8");
    await writeFile(`${session.worktreePath}/outside.txt`, "scope drift\n", "utf8");
    await assert.rejects(runPostflight(repository, session, "focused proof", "missing"), /outside claimed paths/);
    await rm(`${session.worktreePath}/outside.txt`);

    const config = await loadConfig(repository.primaryRoot);
    const verification = await verifySession({ repository, config, session });
    assert.equal(verification.success, true);
    await writeFile(verification.artifacts[0]!.path, "tampered\n");
    await assert.rejects(runPostflight(repository, session, "focused proof", verification.verificationFingerprint), /missing, invalid/);
    const freshVerification = await verifySession({ repository, config, session });
    assert.equal(freshVerification.reused, false);
    const receipt = await runPostflight(repository, session, "focused proof", freshVerification.verificationFingerprint);
    assert.deepEqual(receipt.changedFiles, ["README.md"]);
    session = (await new SessionRegistry(repository).findByPiSession("pi-one"))!;
    const commit = await finishSession(repository, session, "test: update fixture");
    assert.match(commit, /^[a-f0-9]{40}$/);
    assert.equal(await readFile(`${fixture.root}/README.md`, "utf8"), "# Fixture\n");
    assert.equal((await new SessionRegistry(repository).findByPiSession("pi-one"))?.status, "ready_for_integration");
  });

  it("preserves exclusive ownership when two preflights race", async () => {
    const { repository } = await setup();
    const results = await Promise.allSettled([
      writePreflight(repository, { piSessionId: "pi-a", stage: "build", task: "a", risk: "medium", paths: ["README.md"] }),
      writePreflight(repository, { piSessionId: "pi-b", stage: "build", task: "b", risk: "medium", paths: ["README.md"] }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const sessions = Object.values((await new SessionRegistry(repository).load()).sessions);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.claims[0], "README.md");
  });
});
