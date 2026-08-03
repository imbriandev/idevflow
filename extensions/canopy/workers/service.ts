import { createHash } from "node:crypto";
import type { CanopyConfig } from "../config/config.ts";
import { loadConfig } from "../config/config.ts";
import { PipelineStore } from "../pipeline/store.ts";
import type { PipelineFinding, PipelineSliceState, PipelineStageReceipts, WorkerRunRecord } from "../pipeline/types.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { heartbeatSession, receiptFingerprint } from "../sessions/service.ts";
import { leaseIsValid } from "../sessions/types.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { sourceFingerprint } from "../verification/fingerprint.ts";
import { VERIFICATION_PROFILES } from "../verification/profiles.ts";
import { VerificationReceiptStore } from "../verification/receipts.ts";
import { assertPacketPath, readWorkerPacket, type WorkerTaskPacket } from "./packets.ts";

function capabilityHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export interface WorkerVerdict {
  readonly verdict: "pass";
  readonly summary: string;
  readonly residualRisk: string;
  readonly findings: readonly PipelineFinding[];
}

function validateVerdict(value: unknown): WorkerVerdict {
  if (!value || typeof value !== "object") throw new SafetyKernelError("Worker review verdict must be an object");
  const raw = value as Record<string, unknown>;
  if (raw.verdict !== "pass" || typeof raw.summary !== "string" || !raw.summary.trim() || typeof raw.residualRisk !== "string" || !raw.residualRisk.trim() || !Array.isArray(raw.findings)) throw new SafetyKernelError("Worker verdict requires pass, summary, residualRisk, and findings");
  const findings = raw.findings.map((item, index) => {
    if (!item || typeof item !== "object") throw new SafetyKernelError(`Worker finding ${index} is invalid`);
    const finding = item as Record<string, unknown>;
    const severity = String(finding.severity);
    if (!["critical", "high", "medium", "low"].includes(severity)) throw new SafetyKernelError(`Worker finding ${index} severity is invalid`);
    for (const key of ["area", "finding", "evidence"] as const) if (typeof finding[key] !== "string" || !String(finding[key]).trim()) throw new SafetyKernelError(`Worker finding ${index}.${key} is required`);
    return { severity: severity as PipelineFinding["severity"], area: String(finding.area).trim(), finding: String(finding.finding).trim(), evidence: String(finding.evidence).trim() };
  });
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) throw new SafetyKernelError("A passing worker review cannot contain critical or high findings");
  return { verdict: "pass", summary: raw.summary.trim(), residualRisk: raw.residualRisk.trim(), findings };
}

async function context(repository: RepositoryDescriptor): Promise<{ packet: WorkerTaskPacket; capability: string; config: CanopyConfig }> {
  const path = process.env.CANOPY_WORKER_PACKET;
  const capability = process.env.CANOPY_WORKER_CAPABILITY;
  if (!path || !capability) throw new SafetyKernelError("Pipeline worker capability context is unavailable");
  const packet = await readWorkerPacket(await assertPacketPath(path, repository.primaryRoot), process.env.CANOPY_WORKER_PACKET_DIGEST);
  if (packet.repositoryFingerprint !== repository.fingerprint) throw new SafetyKernelError("Worker packet belongs to another repository");
  return { packet, capability, config: await loadConfig(repository.primaryRoot) };
}

function locateRun(slice: PipelineSliceState, packet: WorkerTaskPacket, capability: string): WorkerRunRecord {
  const run = [...slice.runs].reverse().find((item) => item.packetId === packet.packetId);
  if (!run || run.capabilityHash !== capabilityHash(capability) || !["reserved", "running"].includes(run.state)) throw new SafetyKernelError("Worker capability is invalid, stale, or already consumed");
  return run;
}

export async function heartbeatPipelineWorker(repository: RepositoryDescriptor, piSessionId: string): Promise<void> {
  if (!process.env.CANOPY_WORKER_PACKET) return;
  const { packet, capability, config } = await context(repository);
  const now = Date.now();
  await new PipelineStore(repository).mutate(packet.pipelineId, "worker_heartbeat", `worker:${packet.packetId}`, (pipeline) => {
    const slice = pipeline.slices[packet.sliceId];
    if (!slice) throw new SafetyKernelError("Worker slice is missing from pipeline");
    const run = locateRun(slice, packet, capability);
    const runs = slice.runs.map((item) => item.runId === run.runId ? { ...item, state: "running" as const, leaseExpiresAt: new Date(now + config.pipeline.workerLeaseSeconds * 1000).toISOString() } : item);
    return { ...pipeline, slices: { ...pipeline.slices, [slice.id]: { ...slice, status: "working", runs } } };
  });
  const session = await new SessionRegistry(repository).findLatestByPiSession(piSessionId);
  if (session?.status === "active" && leaseIsValid(session)) await heartbeatSession(repository, session, config).catch(() => undefined);
}

export async function reportWorkerRepair(repository: RepositoryDescriptor, piSessionId: string, finding: string): Promise<{ allowed: boolean; repairCycles: number; maximum: number }> {
  if (!finding.trim()) throw new SafetyKernelError("Repair finding is required");
  const { packet, capability, config } = await context(repository);
  let allowed = false;
  let cycles = 0;
  await new PipelineStore(repository).mutate(packet.pipelineId, "worker_repair_reported", `worker:${piSessionId}`, (pipeline) => {
    const slice = pipeline.slices[packet.sliceId];
    if (!slice) throw new SafetyKernelError("Worker slice is missing");
    locateRun(slice, packet, capability);
    cycles = slice.repairCycles + 1;
    allowed = cycles <= config.pipeline.maxRepairCycles;
    return { ...pipeline, status: allowed ? pipeline.status : "blocked", statusReason: allowed ? pipeline.statusReason : `${slice.id} exhausted repair budget`, slices: { ...pipeline.slices, [slice.id]: { ...slice, repairCycles: cycles, status: allowed ? "working" : "repair_exhausted", blockedReason: allowed ? finding.trim() : `repair budget exhausted: ${finding.trim()}` } } };
  });
  return { allowed, repairCycles: cycles, maximum: config.pipeline.maxRepairCycles };
}

export async function blockPipelineWorker(repository: RepositoryDescriptor, piSessionId: string, evidence: string): Promise<void> {
  if (!evidence.trim()) throw new SafetyKernelError("Worker block evidence is required");
  const { packet, capability } = await context(repository);
  await new PipelineStore(repository).mutate(packet.pipelineId, "worker_blocked", `worker:${piSessionId}`, (pipeline) => {
    const slice = pipeline.slices[packet.sliceId];
    if (!slice) throw new SafetyKernelError("Worker slice is missing");
    const run = locateRun(slice, packet, capability);
    const runs = slice.runs.map((item) => item.runId === run.runId ? { ...item, state: "submitted" as const, finishedAt: new Date().toISOString() } : item);
    return { ...pipeline, status: "blocked", statusReason: `${slice.id}: ${evidence.trim()}`, slices: { ...pipeline.slices, [slice.id]: { ...slice, status: "blocked", blockedReason: evidence.trim(), runs } } };
  });
}

export async function submitPipelineWorker(
  repository: RepositoryDescriptor,
  piSessionId: string,
  verificationFingerprint: string,
  verdictInput: unknown,
): Promise<PipelineStageReceipts> {
  const verdict = validateVerdict(verdictInput);
  const { packet, capability } = await context(repository);
  const registry = new SessionRegistry(repository);
  const session = await registry.findLatestByPiSession(piSessionId);
  if (!session || session.status !== "ready_for_integration" || !session.commit || !session.postflight) throw new SafetyKernelError("Worker submission requires its finished ready session");
  if (session.stage !== "build" || session.baseCommit !== packet.integrationEpoch || JSON.stringify([...session.claims].sort()) !== JSON.stringify([...packet.claims].sort())) throw new SafetyKernelError("Worker session does not match packet epoch and claims");
  const verification = await new VerificationReceiptStore(repository).validated(verificationFingerprint);
  const source = await sourceFingerprint(session);
  const minimumRank = Math.max(VERIFICATION_PROFILES.indexOf("integration"), VERIFICATION_PROFILES.indexOf(packet.verificationProfile));
  if (!verification || !verification.success || verification.sessionId !== session.id || verification.sourceCommit !== session.commit || verification.sourceFingerprint !== source.fingerprint || VERIFICATION_PROFILES.indexOf(verification.profile) < minimumRank) throw new SafetyKernelError("Worker submission requires current integration-or-stronger verification for its exact ready commit");
  const receipts: PipelineStageReceipts = {
    build: { verificationFingerprint: session.postflight.verificationFingerprint, postflightFingerprint: receiptFingerprint(session.postflight), sourceCommit: session.commit },
    test: { verificationFingerprint, sourceFingerprint: source.fingerprint, sourceCommit: session.commit },
    review: { verdict: "pass", summary: verdict.summary, residualRisk: verdict.residualRisk, findings: verdict.findings, sourceCommit: session.commit },
  };
  await new PipelineStore(repository).mutate(packet.pipelineId, "worker_submitted", `worker:${piSessionId}`, (pipeline) => {
    if (pipeline.graphFingerprint !== packet.graphFingerprint || pipeline.planCommit !== packet.planCommit || pipeline.integrationEpoch !== packet.integrationEpoch) throw new SafetyKernelError("Worker packet became stale before submission");
    const slice = pipeline.slices[packet.sliceId];
    if (!slice) throw new SafetyKernelError("Worker slice is missing");
    const run = locateRun(slice, packet, capability);
    const runs = slice.runs.map((item) => item.runId === run.runId ? { ...item, state: "submitted" as const, finishedAt: new Date().toISOString() } : item);
    return { ...pipeline, slices: { ...pipeline.slices, [slice.id]: { ...slice, status: "ready_to_integrate", sessionId: session.id, sourceCommit: session.commit, sourceFingerprint: source.fingerprint, receipts, runs } } };
  });
  return receipts;
}
