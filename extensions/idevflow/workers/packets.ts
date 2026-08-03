import { createHash } from "node:crypto";
import { chmod, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ApplePlatform } from "../config/config.ts";
import type { Risk } from "../lifecycle/contracts.ts";
import type { WorkSlice } from "../planning/work-graph.ts";
import { containsSensitiveText } from "../process/redaction.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import type { VerificationProfile } from "../verification/profiles.ts";

export const WORKER_PACKET_SCHEMA_VERSION = 1 as const;

export interface WorkerTaskPacket {
  readonly schemaVersion: typeof WORKER_PACKET_SCHEMA_VERSION;
  readonly packetId: string;
  readonly pipelineId: string;
  readonly repositoryFingerprint: string;
  readonly graphFingerprint: string;
  readonly planCommit: string;
  readonly integrationEpoch: string;
  readonly sliceId: string;
  readonly task: string;
  readonly title: string;
  readonly goal: string;
  readonly claims: readonly string[];
  readonly risk: Risk;
  readonly dependencies: readonly string[];
  readonly acceptance: readonly string[];
  readonly verificationProfile: VerificationProfile;
  readonly platforms: readonly ApplePlatform[];
  readonly maxRepairCycles: number;
  readonly stopConditions: readonly string[];
  readonly createdAt: string;
}

const FORBIDDEN_KEYS = /token|secret|credential|password|authorization|private.?key/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertSecretFree(value: unknown, key = "packet"): void {
  if (FORBIDDEN_KEYS.test(key)) throw new SafetyKernelError(`Worker task packet contains forbidden field ${key}`);
  if (typeof value === "string" && containsSensitiveText(value)) throw new SafetyKernelError(`Worker task packet contains a sensitive value in ${key}`);
  if (Array.isArray(value)) value.forEach((item) => assertSecretFree(item, key));
  else if (value && typeof value === "object") for (const [child, item] of Object.entries(value as Record<string, unknown>)) assertSecretFree(item, child);
}

export function packetDigest(packet: WorkerTaskPacket): string {
  assertSecretFree(packet);
  return createHash("sha256").update(canonical(packet)).digest("hex");
}

export function buildWorkerPacket(input: {
  readonly packetId: string;
  readonly pipelineId: string;
  readonly repositoryFingerprint: string;
  readonly graphFingerprint: string;
  readonly planCommit: string;
  readonly integrationEpoch: string;
  readonly slice: WorkSlice;
  readonly maxRepairCycles: number;
}): WorkerTaskPacket {
  const packet: WorkerTaskPacket = {
    schemaVersion: WORKER_PACKET_SCHEMA_VERSION,
    packetId: input.packetId,
    pipelineId: input.pipelineId,
    repositoryFingerprint: input.repositoryFingerprint,
    graphFingerprint: input.graphFingerprint,
    planCommit: input.planCommit,
    integrationEpoch: input.integrationEpoch,
    sliceId: input.slice.id,
    task: input.slice.goal,
    title: input.slice.title,
    goal: input.slice.goal,
    claims: input.slice.paths,
    risk: input.slice.risk,
    dependencies: input.slice.dependsOn,
    acceptance: input.slice.acceptance,
    verificationProfile: input.slice.verificationProfile,
    platforms: input.slice.platforms ?? ["ios"],
    maxRepairCycles: input.maxRepairCycles,
    stopConditions: ["scope_or_architecture_change", "privacy_or_payment_finding", "write_outside_claims", "missing_evidence", "repair_budget_exhausted"],
    createdAt: new Date().toISOString(),
  };
  packetDigest(packet);
  return packet;
}

export async function writeWorkerPacket(path: string, packet: WorkerTaskPacket): Promise<string> {
  packetDigest(packet);
  await writeFileAtomically(path, `${JSON.stringify(packet, null, 2)}\n`);
  await chmod(path, 0o600);
  return packetDigest(packet);
}

export async function readWorkerPacket(path: string, expectedDigest?: string): Promise<WorkerTaskPacket> {
  let packet: WorkerTaskPacket;
  try { packet = JSON.parse(await readFile(path, "utf8")) as WorkerTaskPacket; }
  catch (error) { throw new SafetyKernelError("Worker task packet is missing or invalid", { cause: error }); }
  if (packet.schemaVersion !== WORKER_PACKET_SCHEMA_VERSION || !packet.packetId || !packet.pipelineId || !packet.sliceId || !Array.isArray(packet.claims)) throw new SafetyKernelError("Worker task packet envelope is invalid");
  const digest = packetDigest(packet);
  if (expectedDigest && digest !== expectedDigest) throw new SafetyKernelError("Worker task packet digest mismatch");
  return packet;
}

export async function assertPacketPath(path: string, primaryRoot: string): Promise<string> {
  const absolute = await realpath(resolve(path));
  const packetRoot = await realpath(resolve(primaryRoot, ".idevflow", "pipeline", "packets"));
  const child = relative(packetRoot, absolute);
  if (!child || child === ".." || child.startsWith("../") || isAbsolute(child)) throw new SafetyKernelError("Worker packet path escapes the pipeline packet directory");
  return absolute;
}
