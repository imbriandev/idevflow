import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { validateArtifact } from "../artifacts/manifest.ts";
import { BlockerStore } from "../blockers/store.ts";
import { loadConfig, type iDevFlowConfig } from "../config/config.ts";
import { integrationHead } from "../git/integration.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import type { WriterSession } from "../sessions/types.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { withFileLock } from "../state/file-lock.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { sourceFingerprint } from "../verification/fingerprint.ts";
import { validatedPlatformReceipt } from "../verification/matrix.ts";
import { assertVerificationProfileSupported, missingRequiredProofs } from "../verification/profiles.ts";
import { validateXCTestMetadata } from "../verification/xctest-evidence.ts";
import type { ArtifactRecord } from "../verification/types.ts";
import { loadMacDistributionManifest, loadReleaseManifest, validateMacSecurityGate, validateMonetizationGate, validatePrivacyGate, type MacDistributionManifest, type MacSecurityGate, type MonetizationGate, type PrivacyGate, type ReleaseManifest } from "./gates.ts";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.stdout.trim();
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

export interface ReleaseCandidate {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly status: "ready" | "promoted" | "handed_off" | "stale";
  readonly commit: string;
  readonly target: "testflight-internal" | "testflight-external";
  readonly fingerprint: string;
  readonly verificationFingerprint: string;
  readonly verificationReceiptId: string;
  readonly reviewReceiptId: string;
  readonly reviewReceiptFingerprint: string;
  readonly verificationArtifacts: readonly ArtifactRecord[];
  readonly privacy: PrivacyGate;
  readonly monetization: MonetizationGate;
  readonly releaseManifest: ReleaseManifest;
  readonly releaseManifestFingerprint: string;
  readonly createdAt: string;
  readonly promotedAt?: string;
  readonly handedOffAt?: string;
}

interface ApprovalRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly action: "promote_candidate";
  readonly candidateFingerprint: string;
  readonly candidateCommit: string;
  readonly target: string;
  readonly tokenHash: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
}

function candidatePath(repository: RepositoryDescriptor): string { return join(repository.primaryRoot, ".idevflow", "release", "candidate.json"); }
function approvalPath(repository: RepositoryDescriptor): string { return join(repository.primaryRoot, ".idevflow", "approvals", "promotion.json"); }
async function ensureReleaseDirectories(repository: RepositoryDescriptor): Promise<void> {
  await Promise.all([
    mkdir(join(repository.primaryRoot, ".idevflow", "release"), { recursive: true, mode: 0o700 }),
    mkdir(join(repository.primaryRoot, ".idevflow", "approvals"), { recursive: true, mode: 0o700 }),
  ]);
}

export async function loadCandidate(repository: RepositoryDescriptor): Promise<ReleaseCandidate | null> {
  try { return JSON.parse(await readFile(candidatePath(repository), "utf8")) as ReleaseCandidate; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function transition(repository: RepositoryDescriptor, to: "candidate_verified" | "ready_for_ship_approval" | "promoted" | "testflight_handoff" | "stale_candidate", reason: string, actor: string): Promise<void> {
  const store = new RuntimeStore(repository);
  const state = await store.status();
  if (!state) throw new SafetyKernelError("iDevFlow runtime is not initialized");
  await store.transition(to, reason, actor, state.revision);
}

async function createCandidateLocked(
  repository: RepositoryDescriptor,
  session: WriterSession,
  verificationFingerprint: string,
  requestedTarget?: "testflight-internal" | "testflight-external",
): Promise<ReleaseCandidate> {
  await ensureReleaseDirectories(repository);
  const state = await new RuntimeStore(repository).status();
  if (state?.lifecycle !== "review_passed" && state?.lifecycle !== "stale_candidate") throw new SafetyKernelError(`Candidate creation requires review_passed or stale_candidate lifecycle, found ${state?.lifecycle ?? "uninitialized"}`);
  if (session.status !== "integrated" && session.status !== "ready_for_integration") throw new SafetyKernelError("Candidate creation requires a finished source-bound writer session");
  const shipBlockers = await new BlockerStore(repository).openShipBlockers();
  if (shipBlockers.length) throw new SafetyKernelError(`Candidate is blocked by external validation: ${shipBlockers.map((blocker) => `${blocker.title} (owner: ${blocker.external!.owner}; evidence: ${blocker.external!.evidenceRequired})`).join("; ")}`);
  const config = await loadConfig(repository.primaryRoot);
  assertVerificationProfileSupported("release", config.xcode.platform);
  if (!config.xcode.requiredPlatforms.includes("ios")) throw new SafetyKernelError("TestFlight candidate requires iOS in xcode.requiredPlatforms");
  const commit = await integrationHead(repository, config);
  if (session.commit !== commit || await git(session.worktreePath, ["rev-parse", "HEAD"]) !== commit) throw new SafetyKernelError("Candidate session does not match the current integration commit");
  if (await git(session.worktreePath, ["status", "--porcelain=v1"])) throw new SafetyKernelError("Candidate source worktree is dirty");
  let reviewReceipt: { id?: string; sourceCommit?: string; outcome?: string; verdict?: { verdict?: string } };
  try { reviewReceipt = JSON.parse(await readFile(join(repository.primaryRoot, ".idevflow", "receipts", "stages", `review-${commit}.json`), "utf8")) as typeof reviewReceipt; }
  catch (error) { throw new SafetyKernelError("Candidate requires the review receipt for the exact integrated commit", { cause: error }); }
  if (!reviewReceipt.id || reviewReceipt.sourceCommit !== commit || reviewReceipt.outcome !== "pass" || reviewReceipt.verdict?.verdict !== "pass") {
    throw new SafetyKernelError("Candidate review receipt is invalid or stale");
  }
  const reviewReceiptFingerprint = digest(reviewReceipt);
  const verification = await validatedPlatformReceipt(repository, config, verificationFingerprint, "ios");
  const currentSource = await sourceFingerprint(session);
  if (!verification || !verification.success || verification.reused || verification.profile !== "release" || verification.sessionId !== session.id || verification.sourceCommit !== commit || verification.sourceFingerprint !== currentSource.fingerprint) {
    throw new SafetyKernelError("Candidate requires fresh, non-reused release verification for the exact integrated commit and session");
  }
  if (!verification.project || verification.project.kind === "swift-package") throw new SafetyKernelError("A TestFlight candidate requires an Xcode app project or workspace");
  const xcresults = verification.artifacts.filter((artifact) => artifact.kind === "xcresult");
  if (xcresults.length < 2 || !verification.artifacts.some((artifact) => artifact.kind === "summary")) {
    throw new SafetyKernelError("Candidate release evidence requires build/test xcresult bundles and a parsed test summary");
  }
  const missingProofs = missingRequiredProofs("release", verification.proofs, config.verification.requiredScreenshotVariants);
  if (missingProofs.length) throw new SafetyKernelError(`Candidate release evidence is missing proof: ${missingProofs.join(", ")}`);
  if (config.quality.requireXCTestEvidence) {
    const accessibility = verification.proofs.find((proof) => proof.kind === "accessibility");
    const performance = verification.proofs.find((proof) => proof.kind === "performance");
    if (!accessibility || !performance) throw new SafetyKernelError("Candidate release evidence requires XCTest accessibility and performance proof");
    validateXCTestMetadata("accessibility", accessibility.metadata);
    validateXCTestMetadata("performance", performance.metadata);
    const summaries = verification.artifacts.filter((artifact) => artifact.kind === "summary").map((artifact) => artifact.path);
    if (!summaries.some((path) => path.endsWith("quality.tests.json")) || !summaries.some((path) => path.endsWith("quality.metrics.json"))) {
      throw new SafetyKernelError("Candidate release evidence requires parsed fresh XCTest test and metrics summaries");
    }
  }
  const target = requestedTarget ?? config.release.defaultTarget;
  const [privacy, monetization, release] = await Promise.all([
    validatePrivacyGate(session.worktreePath, config.documents.privacyReview),
    validateMonetizationGate(session.worktreePath, config.documents.monetization),
    loadReleaseManifest(session.worktreePath, config.documents.releaseManifest, target),
  ]);
  if (!verification.project.bundleIdentifier || !verification.project.marketingVersion || !verification.project.buildNumber) {
    throw new SafetyKernelError("Xcode release settings must resolve bundle identifier, marketing version, and build number");
  }
  if (verification.project.bundleIdentifier !== release.manifest.bundleId || verification.project.marketingVersion !== release.manifest.version || verification.project.buildNumber !== release.manifest.build) {
    throw new SafetyKernelError("Release manifest bundle/version/build does not match Xcode release settings");
  }
  const core = { commit, target, reviewReceiptId: reviewReceipt.id, reviewReceiptFingerprint, verificationFingerprint, verificationReceiptId: verification.id, artifactHashes: verification.artifacts.map((artifact) => artifact.sha256), privacy: privacy.fingerprint, monetization: monetization.fingerprint, releaseManifest: release.fingerprint };
  const candidate: ReleaseCandidate = {
    schemaVersion: 1, id: randomUUID(), status: "ready", commit, target, fingerprint: digest(core), verificationFingerprint, verificationReceiptId: verification.id,
    reviewReceiptId: reviewReceipt.id, reviewReceiptFingerprint, verificationArtifacts: verification.artifacts, privacy, monetization, releaseManifest: release.manifest, releaseManifestFingerprint: release.fingerprint, createdAt: new Date().toISOString(),
  };
  await writeFileAtomically(candidatePath(repository), `${JSON.stringify(candidate, null, 2)}\n`);
  const actor = `pi-session:${session.piSessionId}`;
  await transition(repository, "candidate_verified", `fresh release verification ${verificationFingerprint}`, actor);
  await transition(repository, "ready_for_ship_approval", `candidate ${candidate.fingerprint} ready for ${target}`, actor);
  return candidate;
}

export interface MacDistributionHandoff {
  readonly schemaVersion: 1;
  readonly status: "ready_for_manual_distribution";
  readonly id: string;
  readonly commit: string;
  readonly target: "mac-app-store" | "notarized";
  readonly fingerprint: string;
  readonly verificationFingerprint: string;
  readonly releaseManifest: MacDistributionManifest;
  readonly releaseManifestFingerprint: string;
  readonly security: MacSecurityGate;
  readonly privacy: PrivacyGate;
  readonly monetization: MonetizationGate;
  readonly acknowledgedBy: string;
  readonly createdAt: string;
  readonly boundary: { readonly pushed: false; readonly archived: false; readonly signed: false; readonly uploaded: false; readonly notarized: false; readonly distributed: false; readonly nextManualSteps: readonly string[] };
}

export async function createMacDistributionHandoff(
  repository: RepositoryDescriptor,
  session: WriterSession,
  verificationFingerprint: string,
  target: "mac-app-store" | "notarized",
  acknowledgedBy: string,
): Promise<{ handoff: MacDistributionHandoff; handoffPath: string }> {
  const config = await loadConfig(repository.primaryRoot);
  if (!config.xcode.requiredPlatforms.includes("macos")) throw new SafetyKernelError("macOS distribution handoff requires macOS in xcode.requiredPlatforms");
  const state = await new RuntimeStore(repository).status();
  if (state?.lifecycle !== "review_passed") throw new SafetyKernelError(`macOS handoff requires review_passed lifecycle, found ${state?.lifecycle ?? "uninitialized"}`);
  if (session.status !== "integrated" && session.status !== "ready_for_integration") throw new SafetyKernelError("macOS handoff requires a finished source-bound writer session");
  const commit = await integrationHead(repository, config);
  if (session.commit !== commit || await git(session.worktreePath, ["rev-parse", "HEAD"]) !== commit || await git(session.worktreePath, ["status", "--porcelain=v1"])) throw new SafetyKernelError("macOS handoff source is not the clean current integration commit");
  let review: { id?: string; sourceCommit?: string; outcome?: string; verdict?: { verdict?: string } };
  try { review = JSON.parse(await readFile(join(repository.primaryRoot, ".idevflow", "receipts", "stages", `review-${commit}.json`), "utf8")) as typeof review; } catch (error) { throw new SafetyKernelError("macOS handoff requires the exact review receipt", { cause: error }); }
  if (!review.id || review.sourceCommit !== commit || review.outcome !== "pass" || review.verdict?.verdict !== "pass") throw new SafetyKernelError("macOS handoff review receipt is invalid or stale");
  const verification = await validatedPlatformReceipt(repository, config, verificationFingerprint, "macos");
  const source = await sourceFingerprint(session);
  if (!verification || !verification.success || verification.reused || verification.profile !== "release" || verification.sessionId !== session.id || verification.sourceCommit !== commit || verification.sourceFingerprint !== source.fingerprint) throw new SafetyKernelError("macOS handoff requires fresh release verification for the exact integrated commit");
  if (!verification.project || verification.project.kind === "swift-package" || verification.project.platform !== "macos") throw new SafetyKernelError("macOS handoff requires a verified macOS Xcode app project");
  if (verification.artifacts.filter((artifact) => artifact.kind === "xcresult").length < 2 || !verification.artifacts.some((artifact) => artifact.kind === "summary")) throw new SafetyKernelError("macOS handoff requires build/test xcresults and a parsed test summary");
  const release = await loadMacDistributionManifest(session.worktreePath, config.documents.releaseManifest, target);
  const security = await validateMacSecurityGate(session.worktreePath, release.manifest, verification.project);
  const [privacy, monetization] = await Promise.all([validatePrivacyGate(session.worktreePath, config.documents.privacyReview), validateMonetizationGate(session.worktreePath, config.documents.monetization)]);
  if (verification.project.bundleIdentifier !== release.manifest.bundleId || verification.project.marketingVersion !== release.manifest.version || verification.project.buildNumber !== release.manifest.build) throw new SafetyKernelError("macOS release manifest does not match verified Xcode settings");
  const createdAt = new Date().toISOString();
  const core = { commit, target, verificationFingerprint, release: release.fingerprint, security: security.fingerprint, privacy: privacy.fingerprint, monetization: monetization.fingerprint };
  const handoff: MacDistributionHandoff = { schemaVersion: 1, status: "ready_for_manual_distribution", id: randomUUID(), commit, target, fingerprint: digest(core), verificationFingerprint, releaseManifest: release.manifest, releaseManifestFingerprint: release.fingerprint, security, privacy, monetization, acknowledgedBy, createdAt, boundary: { pushed: false, archived: false, signed: false, uploaded: false, notarized: false, distributed: false, nextManualSteps: target === "notarized" ? ["Sign the exact commit with the reviewed Developer ID identity", "Archive/export the signed app", "Submit the archive to notarization using the named profile", "Staple and verify the notarization ticket", "Distribute the notarized artifact manually"] : ["Archive the exact commit with the reviewed signing team", "Validate App Sandbox and entitlements in the archive", "Upload manually to App Store Connect", "Complete Mac App Store review and distribution manually"] } };
  const handoffPath = join(repository.primaryRoot, ".idevflow", "release", `macos-handoff-${handoff.id}.json`);
  await ensureReleaseDirectories(repository);
  await writeFileAtomically(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
  return { handoff, handoffPath };
}

export async function createCandidate(
  repository: RepositoryDescriptor,
  session: WriterSession,
  verificationFingerprint: string,
  requestedTarget?: "testflight-internal" | "testflight-external",
): Promise<ReleaseCandidate> {
  const lock = join(repository.primaryRoot, ".idevflow", "state", "locks", "integration.lock");
  return withFileLock(lock, () => createCandidateLocked(repository, session, verificationFingerprint, requestedTarget));
}

async function markCandidateStale(repository: RepositoryDescriptor, candidate: ReleaseCandidate, reason: string): Promise<void> {
  await writeFileAtomically(candidatePath(repository), `${JSON.stringify({ ...candidate, status: "stale" }, null, 2)}\n`);
  const state = await new RuntimeStore(repository).status();
  if (state?.lifecycle === "ready_for_ship_approval" || state?.lifecycle === "candidate_verified" || state?.lifecycle === "review_passed") {
    await transition(repository, "stale_candidate", reason, "release:staleness");
  }
}

export async function issuePromotionApproval(repository: RepositoryDescriptor, approvedBy: string): Promise<{ token: string; approval: Omit<ApprovalRecord, "tokenHash"> }> {
  await ensureReleaseDirectories(repository);
  const candidate = await loadCandidate(repository);
  const state = await new RuntimeStore(repository).status();
  if (!candidate || candidate.status !== "ready" || state?.lifecycle !== "ready_for_ship_approval") throw new SafetyKernelError("No ready candidate is awaiting ship approval");
  const config = await loadConfig(repository.primaryRoot);
  if (await integrationHead(repository, config) !== candidate.commit) {
    await markCandidateStale(repository, candidate, "integration moved before candidate approval");
    throw new SafetyKernelError("Candidate became stale before approval");
  }
  if (!(await Promise.all(candidate.verificationArtifacts.map(validateArtifact))).every(Boolean)) {
    await markCandidateStale(repository, candidate, "candidate evidence changed before approval");
    throw new SafetyKernelError("Candidate evidence is missing or tampered");
  }
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const record: ApprovalRecord = { schemaVersion: 1, id: randomUUID(), action: "promote_candidate", candidateFingerprint: candidate.fingerprint, candidateCommit: candidate.commit, target: candidate.target, tokenHash: tokenHash(token), approvedBy, approvedAt: new Date(now).toISOString(), expiresAt: new Date(now + config.release.approvalTtlSeconds * 1000).toISOString() };
  await writeFileAtomically(approvalPath(repository), `${JSON.stringify(record, null, 2)}\n`);
  const { tokenHash: _hidden, ...approval } = record;
  return { token, approval };
}

async function consumeApproval(repository: RepositoryDescriptor, candidate: ReleaseCandidate, token: string): Promise<ApprovalRecord> {
  if (!token.trim()) throw new SafetyKernelError("Promotion requires an approval token");
  const lock = join(repository.primaryRoot, ".idevflow", "state", "locks", "approval.lock");
  return withFileLock(lock, async () => {
    let record: ApprovalRecord;
    try { record = JSON.parse(await readFile(approvalPath(repository), "utf8")) as ApprovalRecord; }
    catch (error) { throw new SafetyKernelError("Promotion approval is missing", { cause: error }); }
    if (record.consumedAt) throw new SafetyKernelError("Promotion approval was already consumed");
    if (Date.parse(record.expiresAt) < Date.now()) throw new SafetyKernelError("Promotion approval expired");
    if (record.tokenHash !== tokenHash(token) || record.candidateFingerprint !== candidate.fingerprint || record.candidateCommit !== candidate.commit || record.target !== candidate.target) {
      throw new SafetyKernelError("Promotion approval does not match the exact candidate and target");
    }
    const consumed = { ...record, consumedAt: new Date().toISOString() };
    await writeFileAtomically(approvalPath(repository), `${JSON.stringify(consumed, null, 2)}\n`);
    return consumed;
  });
}

async function finalizePromoted(repository: RepositoryDescriptor, candidate: ReleaseCandidate): Promise<ReleaseCandidate> {
  const promoted: ReleaseCandidate = { ...candidate, status: "promoted", promotedAt: candidate.promotedAt ?? new Date().toISOString() };
  await writeFileAtomically(candidatePath(repository), `${JSON.stringify(promoted, null, 2)}\n`);
  const state = await new RuntimeStore(repository).status();
  if (state?.lifecycle === "ready_for_ship_approval") {
    await transition(repository, "promoted", `promoted candidate ${candidate.fingerprint} without push or upload`, "release:promotion");
  }
  return promoted;
}

async function promoteCandidateLocked(repository: RepositoryDescriptor, token: string): Promise<ReleaseCandidate> {
  const candidate = await loadCandidate(repository);
  if (!candidate || candidate.status !== "ready") throw new SafetyKernelError("No ready candidate can be promoted");
  const config: iDevFlowConfig = await loadConfig(repository.primaryRoot);
  if (await integrationHead(repository, config) !== candidate.commit) {
    await markCandidateStale(repository, candidate, "integration moved before candidate promotion");
    throw new SafetyKernelError("Candidate is stale because integration moved");
  }
  if (!(await Promise.all(candidate.verificationArtifacts.map(validateArtifact))).every(Boolean)) {
    await markCandidateStale(repository, candidate, "candidate evidence changed before promotion");
    throw new SafetyKernelError("Candidate evidence is missing or tampered");
  }
  const branch = await git(repository.primaryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "");
  if (branch !== config.baseBranch && branch !== config.integrationBranch) throw new SafetyKernelError(`Promotion requires the primary worktree on ${config.baseBranch} or ${config.integrationBranch}`);
  if (await git(repository.primaryRoot, ["status", "--porcelain=v1"])) throw new SafetyKernelError("Primary worktree is dirty; promotion is blocked");
  await git(repository.primaryRoot, ["merge-base", "--is-ancestor", config.baseBranch, candidate.commit]);
  const baseHead = await git(repository.primaryRoot, ["rev-parse", config.baseBranch]);
  if (baseHead === candidate.commit) {
    const record = JSON.parse(await readFile(approvalPath(repository), "utf8")) as ApprovalRecord;
    if (!record.consumedAt || record.tokenHash !== tokenHash(token) || record.candidateFingerprint !== candidate.fingerprint) {
      throw new SafetyKernelError("Candidate commit is present but no matching consumed approval can finalize promotion");
    }
    return finalizePromoted(repository, candidate);
  }
  let promotionRoot = repository.primaryRoot;
  let temporary = false;
  if (branch !== config.baseBranch) {
    promotionRoot = join(dirname(repository.primaryRoot), `${basename(repository.primaryRoot)}.idev-promotion`);
    await git(repository.primaryRoot, ["worktree", "prune"]).catch(() => undefined);
    await rm(promotionRoot, { recursive: true, force: true });
    await git(repository.primaryRoot, ["worktree", "add", promotionRoot, config.baseBranch]);
    temporary = true;
  }
  try {
    if (await git(promotionRoot, ["status", "--porcelain=v1"])) throw new SafetyKernelError("Base-branch promotion worktree is dirty");
    await consumeApproval(repository, candidate, token);
    await git(promotionRoot, ["merge", "--ff-only", candidate.commit]);
    if (await git(promotionRoot, ["rev-parse", "HEAD"]) !== candidate.commit) throw new SafetyKernelError("Promotion did not land the exact candidate commit");
    return await finalizePromoted(repository, candidate);
  } finally {
    if (temporary) {
      await git(repository.primaryRoot, ["worktree", "remove", "--force", promotionRoot]).catch(() => undefined);
      await rm(promotionRoot, { recursive: true, force: true });
      await git(repository.primaryRoot, ["worktree", "prune"]).catch(() => undefined);
    }
  }
}

export async function promoteCandidate(repository: RepositoryDescriptor, token: string): Promise<ReleaseCandidate> {
  const lock = join(repository.primaryRoot, ".idevflow", "state", "locks", "integration.lock");
  return withFileLock(lock, () => promoteCandidateLocked(repository, token));
}

export async function createTestFlightHandoff(repository: RepositoryDescriptor, acknowledgedBy: string): Promise<{ candidate: ReleaseCandidate; handoffPath: string }> {
  await ensureReleaseDirectories(repository);
  const candidate = await loadCandidate(repository);
  if (!candidate || (candidate.status !== "promoted" && candidate.status !== "handed_off")) throw new SafetyKernelError("TestFlight handoff requires an exact promoted candidate");
  const existingHandoffPath = join(repository.primaryRoot, ".idevflow", "release", `handoff-${candidate.id}.json`);
  if (candidate.status === "handed_off") {
    const state = await new RuntimeStore(repository).status();
    if (state?.lifecycle === "promoted") await transition(repository, "testflight_handoff", `verified manual TestFlight handoff ${candidate.fingerprint}`, `handoff:${acknowledgedBy}`);
    return { candidate, handoffPath: existingHandoffPath };
  }
  const config = await loadConfig(repository.primaryRoot);
  if (await git(repository.primaryRoot, ["rev-parse", config.baseBranch]) !== candidate.commit) throw new SafetyKernelError("Promoted base branch no longer matches the candidate");
  if (!(await Promise.all(candidate.verificationArtifacts.map(validateArtifact))).every(Boolean)) throw new SafetyKernelError("Candidate evidence is missing or tampered at handoff");
  const handoff = {
    schemaVersion: 1, candidateId: candidate.id, candidateFingerprint: candidate.fingerprint, commit: candidate.commit, target: candidate.target,
    version: candidate.releaseManifest.version, build: candidate.releaseManifest.build, bundleId: candidate.releaseManifest.bundleId,
    verificationFingerprint: candidate.verificationFingerprint, privacyFingerprint: candidate.privacy.fingerprint, monetizationFingerprint: candidate.monetization.fingerprint,
    releaseNotes: candidate.releaseManifest.releaseNotes, knownIssues: candidate.releaseManifest.knownIssues, acknowledgedBy, createdAt: new Date().toISOString(),
    boundary: { pushed: false, archived: false, uploaded: false, distributed: false, nextManualSteps: ["Push the promoted commit under a separate repository approval", "Archive/export or upload using an explicitly approved release operation", "Select the verified build in App Store Connect and distribute to the bound TestFlight target"] },
  };
  const handoffPath = existingHandoffPath;
  await writeFileAtomically(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
  const handedOff: ReleaseCandidate = { ...candidate, status: "handed_off", handedOffAt: handoff.createdAt };
  await writeFileAtomically(candidatePath(repository), `${JSON.stringify(handedOff, null, 2)}\n`);
  await transition(repository, "testflight_handoff", `verified manual TestFlight handoff ${candidate.fingerprint}`, `handoff:${acknowledgedBy}`);
  return { candidate: handedOff, handoffPath };
}
