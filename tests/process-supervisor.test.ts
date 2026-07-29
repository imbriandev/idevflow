import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSupervised } from "../extensions/appforge/process/supervisor.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function fixture() {
  const create = async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-process-"));
    roots.push(root);
    return root;
  };
  return create();
}

describe("process supervisor", () => {
  it("redacts secrets in tails and persisted logs", async () => {
    const root = await fixture();
    const result = await runSupervised({
      executable: process.execPath,
      args: ["-e", "console.log('token=super-secret'); console.log('literal-capability'); console.error('Bearer abc.def.ghi')"],
      cwd: root,
      timeoutMs: 5_000,
      redactValues: ["literal-capability"],
      stdoutPath: join(root, "stdout.log"),
      stderrPath: join(root, "stderr.log"),
    });
    assert.equal(result.code, 0);
    assert.doesNotMatch(result.stdoutTail, /super-secret/);
    assert.doesNotMatch(await readFile(result.stdoutPath, "utf8"), /super-secret|literal-capability/);
    assert.doesNotMatch(await readFile(result.stderrPath, "utf8"), /abc\.def\.ghi/);
  });

  it("terminates a timed-out process group", async () => {
    const root = await fixture();
    const result = await runSupervised({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: root,
      timeoutMs: 50,
      stdoutPath: join(root, "stdout.log"),
      stderrPath: join(root, "stderr.log"),
    });
    assert.equal(result.timedOut, true);
    assert.notEqual(result.signal, null);
  });

  it("propagates cancellation", async () => {
    const root = await fixture();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const result = await runSupervised({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: root,
      timeoutMs: 5_000,
      stdoutPath: join(root, "stdout.log"),
      stderrPath: join(root, "stderr.log"),
    }, controller.signal);
    assert.equal(result.cancelled, true);
  });
});
