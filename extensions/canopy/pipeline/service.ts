import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { loadConfig, type CanopyConfig } from "../config/config.ts";
import { loadDefinedProduct } from "../documents/product.ts";
import { integrationHead } from "../git/integration.ts";
import { loadWorkGraph, type ValidatedWorkGraph, type WorkSlice } from "../planning/work-graph.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { verifySession, type VerificationInput } from "../verification/engine.ts";
import type { VerificationReceipt } from "../verification/types.ts";
import { integratePipelineBatch } from "./integration.ts";
import { PipelineStore } from "./store.ts";
import { PIPELINE_SCHEMA_VERSION, type IntegrationBatchRecord, type PipelineCandidateSnapshot, type PipelineSliceState, type PipelineState, type WorkerRunRecord } from "./types.ts";
import { buildWorkerPacket, writeWorkerPacket } from "../workers/packets.ts";
import { PiWorkerLauncher, type WorkerLauncher, type WorkerLaunchInput } from "../workers/runner.ts";

const execFileAsync = promisify(execFile);
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const capabilityHash = (value: string): string => createHash("sha256").update(value).digest("hex");
async function git(cwd: string, args: string[]): Promise<string> { return (await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })).stdout.trim(); }
function actor(id: string): string { return `pi-session:${id}`; }
function leaseValid(state: PipelineState): boolean { return Date.parse(state.coordinator.expiresAt) >= Date.now(); }

interface PlanApproval { readonly graphFingerprint: string; readonly planCommit: string }
interface Dispatch { readonly sliceId: string; readonly runId: string; readonly capability: string; readonly launch: WorkerLaunchInput }

export class PipelineService {
  readonly store: PipelineStore;
  constructor(
    readonly repository: RepositoryDescriptor,
    readonly extensionPath: string,
    readonly launcher: WorkerLauncher = new PiWorkerLauncher(),
    readonly combinedVerifier: (input: VerificationInput) => Promise<VerificationReceipt> = verifySession,
    readonly batchIntegrator: typeof integratePipelineBatch = integratePipelineBatch,
  ) { this.store = new PipelineStore(repository); }

  async create(id: string, piSessionId: string): Promise<PipelineState> {
    const config = await loadConfig(this.repository.primaryRoot);
    if (!config.pipeline.enabled) throw new SafetyKernelError("Multi-agent pipeline is disabled in config");
    const runtime = await new RuntimeStore(this.repository).status();
    if (runtime?.lifecycle !== "plan_approved") throw new SafetyKernelError(`Pipeline creation requires plan_approved lifecycle, found ${runtime?.lifecycle ?? "uninitialized"}`);
    const approval = await this.readPlanApproval();
    const graph = await this.currentGraph(config);
    if (graph.fingerprint !== approval.graphFingerprint) throw new SafetyKernelError("Approved plan fingerprint does not match the current work graph");
    if (graph.graph.slices.length > config.pipeline.maxSlices) throw new SafetyKernelError(`Work graph exceeds pipeline.maxSlices=${config.pipeline.maxSlices}`);
    const epoch = await integrationHead(this.repository, config);
    if (epoch !== approval.planCommit) throw new SafetyKernelError("Integration moved after plan approval; re-plan before pipeline creation");
    const now = Date.now();
    const slices = Object.fromEntries(graph.graph.slices.map((slice) => [slice.id, this.initialSlice(slice)]));
    return this.store.create({
      schemaVersion: PIPELINE_SCHEMA_VERSION, id, repositoryFingerprint: this.repository.fingerprint, graphFingerprint: graph.fingerprint, planCommit: approval.planCommit,
      integrationEpoch: epoch, status: "approved", createdAt: new Date(now).toISOString(), coordinator: { ownerPiSessionId: piSessionId, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), expiresAt: new Date(now + config.pipeline.coordinatorLeaseSeconds * 1000).toISOString() },
      slices, batches: [],
    }, actor(piSessionId));
  }

  async status(id?: string): Promise<{ pipelines: PipelineState[] }> {
    const pipelines = id ? [await this.require(id)] : await this.store.list();
    const config = await loadConfig(this.repository.primaryRoot);
    const current = await integrationHead(this.repository, config);
    for (const pipeline of pipelines) {
      if (pipeline.candidate && pipeline.candidate.commit !== current && pipeline.status === "candidate_ready") {
        await this.store.mutate(pipeline.id, "candidate_stale", "pipeline:status", (state) => ({ ...state, status: "stale_candidate", statusReason: "integration moved after combined candidate verification" }));
      }
    }
    return { pipelines: id ? [await this.require(id)] : await this.store.list() };
  }

  async approveRisk(id: string, sliceId: string, piSessionId: string): Promise<PipelineState> {
    await this.assertCoordinator(id, piSessionId);
    return this.store.mutate(id, "slice_risk_approved", actor(piSessionId), (pipeline) => {
      const slice = pipeline.slices[sliceId];
      if (!slice || !["high", "critical"].includes(slice.risk) || slice.status !== "awaiting_risk_approval") throw new SafetyKernelError("Slice is not awaiting high-risk approval");
      return { ...pipeline, slices: { ...pipeline.slices, [sliceId]: { ...slice, riskApproved: true, status: "pending" } } };
    });
  }

  async retrySlice(id: string, sliceId: string, piSessionId: string, reason: string): Promise<PipelineState> {
    if (!reason.trim()) throw new SafetyKernelError("Worker retry reason is required");
    const config = await loadConfig(this.repository.primaryRoot);
    await this.assertCoordinator(id, piSessionId);
    return this.store.mutate(id, "slice_retry_authorized", actor(piSessionId), (pipeline) => {
      const slice = pipeline.slices[sliceId];
      if (!slice || !["worker_lost", "blocked"].includes(slice.status)) throw new SafetyKernelError("Only a lost or blocked slice can be retried");
      if (slice.attempts >= config.pipeline.maxWorkerAttempts) throw new SafetyKernelError(`Slice ${sliceId} exhausted maxWorkerAttempts=${config.pipeline.maxWorkerAttempts}`);
      return { ...pipeline, status: "running", statusReason: reason.trim(), slices: { ...pipeline.slices, [sliceId]: { ...slice, status: "pending", sessionId: undefined, sourceCommit: undefined, sourceFingerprint: undefined, receipts: undefined, blockedReason: undefined } } };
    });
  }

  async pause(id: string, piSessionId: string, reason: string): Promise<PipelineState> {
    if (!reason.trim()) throw new SafetyKernelError("Pause reason is required");
    await this.assertCoordinator(id, piSessionId);
    return this.store.mutate(id, "pipeline_paused", actor(piSessionId), (pipeline) => ({ ...pipeline, status: "paused", statusReason: reason.trim() }));
  }

  async resume(id: string, piSessionId: string, reason: string): Promise<PipelineState> {
    if (!reason.trim()) throw new SafetyKernelError("Resume reason is required");
    await this.assertCoordinator(id, piSessionId);
    return this.store.mutate(id, "pipeline_resumed", actor(piSessionId), (pipeline) => ({ ...pipeline, status: "running", statusReason: reason.trim() }));
  }

  async takeover(id: string, piSessionId: string, reason: string): Promise<PipelineState> {
    if (!reason.trim()) throw new SafetyKernelError("Coordinator takeover reason is required");
    const config = await loadConfig(this.repository.primaryRoot);
    return this.store.mutate(id, "coordinator_taken_over", actor(piSessionId), (pipeline) => {
      if (leaseValid(pipeline) && pipeline.coordinator.ownerPiSessionId !== piSessionId) throw new SafetyKernelError("Coordinator lease is still owned by another Pi session");
      const now = Date.now();
      return { ...pipeline, coordinator: { ownerPiSessionId: piSessionId, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), expiresAt: new Date(now + config.pipeline.coordinatorLeaseSeconds * 1000).toISOString() }, statusReason: reason.trim() };
    });
  }

  async cancel(id: string, piSessionId: string, reason: string): Promise<PipelineState> {
    if (!reason.trim()) throw new SafetyKernelError("Cancellation reason is required");
    const pipeline = await this.assertCoordinator(id, piSessionId);
    for (const slice of Object.values(pipeline.slices)) for (const run of slice.runs) if (run.state === "running" && run.pid) { try { process.kill(-run.pid, "SIGTERM"); } catch { /* already exited */ } }
    return this.store.mutate(id, "pipeline_cancelled", actor(piSessionId), (state) => ({ ...state, status: "cancelled", statusReason: reason.trim(), slices: Object.fromEntries(Object.entries(state.slices).map(([key, slice]) => [key, { ...slice, runs: slice.runs.map((run) => run.state === "running" ? { ...run, state: "cancelled" as const, finishedAt: new Date().toISOString() } : run) }])) }));
  }

  async reconcile(id: string, piSessionId?: string): Promise<PipelineState> {
    let pipeline = await this.require(id);
    const registry = new SessionRegistry(this.repository);
    const sessions = (await registry.load()).sessions;
    const now = Date.now();
    pipeline = await this.store.mutate(id, "pipeline_reconciled", piSessionId ? actor(piSessionId) : "pipeline:reconcile", (state) => {
      const slices: Record<string, PipelineSliceState> = {};
      let blocked = state.status === "blocked";
      for (const [sliceId, slice] of Object.entries(state.slices)) {
        let next = slice;
        const active = [...slice.runs].reverse().find((run) => run.state === "running" || run.state === "reserved");
        if (active && Date.parse(active.leaseExpiresAt) < now && (!active.pid || !this.pidAlive(active.pid))) {
          const session = Object.values(sessions).find((item) => item.task === slice.goal && item.baseCommit === state.integrationEpoch && JSON.stringify([...item.claims].sort()) === JSON.stringify([...slice.claims].sort()));
          const runs = slice.runs.map((run) => run.runId === active.runId ? { ...run, state: "lost" as const, finishedAt: new Date().toISOString() } : run);
          next = session?.status === "ready_for_integration" ? { ...slice, status: "worker_lost", sessionId: session.id, sourceCommit: session.commit, runs, blockedReason: "worker exited before submitting receipts" } : { ...slice, status: "worker_lost", runs, blockedReason: "worker lease expired or process disappeared" };
          blocked = true;
        }
        slices[sliceId] = next;
      }
      return { ...state, status: blocked && state.status !== "cancelled" ? "blocked" : state.status, slices };
    });
    return pipeline;
  }

  async run(id: string, piSessionId: string, options: { readonly model?: string; readonly thinkingLevel?: string; readonly signal?: AbortSignal; readonly onProgress?: (message: string) => void }): Promise<PipelineState> {
    const config = await loadConfig(this.repository.primaryRoot);
    await this.assertCoordinator(id, piSessionId);
    let pipeline = await this.heartbeatCoordinator(id, piSessionId, config);
    if (["paused", "cancelled", "blocked", "candidate_ready", "stale_candidate"].includes(pipeline.status)) throw new SafetyKernelError(`Pipeline ${id} cannot run while ${pipeline.status}`);
    for (let batchIndex = 0; batchIndex < config.pipeline.maxBatchesPerRun; batchIndex += 1) {
      pipeline = await this.reconcile(id, piSessionId);
      const ready = this.readySlices(pipeline).slice(0, config.pipeline.maxConcurrency);
      if (!ready.length) break;
      options.onProgress?.(`Dispatching pipeline batch ${batchIndex + 1}: ${ready.join(", ")}`);
      const dispatches: Dispatch[] = [];
      for (const sliceId of ready) dispatches.push(await this.reserveWorker(pipeline, sliceId, piSessionId, config, options));
      await Promise.all(dispatches.map(async (dispatch) => {
        const result = await this.launcher.launch(dispatch.launch);
        await this.recordWorkerExit(id, dispatch.sliceId, dispatch.runId, result.code);
      }));
      pipeline = await this.require(id);
      const integrable = ready.filter((sliceId) => pipeline.slices[sliceId]?.status === "ready_to_integrate");
      if (integrable.length) pipeline = await this.integrateWithSplitting(id, integrable, pipeline.integrationEpoch, piSessionId, config);
      const batchFailed = ready.some((sliceId) => !["integrated", "pending"].includes(pipeline.slices[sliceId]?.status ?? ""));
      if (batchFailed) break;
    }
    pipeline = await this.require(id);
    if (Object.values(pipeline.slices).every((slice) => slice.status === "integrated")) pipeline = await this.finalizeCandidate(pipeline, piSessionId, config, options.signal, options.onProgress);
    return pipeline;
  }

  private initialSlice(slice: WorkSlice): PipelineSliceState {
    const riskApproved = !["high", "critical"].includes(slice.risk);
    return { id: slice.id, title: slice.title, goal: slice.goal, claims: slice.paths, risk: slice.risk, dependsOn: slice.dependsOn, acceptance: slice.acceptance, verificationProfile: slice.verificationProfile, platforms: slice.platforms ?? ["ios"], status: riskApproved ? "pending" : "awaiting_risk_approval", riskApproved, attempts: 0, repairCycles: 0, runs: [] };
  }

  private readySlices(pipeline: PipelineState): string[] {
    const integrated = new Set(Object.values(pipeline.slices).filter((slice) => slice.status === "integrated").map((slice) => slice.id));
    return Object.values(pipeline.slices).filter((slice) => slice.status === "pending" && slice.riskApproved && slice.dependsOn.every((dependency) => integrated.has(dependency))).map((slice) => slice.id).sort();
  }

  private async reserveWorker(pipeline: PipelineState, sliceId: string, piSessionId: string, config: CanopyConfig, options: { readonly model?: string; readonly thinkingLevel?: string; readonly signal?: AbortSignal }): Promise<Dispatch> {
    const slice = pipeline.slices[sliceId]!;
    const packetId = randomUUID();
    const runId = randomUUID();
    const capability = randomBytes(32).toString("base64url");
    const graph = await this.currentGraph(config);
    const spec = graph.graph.slices.find((item) => item.id === sliceId)!;
    const packet = buildWorkerPacket({ packetId, pipelineId: pipeline.id, repositoryFingerprint: this.repository.fingerprint, graphFingerprint: pipeline.graphFingerprint, planCommit: pipeline.planCommit, integrationEpoch: pipeline.integrationEpoch, slice: spec, maxRepairCycles: config.pipeline.maxRepairCycles });
    const packetPath = join(this.repository.primaryRoot, ".canopy", "pipeline", "packets", `${packetId}.json`);
    await mkdir(dirname(packetPath), { recursive: true, mode: 0o700 });
    const packetHash = await writeWorkerPacket(packetPath, packet);
    const logRoot = join(this.repository.primaryRoot, ".canopy", "logs", "workers", runId);
    const now = Date.now();
    const run: WorkerRunRecord = { runId, packetId, packetPath, packetDigest: packetHash, capabilityHash: capabilityHash(capability), state: "reserved", attempt: slice.attempts + 1, startedAt: new Date(now).toISOString(), leaseExpiresAt: new Date(now + config.pipeline.workerLeaseSeconds * 1000).toISOString(), stdoutPath: join(logRoot, "stdout.jsonl"), stderrPath: join(logRoot, "stderr.log") };
    await this.store.mutate(pipeline.id, "worker_reserved", actor(piSessionId), (state) => ({ ...state, status: "running", slices: { ...state.slices, [sliceId]: { ...state.slices[sliceId]!, status: "dispatched", attempts: state.slices[sliceId]!.attempts + 1, runs: [...state.slices[sliceId]!.runs, run] } } }));
    const launch: WorkerLaunchInput = {
      packetPath, packetDigest: packetHash, capability, extensionPath: this.extensionPath, cwd: this.repository.primaryRoot,
      ...(options.model ? { model: options.model } : {}), ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}), timeoutMs: config.pipeline.workerTimeoutSeconds * 1000,
      stdoutPath: run.stdoutPath, stderrPath: run.stderrPath, ...(options.signal ? { signal: options.signal } : {}),
      onSpawn: async (pid) => { await this.store.mutate(pipeline.id, "worker_spawned", `worker:${runId}`, (state) => { const current = state.slices[sliceId]!; return { ...state, slices: { ...state.slices, [sliceId]: { ...current, status: current.status === "ready_to_integrate" ? current.status : "working", runs: current.runs.map((item) => item.runId === runId && item.state === "reserved" ? { ...item, state: "running", pid } : item) } } }; }); },
    };
    return { sliceId, runId, capability, launch };
  }

  private async recordWorkerExit(id: string, sliceId: string, runId: string, code: number | null): Promise<void> {
    await this.store.mutate(id, "worker_exited", `worker:${runId}`, (pipeline) => {
      const slice = pipeline.slices[sliceId]!;
      const submitted = slice.status === "ready_to_integrate" || slice.status === "blocked" || slice.status === "repair_exhausted";
      const runs = slice.runs.map((run) => run.runId === runId ? { ...run, state: run.state === "submitted" ? run.state : "exited" as const, exitCode: code, finishedAt: new Date().toISOString() } : run);
      return { ...pipeline, status: !submitted ? "blocked" : pipeline.status, statusReason: !submitted ? `${sliceId} worker exited without deterministic submission` : pipeline.statusReason, slices: { ...pipeline.slices, [sliceId]: { ...slice, status: !submitted ? "worker_lost" : slice.status, blockedReason: !submitted ? `worker exited ${String(code)} without submission` : slice.blockedReason, runs } } };
    });
  }

  private async integrateWithSplitting(id: string, sliceIds: readonly string[], sourceEpoch: string, piSessionId: string, config: CanopyConfig): Promise<PipelineState> {
    let pipeline = await this.require(id);
    const currentBase = pipeline.integrationEpoch;
    const registry = new SessionRegistry(this.repository);
    const registryState = await registry.load();
    const inputs = sliceIds.map((sliceId) => ({ sliceId, session: registryState.sessions[pipeline.slices[sliceId]!.sessionId!]! }));
    const result = await this.batchIntegrator(this.repository, config, id, currentBase, sourceEpoch, inputs);
    if (result.success && result.integratedCommit) {
      const record: IntegrationBatchRecord = { id: randomUUID(), sliceIds, baseCommit: currentBase, result: "integrated", integratedCommit: result.integratedCommit, recordedAt: new Date().toISOString() };
      return this.store.mutate(id, "batch_integrated", actor(piSessionId), (state) => ({ ...state, integrationEpoch: result.integratedCommit!, batches: [...state.batches, record], slices: { ...state.slices, ...Object.fromEntries(sliceIds.map((sliceId) => [sliceId, { ...state.slices[sliceId]!, status: "integrated" as const, integratedCommit: result.integratedCommit }])) } }));
    }
    if (sliceIds.length > 1) {
      const middle = Math.ceil(sliceIds.length / 2);
      const left = sliceIds.slice(0, middle), right = sliceIds.slice(middle);
      const split: IntegrationBatchRecord = { id: randomUUID(), sliceIds, baseCommit: currentBase, result: "split", children: [...left, ...right], recordedAt: new Date().toISOString() };
      await this.store.mutate(id, "batch_split", actor(piSessionId), (state) => ({ ...state, batches: [...state.batches, split] }));
      await this.integrateWithSplitting(id, left, sourceEpoch, piSessionId, config);
      return this.integrateWithSplitting(id, right, sourceEpoch, piSessionId, config);
    }
    const conflict: IntegrationBatchRecord = { id: randomUUID(), sliceIds, baseCommit: currentBase, result: "conflicted", recordedAt: new Date().toISOString() };
    return this.store.mutate(id, "batch_conflicted", actor(piSessionId), (state) => ({ ...state, status: "blocked", statusReason: `${sliceIds[0]} integration conflict: ${result.error}`, batches: [...state.batches, conflict], slices: { ...state.slices, [sliceIds[0]!]: { ...state.slices[sliceIds[0]!]!, status: "blocked", blockedReason: result.error } } }));
  }

  private async finalizeCandidate(pipeline: PipelineState, piSessionId: string, config: CanopyConfig, signal?: AbortSignal, onProgress?: (message: string) => void): Promise<PipelineState> {
    if (pipeline.candidate && pipeline.status === "candidate_ready") return pipeline;
    const commit = await integrationHead(this.repository, config);
    if (commit !== pipeline.integrationEpoch) throw new SafetyKernelError("Combined pipeline snapshot is stale before verification");
    const registry = new SessionRegistry(this.repository);
    const existing = Object.values((await registry.load()).sessions).filter((item) => item.task === `combined candidate ${pipeline.id}` && item.status === "integrated" && item.commit === commit).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    let session: WriterSession;
    if (existing && await git(existing.worktreePath, ["rev-parse", "HEAD"]).catch(() => "") === commit && !(await git(existing.worktreePath, ["status", "--porcelain=v1"]).catch(() => "missing"))) {
      session = existing;
    } else {
      const parent = config.pipeline.candidateWorktreeDirectory ? (isAbsolute(config.pipeline.candidateWorktreeDirectory) ? config.pipeline.candidateWorktreeDirectory : resolve(this.repository.primaryRoot, config.pipeline.candidateWorktreeDirectory)) : join(dirname(this.repository.primaryRoot), `${basename(this.repository.primaryRoot)}.canopy-candidates`);
      const candidateId = randomUUID();
      const worktree = join(parent, `${pipeline.id}-${candidateId.slice(0, 8)}`);
      const branch = `canopy/candidate-${pipeline.id}-${candidateId.slice(0, 8)}`;
      await mkdir(parent, { recursive: true });
      await git(this.repository.primaryRoot, ["worktree", "add", "-b", branch, worktree, commit]);
      const now = Date.now();
      session = { id: candidateId, piSessionId, stage: "test", task: `combined candidate ${pipeline.id}`, risk: "high", status: "integrated", branch, worktreePath: worktree, baseCommit: commit, claims: [], createdAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), leaseExpiresAt: new Date(now + config.leaseSeconds * 1000).toISOString(), commit };
      await registry.start(session, `pipeline:${pipeline.id}`);
    }
    onProgress?.(`Running combined verification for ${commit}`);
    let verification: VerificationReceipt;
    try {
      verification = await this.combinedVerifier({ repository: this.repository, config, session, requestedProfile: "integration", ...(signal ? { signal } : {}), ...(onProgress ? { onProgress } : {}) });
    } catch (error) {
      return this.store.mutate(pipeline.id, "combined_verification_failed", actor(piSessionId), (state) => ({ ...state, status: "blocked", statusReason: `combined candidate verification failed: ${(error as Error).message}` }));
    }
    if (!verification.success) return this.store.mutate(pipeline.id, "combined_verification_failed", actor(piSessionId), (state) => ({ ...state, status: "blocked", statusReason: "combined candidate verification failed" }));
    const receiptCore = Object.fromEntries(Object.entries(pipeline.slices).map(([id, slice]) => [id, slice.receipts]));
    const sliceReceiptFingerprint = hash(receiptCore);
    const snapshotCore = { commit, graphFingerprint: pipeline.graphFingerprint, planCommit: pipeline.planCommit, pipelineRevision: pipeline.revision, sliceReceiptFingerprint, combinedVerificationFingerprint: verification.verificationFingerprint, candidateSessionId: session.id };
    const candidate: PipelineCandidateSnapshot = { ...snapshotCore, candidateWorktree: session.worktreePath, fingerprint: hash(snapshotCore), createdAt: new Date().toISOString() };
    await this.writeCombinedLifecycleReceipts(pipeline, candidate, verification.verificationFingerprint);
    await this.advanceRuntime(pipeline.id, commit, piSessionId);
    return this.store.mutate(pipeline.id, "pipeline_candidate_ready", actor(piSessionId), (state) => ({ ...state, status: "candidate_ready", candidate }));
  }

  private async writeCombinedLifecycleReceipts(pipeline: PipelineState, candidate: PipelineCandidateSnapshot, verificationFingerprint: string): Promise<void> {
    const directory = join(this.repository.primaryRoot, ".canopy", "receipts", "stages");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const findings = Object.values(pipeline.slices).flatMap((slice) => slice.receipts?.review.findings ?? []);
    const common = { schemaVersion: 1, outcome: "pass", sourceCommit: candidate.commit, verificationFingerprint, graphFingerprint: pipeline.graphFingerprint, pipelineId: pipeline.id, recordedAt: new Date().toISOString() };
    await writeFileAtomically(join(directory, `build-${candidate.commit}.json`), `${JSON.stringify({ ...common, id: randomUUID(), stage: "build", evidence: "all approved pipeline slices integrated" }, null, 2)}\n`);
    await writeFileAtomically(join(directory, `test-${candidate.commit}.json`), `${JSON.stringify({ ...common, id: randomUUID(), stage: "test", evidence: "combined integration verification passed" }, null, 2)}\n`);
    await writeFileAtomically(join(directory, `review-${candidate.commit}.json`), `${JSON.stringify({ ...common, id: randomUUID(), stage: "review", evidence: "all source-bound worker reviews passed", verdict: { verdict: "pass", summary: "All pipeline slice reviews and combined verification passed", findings, residualRisk: "Release gates and fresh release verification remain" } }, null, 2)}\n`);
  }

  private async advanceRuntime(id: string, commit: string, piSessionId: string): Promise<void> {
    const store = new RuntimeStore(this.repository);
    let state = await store.status();
    const sequence = ["plan_approved", "building", "built", "testing", "tested", "reviewing", "review_passed"] as const;
    const position = state ? sequence.indexOf(state.lifecycle as (typeof sequence)[number]) : -1;
    if (!state || position < 0) throw new SafetyKernelError(`Pipeline completion cannot reconcile lifecycle ${state?.lifecycle ?? "uninitialized"}`);
    for (const to of sequence.slice(position + 1)) state = await store.transition(to, `pipeline ${id} combined source ${commit}`, actor(piSessionId), state.revision);
  }

  private async currentGraph(config: CanopyConfig): Promise<ValidatedWorkGraph> {
    const sessions = Object.values((await new SessionRegistry(this.repository).load()).sessions);
    const plan = sessions.filter((session) => session.stage === "plan" && session.status === "integrated").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!plan) throw new SafetyKernelError("Pipeline requires an integrated plan session");
    if (await git(plan.worktreePath, ["status", "--porcelain=v1"]) || await git(plan.worktreePath, ["rev-parse", "HEAD"]) !== plan.commit) throw new SafetyKernelError("Integrated plan worktree moved or is dirty");
    const product = await loadDefinedProduct(plan.worktreePath, config.documents);
    return loadWorkGraph(plan.worktreePath, config.documents.workGraph, product.fingerprint);
  }

  private async readPlanApproval(): Promise<PlanApproval> {
    try { return JSON.parse(await readFile(join(this.repository.primaryRoot, ".canopy", "approvals", "plan.json"), "utf8")) as PlanApproval; }
    catch (error) { throw new SafetyKernelError("Pipeline requires exact plan approval", { cause: error }); }
  }

  private async require(id: string): Promise<PipelineState> { const state = await this.store.load(id); if (!state) throw new SafetyKernelError(`Unknown pipeline ${id}`); return state; }
  private async assertCoordinator(id: string, piSessionId: string): Promise<PipelineState> { const state = await this.require(id); if (state.coordinator.ownerPiSessionId !== piSessionId || !leaseValid(state)) throw new SafetyKernelError("Pipeline coordinator lease is absent, expired, or owned by another Pi session"); return state; }
  private async heartbeatCoordinator(id: string, piSessionId: string, config: CanopyConfig): Promise<PipelineState> { const now = Date.now(); const runLeaseSeconds = Math.max(config.pipeline.coordinatorLeaseSeconds, config.pipeline.workerTimeoutSeconds * config.pipeline.maxBatchesPerRun + 300); return this.store.mutate(id, "coordinator_heartbeat", actor(piSessionId), (state) => { if (state.coordinator.ownerPiSessionId !== piSessionId || !leaseValid(state)) throw new SafetyKernelError("Coordinator lease cannot be refreshed"); return { ...state, coordinator: { ...state.coordinator, heartbeatAt: new Date(now).toISOString(), expiresAt: new Date(now + runLeaseSeconds * 1000).toISOString() } }; }); }
  private pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
}
