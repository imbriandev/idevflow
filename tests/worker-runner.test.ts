import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkerPacket, writeWorkerPacket } from "../extensions/appforge/workers/packets.ts";
import { PiWorkerLauncher } from "../extensions/appforge/workers/runner.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("isolated worker process", () => {
  it("spawns a separate supervised process and redacts its capability", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-worker-runner-")); roots.push(root);
    const packet = buildWorkerPacket({ packetId: "packet", pipelineId: "pipeline", repositoryFingerprint: "repo", graphFingerprint: "graph", planCommit: "commit", integrationEpoch: "epoch", maxRepairCycles: 2, slice: { id: "slice", title: "Slice", goal: "Work", paths: ["Sources/A.swift"], risk: "low", dependsOn: [], acceptance: ["done"], verificationProfile: "quick" } });
    const packetPath = join(root, "packet.json"); const digest = await writeWorkerPacket(packetPath, packet);
    const script = join(root, "child.mjs");
    await writeFile(script, "console.log(`pid=${process.pid} capability=${process.env.PI_IOS_WORKER_CAPABILITY}`);\n");
    let spawnedPid = 0; let piArgs: string[] = [];
    const launcher = new PiWorkerLauncher((args) => { piArgs = args; return { executable: process.execPath, args: [script] }; });
    const result = await launcher.launch({ packetPath, packetDigest: digest, capability: "pipeline-capability-value", extensionPath: "/extension.ts", cwd: root, timeoutMs: 5_000, stdoutPath: join(root, "stdout.log"), stderrPath: join(root, "stderr.log"), onSpawn(pid) { spawnedPid = pid; } });
    assert.equal(result.code, 0);
    assert.notEqual(spawnedPid, process.pid);
    assert.doesNotMatch(await readFile(result.stdoutPath, "utf8"), /pipeline-capability-value/);
    assert.match(await readFile(result.stdoutPath, "utf8"), /\[REDACTED\]/);
    assert.equal(piArgs.some((arg) => arg.includes("pi_ios_context")), true);
    assert.equal(piArgs.at(-1)?.includes("Call pi_ios_context"), true);
  });
});
