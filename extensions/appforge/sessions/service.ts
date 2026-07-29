import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import { loadConfig, type PiIosConfig } from "../config/config.ts";
import { requireBaseline } from "../git/baseline.ts";
import { assertChangedFilesClaimed, changedFiles, commitChangedFiles, diffCheck, fingerprintChanges } from "../git/changes.ts";
import { assertNoClaimConflicts, normalizeClaim } from "../git/claims.ts";
import type { Risk, Stage } from "../lifecycle/contracts.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { SessionRegistry } from "./registry.ts";
import { leaseIsValid, type PostflightReceipt, type WriterSession } from "./types.ts";
import { createWriterWorktree } from "./worktree.ts";
import { sourceFingerprint } from "../verification/fingerprint.ts";
import { VERIFICATION_PROFILES, selectVerificationProfile } from "../verification/profiles.ts";
import { VerificationReceiptStore } from "../verification/receipts.ts";

const execFileAsync = promisify(execFile);

function actor(piSessionId: string): string {
  return `pi-session:${piSessionId}`;
}

async function ensureRuntime(repository: RepositoryDescriptor): Promise<void> {
  const state = await new RuntimeStore(repository).status();
  if (!state) throw new SafetyKernelError("Pi iOS runtime is not initialized; call pi_ios_runtime initialize first");
}

async function removeUnstartedWorktree(repository: RepositoryDescriptor, session: WriterSession): Promise<void> {
  await execFileAsync("git", ["worktree", "remove", "--force", session.worktreePath], { cwd: repository.primaryRoot }).catch(() => undefined);
  await execFileAsync("git", ["branch", "-D", session.branch], { cwd: repository.primaryRoot }).catch(() => undefined);
  await rm(session.worktreePath, { recursive: true, force: true });
}

export interface PreflightInput {
  readonly piSessionId: string;
  readonly stage: Stage;
  readonly task: string;
  readonly risk: Risk;
  readonly paths: readonly string[];
}

export async function writePreflight(repository: RepositoryDescriptor, input: PreflightInput): Promise<WriterSession> {
  await ensureRuntime(repository);
  const config = await loadConfig(repository.primaryRoot);
  const registry = new SessionRegistry(repository);
  const latest = await registry.findLatestByPiSession(input.piSessionId);
  if (latest?.status === "active") {
    if (!leaseIsValid(latest)) throw new SafetyKernelError(`Session ${latest.id} lease expired; run doctor repair and resume explicitly`);
    const claims = input.paths.map((path) => normalizeClaim(path, latest.worktreePath));
    const state = await registry.load();
    assertNoClaimConflicts(claims, Object.values(state.sessions), latest.id);
    const next = await registry.claim(latest.id, claims, actor(input.piSessionId));
    return next.sessions[latest.id]!;
  }
  if (latest?.status === "postflight_passed") {
    throw new SafetyKernelError(`Session ${latest.id} has passed postflight; finish it before requesting new writes`);
  }
  if (latest && (latest.status === "parked" || latest.status === "stale")) {
    throw new SafetyKernelError(`Session ${latest.id} is ${latest.status}; resume it explicitly before requesting another write preflight`);
  }

  await requireBaseline(repository, config);
  if (!input.task.trim()) throw new SafetyKernelError("Write preflight requires a non-empty task");
  if (!input.paths.length) throw new SafetyKernelError("Write preflight requires at least one intended path");
  const session = await createWriterWorktree({ repository, config, ...input });
  const claims = input.paths.map((path) => normalizeClaim(path, session.worktreePath));
  const claimedSession: WriterSession = { ...session, claims };
  try {
    const state = await registry.load();
    assertNoClaimConflicts(claims, Object.values(state.sessions), session.id);
    const next = await registry.start(claimedSession, actor(input.piSessionId));
    return next.sessions[session.id]!;
  } catch (error) {
    await removeUnstartedWorktree(repository, session);
    throw error;
  }
}

export async function heartbeatSession(
  repository: RepositoryDescriptor,
  session: WriterSession,
  config: PiIosConfig,
  allowExpired = false,
): Promise<WriterSession> {
  const now = new Date();
  if (!allowExpired && !leaseIsValid(session, now.getTime())) {
    throw new SafetyKernelError(`Session ${session.id} lease expired; it must be marked stale and resumed explicitly`);
  }
  const state = await new SessionRegistry(repository).heartbeat(
    session.id,
    now.toISOString(),
    new Date(now.getTime() + config.leaseSeconds * 1000).toISOString(),
    actor(session.piSessionId),
  );
  return state.sessions[session.id]!;
}

export async function runPostflight(
  repository: RepositoryDescriptor,
  session: WriterSession,
  evidence: string,
  verificationFingerprint: string,
): Promise<PostflightReceipt> {
  if (session.status !== "active") throw new SafetyKernelError(`Postflight requires an active session, found ${session.status}`);
  if (!leaseIsValid(session)) throw new SafetyKernelError(`Session ${session.id} lease expired before postflight`);
  if (!evidence.trim()) throw new SafetyKernelError("Postflight evidence cannot be empty");
  const files = await changedFiles(session.worktreePath);
  if (!files.length) throw new SafetyKernelError("Postflight found no changed files");
  assertChangedFilesClaimed(files, session.claims);
  await diffCheck(session.worktreePath);
  if (!verificationFingerprint.trim()) throw new SafetyKernelError("Postflight requires a verification fingerprint");
  const verification = await new VerificationReceiptStore(repository).validated(verificationFingerprint);
  if (!verification || verification.sessionId !== session.id) throw new SafetyKernelError("Postflight verification receipt is missing, invalid, or belongs to another session");
  const source = await sourceFingerprint(session);
  if (verification.sourceFingerprint !== source.fingerprint || verification.sourceCommit !== source.commit) {
    throw new SafetyKernelError("Postflight source does not match the verification receipt");
  }
  const requiredProfile = selectVerificationProfile({ stage: session.stage, risk: session.risk, changedFiles: files });
  if (VERIFICATION_PROFILES.indexOf(verification.profile) < VERIFICATION_PROFILES.indexOf(requiredProfile)) {
    throw new SafetyKernelError(`Verification profile ${verification.profile} is weaker than required ${requiredProfile}`);
  }
  const receipt: PostflightReceipt = {
    evidence: evidence.trim(),
    changedFiles: files,
    diffHash: await fingerprintChanges(session.worktreePath, files),
    verificationReceiptId: verification.id,
    verificationFingerprint: verification.verificationFingerprint,
    verificationProfile: verification.profile,
    recordedAt: new Date().toISOString(),
  };
  await new SessionRegistry(repository).recordPostflight(session.id, receipt, actor(session.piSessionId));
  return receipt;
}

export async function finishSession(
  repository: RepositoryDescriptor,
  session: WriterSession,
  commitMessage: string,
): Promise<string> {
  if (session.status !== "postflight_passed" || !session.postflight) {
    throw new SafetyKernelError("Finish requires a current successful postflight receipt");
  }
  if (!leaseIsValid(session)) throw new SafetyKernelError(`Session ${session.id} lease expired before finish`);
  const files = await changedFiles(session.worktreePath);
  assertChangedFilesClaimed(files, session.claims);
  const fingerprint = await fingerprintChanges(session.worktreePath, files);
  if (fingerprint !== session.postflight.diffHash) throw new SafetyKernelError("Source changed after postflight; run postflight again");
  if (!commitMessage.trim()) throw new SafetyKernelError("Commit message cannot be empty");
  const beforeResult = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: session.worktreePath, encoding: "utf8" });
  if (beforeResult.stdout.trim() !== session.baseCommit) {
    throw new SafetyKernelError("Writer HEAD changed outside controlled finish; preserve the branch and diagnose before continuing");
  }
  await execFileAsync("git", ["add", "-A", "--", ...session.claims], { cwd: session.worktreePath });
  await execFileAsync("git", ["commit", "--no-gpg-sign", "-m", commitMessage.trim()], {
    cwd: session.worktreePath,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: session.worktreePath, encoding: "utf8" });
  const commit = result.stdout.trim();
  assertChangedFilesClaimed(await commitChangedFiles(session.worktreePath, commit), session.claims);
  const remaining = await changedFiles(session.worktreePath);
  if (remaining.length) {
    throw new SafetyKernelError(`Worktree changed during commit hooks and remains dirty: ${remaining.join(", ")}`);
  }
  await new SessionRegistry(repository).markReady(session.id, commit, actor(session.piSessionId));
  return commit;
}

export function receiptFingerprint(receipt: PostflightReceipt): string {
  return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}
