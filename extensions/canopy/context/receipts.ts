import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Risk, Stage } from "../lifecycle/contracts.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import type { WriterSession } from "../sessions/types.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { withFileLock } from "../state/file-lock.ts";
import type { VerificationProfile } from "../verification/profiles.ts";
import type { KnowledgeSelection } from "./knowledge.ts";

export interface ContextReceipt {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sessionId: string;
  readonly stage: Stage;
  readonly risk: Risk;
  readonly task: string;
  readonly selectionFingerprint: string;
  readonly references: readonly { readonly id: string; readonly relativePath: string; readonly reason: string }[];
  readonly surfaces: readonly string[];
  readonly selectedAt: string;
}

function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, "_"); }
function directory(repository: RepositoryDescriptor): string { return join(repository.primaryRoot, ".canopy", "receipts", "context"); }
function path(repository: RepositoryDescriptor, sessionId: string, stage: Stage): string { return join(directory(repository), `${safeId(sessionId)}-${stage}.json`); }
function lockPath(repository: RepositoryDescriptor): string { return join(repository.primaryRoot, ".canopy", "state", "locks", "context-receipts.lock"); }

export async function recordContextReceipt(repository: RepositoryDescriptor, input: { readonly session: WriterSession; readonly stage: Stage; readonly risk: Risk; readonly task: string; readonly selection: KnowledgeSelection }): Promise<ContextReceipt> {
  if (!input.task.trim()) throw new SafetyKernelError("Context receipt requires a non-empty task");
  const references = input.selection.references.map((reference) => ({ id: reference.id, relativePath: reference.relativePath, reason: reference.reason }));
  const selectionFingerprint = digest({ stage: input.stage, risk: input.risk, task: input.task.trim(), surfaces: input.selection.surfaces, references });
  const receipt: ContextReceipt = { schemaVersion: 1, id: randomUUID(), sessionId: input.session.id, stage: input.stage, risk: input.risk, task: input.task.trim(), selectionFingerprint, references, surfaces: input.selection.surfaces, selectedAt: new Date().toISOString() };
  await withFileLock(lockPath(repository), async () => {
    await mkdir(directory(repository), { recursive: true, mode: 0o700 });
    await writeFileAtomically(path(repository, input.session.id, input.stage), `${JSON.stringify(receipt, null, 2)}\n`);
  });
  return receipt;
}

export async function loadContextReceipt(repository: RepositoryDescriptor, sessionId: string, stage: Stage): Promise<ContextReceipt | undefined> {
  try {
    const receipt = JSON.parse(await readFile(path(repository, sessionId, stage), "utf8")) as ContextReceipt;
    if (receipt.schemaVersion !== 1 || receipt.sessionId !== sessionId || receipt.stage !== stage || !receipt.selectionFingerprint || !receipt.references.length || !receipt.task.trim()) throw new SafetyKernelError("Context receipt is invalid");
    return receipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function contextRequired(input: { readonly risk: Risk; readonly profile?: VerificationProfile; readonly stage?: Stage }): boolean {
  return input.risk === "high" || input.risk === "critical" || input.profile === "release" || input.stage === "ship";
}

export async function requireContextReceipt(repository: RepositoryDescriptor, input: { readonly session: WriterSession; readonly stage: Stage; readonly risk: Risk; readonly profile?: VerificationProfile }): Promise<ContextReceipt | undefined> {
  if (!contextRequired(input)) return undefined;
  const expectedStage = input.profile === "release" ? "ship" : input.stage;
  const receipt = await loadContextReceipt(repository, input.session.id, expectedStage);
  if (!receipt) throw new SafetyKernelError(`A ${expectedStage} specialist context receipt is required before ${input.profile === "release" ? "release verification" : "high-risk verification or review"}`);
  if (input.profile === "release") {
    if (receipt.risk !== "critical") throw new SafetyKernelError("Release verification requires a critical-risk specialist context receipt");
  } else if (receipt.risk !== input.risk) {
    throw new SafetyKernelError("Specialist context receipt risk does not match the current session");
  }
  return receipt;
}
