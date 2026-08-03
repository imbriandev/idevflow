import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { initializeConfig } from "../extensions/idevflow/config/config.ts";
import { loadDefinedProduct } from "../extensions/idevflow/documents/product.ts";
import { integratePipelineBatch } from "../extensions/idevflow/pipeline/integration.ts";
import { PipelineService } from "../extensions/idevflow/pipeline/service.ts";
import { PipelineStore } from "../extensions/idevflow/pipeline/store.ts";
import type { PipelineStageReceipts } from "../extensions/idevflow/pipeline/types.ts";
import { loadWorkGraph } from "../extensions/idevflow/planning/work-graph.ts";
import type { SupervisedProcessResult } from "../extensions/idevflow/process/supervisor.ts";
import { discoverRepository, type RepositoryDescriptor } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import { finishSession, receiptFingerprint, runPostflight, writePreflight } from "../extensions/idevflow/sessions/service.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { RuntimeStore } from "../extensions/idevflow/state/runtime-store.ts";
import type { VerificationInput } from "../extensions/idevflow/verification/engine.ts";
import { sourceFingerprint } from "../extensions/idevflow/verification/fingerprint.ts";
import { VerificationReceiptStore } from "../extensions/idevflow/verification/receipts.ts";
import type { VerificationReceipt } from "../extensions/idevflow/verification/types.ts";
import { readWorkerPacket } from "../extensions/idevflow/workers/packets.ts";
import type { WorkerLauncher, WorkerLaunchInput } from "../extensions/idevflow/workers/runner.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function saveVerification(repository: RepositoryDescriptor, session: WriterSession, profile: "integration"): Promise<VerificationReceipt> {
  const source = await sourceFingerprint(session); const fingerprint = randomUUID().replaceAll("-", ""); const now = new Date().toISOString();
  const receipt: VerificationReceipt = { schemaVersion: 1, id: randomUUID(), sessionId: session.id, profile, verificationFingerprint: fingerprint, sourceFingerprint: source.fingerprint, sourceCommit: source.commit, configurationFingerprint: "config", toolchain: { xcode: "Xcode 26", swift: "Apple Swift version 6.2", developerDirectory: "/Applications/Xcode.app", fingerprint: "toolchain" }, startedAt: now, finishedAt: now, success: true, reused: false, commands: [], artifacts: [], proofs: [] };
  await new VerificationReceiptStore(repository).save(fingerprint, receipt); return receipt;
}

class FakeParallelLauncher implements WorkerLauncher {
  active = 0; maxActive = 0;
  constructor(readonly repository: RepositoryDescriptor) {}
  async launch(input: WorkerLaunchInput): Promise<SupervisedProcessResult> {
    this.active += 1; this.maxActive = Math.max(this.maxActive, this.active);
    const packet = await readWorkerPacket(input.packetPath, input.packetDigest);
    await input.onSpawn(10_000 + this.active);
    let session = await writePreflight(this.repository, { piSessionId: `worker-${packet.sliceId}`, stage: "build", task: packet.task, risk: packet.risk, paths: packet.claims });
    for (const claim of packet.claims) { await mkdir(join(session.worktreePath, claim, ".."), { recursive: true }); await writeFile(join(session.worktreePath, claim), `// ${packet.sliceId}\n`); }
    const precommit = await saveVerification(this.repository, session, "integration");
    await runPostflight(this.repository, session, `${packet.sliceId} build evidence`, precommit.verificationFingerprint);
    session = (await new SessionRegistry(this.repository).findLatestByPiSession(`worker-${packet.sliceId}`))!;
    await finishSession(this.repository, session, `feat: ${packet.sliceId}`);
    session = (await new SessionRegistry(this.repository).findLatestByPiSession(`worker-${packet.sliceId}`))!;
    const final = await saveVerification(this.repository, session, "integration");
    const source = await sourceFingerprint(session);
    const receipts: PipelineStageReceipts = { build: { verificationFingerprint: session.postflight!.verificationFingerprint, postflightFingerprint: receiptFingerprint(session.postflight!), sourceCommit: session.commit! }, test: { verificationFingerprint: final.verificationFingerprint, sourceFingerprint: source.fingerprint, sourceCommit: session.commit! }, review: { verdict: "pass", summary: `${packet.sliceId} passed`, residualRisk: "combined verification remains", findings: [], sourceCommit: session.commit! } };
    await new PipelineStore(this.repository).mutate(packet.pipelineId, "fake_worker_submitted", `worker:${packet.sliceId}`, (pipeline) => {
      const slice = pipeline.slices[packet.sliceId]!;
      return { ...pipeline, slices: { ...pipeline.slices, [packet.sliceId]: { ...slice, status: "ready_to_integrate", sessionId: session.id, sourceCommit: session.commit, sourceFingerprint: source.fingerprint, receipts, runs: slice.runs.map((run) => run.packetId === packet.packetId ? { ...run, state: "submitted" as const, finishedAt: new Date().toISOString() } : run) } } };
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    this.active -= 1;
    return { executable: "fake-pi", args: [], cwd: input.cwd, code: 0, signal: null, durationMs: 25, timedOut: false, cancelled: false, stdoutTail: "submitted", stderrTail: "", stdoutPath: input.stdoutPath, stderrPath: input.stderrPath };
  }
}

describe("multi-agent pipeline", () => {
  it("runs independent slices concurrently, integrates one epoch, and verifies a combined candidate", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    for (const suffix of [".idev-worktrees", ".idev-integration", ".idev-epochs", ".idev-candidates"]) cleanups.push(async () => rm(`${fixture.root}${suffix}`, { recursive: true, force: true }));
    await execFileAsync("git", ["config", "user.name", "iDevFlow Tests"], { cwd: fixture.root });
    await execFileAsync("git", ["config", "user.email", "tests@example.invalid"], { cwd: fixture.root });
    const config = await initializeConfig(fixture.root);
    await mkdir(join(fixture.root, "docs/idevflow"), { recursive: true });
    await writeFile(join(fixture.root, config.documents.productMemory), JSON.stringify({ schemaVersion: 1, product: { name: "Pipeline", targetUser: "Founders", problem: "Serial work", promise: "Safe parallel work" }, principles: ["Isolation"], decisions: [] }));
    await writeFile(join(fixture.root, config.documents.slcSpec), JSON.stringify({ schemaVersion: 1, title: "Parallel SLC", simple: ["Two slices"], lovable: ["Fast"], complete: ["Combined"], nonGoals: ["Remote release"], successSignals: ["Both integrate"], risks: ["Conflicts"] }));
    const product = await loadDefinedProduct(fixture.root, config.documents);
    await writeFile(join(fixture.root, config.documents.workGraph), JSON.stringify({ schemaVersion: 1, title: "Parallel graph", sourceSpecFingerprint: product.fingerprint, architecture: [{ id: "ADR-1", title: "Slices", decision: "Use isolated slices", rationale: "Concurrency", status: "accepted" }], slices: [
      { id: "slice-a", title: "A", goal: "Implement A", paths: ["Sources/A.swift"], risk: "medium", dependsOn: [], acceptance: ["A exists"], verificationProfile: "integration" },
      { id: "slice-b", title: "B", goal: "Implement B", paths: ["Sources/B.swift"], risk: "medium", dependsOn: [], acceptance: ["B exists"], verificationProfile: "integration" },
    ] }));
    await execFileAsync("git", ["add", "docs"], { cwd: fixture.root }); await execFileAsync("git", ["commit", "-m", "plan: parallel slices"], { cwd: fixture.root });
    const repository = await discoverRepository(fixture.root); const commit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: fixture.root, encoding: "utf8" })).stdout.trim();
    await execFileAsync("git", ["branch", config.integrationBranch, commit], { cwd: fixture.root });
    const now = new Date();
    const planSession: WriterSession = { id: randomUUID(), piSessionId: "coordinator", stage: "plan", task: "parallel plan", risk: "medium", status: "integrated", branch: "main", worktreePath: fixture.root, baseCommit: commit, claims: ["docs/idevflow"], createdAt: now.toISOString(), heartbeatAt: now.toISOString(), leaseExpiresAt: new Date(now.getTime() + 60_000).toISOString(), commit };
    await new SessionRegistry(repository).start(planSession, "test");
    const runtime = new RuntimeStore(repository); let state = await runtime.initialize("test"); for (const next of ["defined", "planned", "plan_approved"] as const) state = await runtime.transition(next, "test setup", "test", state.revision);
    const graph = await loadWorkGraph(fixture.root, config.documents.workGraph, product.fingerprint);
    await mkdir(join(fixture.root, ".idevflow", "approvals"), { recursive: true }); await writeFile(join(fixture.root, ".idevflow", "approvals", "plan.json"), JSON.stringify({ graphFingerprint: graph.fingerprint, planCommit: commit }));

    const launcher = new FakeParallelLauncher(repository);
    const combinedVerifier = async (input: VerificationInput): Promise<VerificationReceipt> => {
      const source = await sourceFingerprint(input.session as WriterSession); const timestamp = new Date().toISOString();
      return { schemaVersion: 1, id: randomUUID(), sessionId: input.session.id, profile: "integration", verificationFingerprint: "combined-verification", sourceFingerprint: source.fingerprint, sourceCommit: source.commit, configurationFingerprint: "config", toolchain: { xcode: "Xcode 26", swift: "Apple Swift version 6.2", developerDirectory: "/Applications/Xcode.app", fingerprint: "toolchain" }, startedAt: timestamp, finishedAt: timestamp, success: true, reused: false, commands: [], artifacts: [], proofs: [] };
    };
    const splitThenIntegrate: typeof integratePipelineBatch = async (...args) => args[5].length > 1
      ? { success: false, baseCommit: args[3], error: "synthetic batch conflict" }
      : integratePipelineBatch(...args);
    const service = new PipelineService(repository, "/fake/extension.ts", launcher, combinedVerifier, splitThenIntegrate);
    await service.create("parallel-pipeline", "coordinator");
    const completed = await service.run("parallel-pipeline", "coordinator", {});
    assert.equal(launcher.maxActive, 2);
    assert.equal(completed.status, "candidate_ready");
    assert.deepEqual(Object.values(completed.slices).map((slice) => slice.status), ["integrated", "integrated"]);
    assert.equal(completed.batches.some((batch) => batch.result === "split"), true);
    assert.equal((await runtime.status())?.lifecycle, "review_passed");
    assert.equal(await readFile(join(completed.candidate!.candidateWorktree, "Sources/A.swift"), "utf8"), "// slice-a\n");
    assert.equal(await readFile(join(completed.candidate!.candidateWorktree, "Sources/B.swift"), "utf8"), "// slice-b\n");
    await execFileAsync("git", ["checkout", config.integrationBranch], { cwd: fixture.root });
    await execFileAsync("git", ["commit", "--allow-empty", "-m", "external integration drift"], { cwd: fixture.root });
    assert.equal((await service.status("parallel-pipeline")).pipelines[0]?.status, "stale_candidate");
  });
});
