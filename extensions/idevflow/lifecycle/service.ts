import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "../config/config.ts";
import { requireContextReceipt } from "../context/receipts.ts";
import { loadDefinedProduct, validateIdeaQuality, validateLearningUpdate } from "../documents/product.ts";
import { integrateSession, integrationHead, type IntegrationReceipt } from "../git/integration.ts";
import { pathIsClaimed } from "../git/claims.ts";
import { loadWorkGraph } from "../planning/work-graph.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import type { LifecycleState } from "../state/runtime-types.ts";
import { sourceFingerprint } from "../verification/fingerprint.ts";
import { VERIFICATION_PROFILES } from "../verification/profiles.ts";
import { VerificationReceiptStore } from "../verification/receipts.ts";

const execFileAsync = promisify(execFile);

export interface PlanApproval {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly graphFingerprint: string;
  readonly planCommit: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export interface StageReceipt {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly stage: "define" | "plan" | "build" | "test" | "review" | "learn";
  readonly outcome: "pass";
  readonly sourceCommit: string;
  readonly verificationFingerprint: string;
  readonly evidence: string;
  readonly graphFingerprint?: string;
  readonly sliceId?: string;
  readonly sessionId?: string;
  readonly founderAcceptedAssumptionIds?: readonly string[];
  readonly founderAcceptedCritique?: true;
  readonly integration?: IntegrationReceipt;
  readonly verdict?: ReviewVerdict;
  readonly recordedAt: string;
}

interface TestRepair {
  readonly schemaVersion: 1;
  readonly piSessionId: string;
  readonly reason: string;
  readonly returnTo: LifecycleState;
  readonly startedAt: string;
}

function testRepairPath(repository: RepositoryDescriptor): string { return join(repository.primaryRoot, ".idevflow", "repairs", "test.json"); }
async function loadTestRepair(repository: RepositoryDescriptor): Promise<TestRepair | undefined> {
  try { return JSON.parse(await readFile(testRepairPath(repository), "utf8")) as TestRepair; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function startTestRepair(repository: RepositoryDescriptor, piSessionId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new SafetyKernelError("Test repair requires the observed failing behavior or external blocker");
  if (await loadTestRepair(repository)) throw new SafetyKernelError("A test repair is already active; resume its writer instead of starting another");
  const state = await new RuntimeStore(repository).status();
  const allowed: readonly LifecycleState[] = ["idea", "defined", "planned", "blocked", "fix_required", "verification_failed"];
  if (!state || !allowed.includes(state.lifecycle)) throw new SafetyKernelError(`Test repair requires ${allowed.join(", ")} lifecycle, found ${state?.lifecycle ?? "uninitialized"}`);
  const repair: TestRepair = { schemaVersion: 1, piSessionId, reason: reason.trim(), returnTo: state.lifecycle, startedAt: new Date().toISOString() };
  await mkdir(join(repository.primaryRoot, ".idevflow", "repairs"), { recursive: true, mode: 0o700 });
  await writeFileAtomically(testRepairPath(repository), `${JSON.stringify(repair, null, 2)}\n`);
  await transition(repository, "testing", `test repair: ${repair.reason}`, actor(piSessionId));
}

export interface ReviewVerdict {
  readonly verdict: "pass" | "fix_required" | "blocked" | "manual_decision_required";
  readonly summary: string;
  readonly findings: readonly { readonly severity: "critical" | "high" | "medium" | "low"; readonly area: string; readonly finding: string; readonly evidence: string }[];
  readonly residualRisk: string;
}

function actor(piSessionId: string): string { return `pi-session:${piSessionId}`; }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function transition(repository: RepositoryDescriptor, to: LifecycleState, reason: string, by: string): Promise<void> {
  const store = new RuntimeStore(repository);
  const state = await store.status();
  if (!state) throw new SafetyKernelError("iDevFlow runtime is not initialized");
  await store.transition(to, reason, by, state.revision);
}

async function writeStageReceipt(repository: RepositoryDescriptor, receipt: StageReceipt): Promise<void> {
  await mkdir(join(repository.primaryRoot, ".idevflow", "receipts", "stages"), { recursive: true, mode: 0o700 });
  await writeFileAtomically(join(repository.primaryRoot, ".idevflow", "receipts", "stages", `${receipt.stage}-${receipt.sourceCommit}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
}

async function validatedSessionVerification(repository: RepositoryDescriptor, session: WriterSession): Promise<string> {
  const fingerprint = session.postflight?.verificationFingerprint;
  if (!fingerprint) throw new SafetyKernelError("Integrated stage is missing its postflight verification receipt");
  const verification = await new VerificationReceiptStore(repository).validated(fingerprint);
  if (!verification || !verification.success || verification.sessionId !== session.id) throw new SafetyKernelError("Stage verification receipt is missing or invalid");
  return fingerprint;
}

async function completedSlices(repository: RepositoryDescriptor, graphFingerprint: string): Promise<Set<string>> {
  const directory = join(repository.primaryRoot, ".idevflow", "receipts", "stages");
  let names: string[];
  try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set(); throw error; }
  const completed = new Set<string>();
  for (const name of names.filter((value) => value.startsWith("build-") && value.endsWith(".json"))) {
    try {
      const receipt = JSON.parse(await readFile(join(directory, name), "utf8")) as Partial<StageReceipt>;
      if (receipt.outcome === "pass" && receipt.graphFingerprint === graphFingerprint && receipt.sliceId) completed.add(receipt.sliceId);
    } catch { /* A malformed receipt is ignored and therefore cannot satisfy a dependency. */ }
  }
  return completed;
}

async function readApproval(repository: RepositoryDescriptor): Promise<PlanApproval> {
  try { return JSON.parse(await readFile(join(repository.primaryRoot, ".idevflow", "approvals", "plan.json"), "utf8")) as PlanApproval; }
  catch (error) { throw new SafetyKernelError("The current work graph has not been approved", { cause: error }); }
}

export async function startMaintenance(repository: RepositoryDescriptor, piSessionId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new SafetyKernelError("Maintenance requires a user-visible issue or change reason");
  const state = await new RuntimeStore(repository).status();
  if (state?.lifecycle !== "testflight_handoff") throw new SafetyKernelError(`Maintenance requires testflight_handoff lifecycle, found ${state?.lifecycle ?? "uninitialized"}`);
  await transition(repository, "defined", `maintenance: ${reason.trim()}`, actor(piSessionId));
}

export async function approvePlan(repository: RepositoryDescriptor, approvedBy: string): Promise<PlanApproval> {
  const config = await loadConfig(repository.primaryRoot);
  const state = await new RuntimeStore(repository).status();
  if (state?.lifecycle !== "planned") throw new SafetyKernelError(`Plan approval requires planned lifecycle, found ${state?.lifecycle ?? "uninitialized"}`);
  const head = await integrationHead(repository, config);
  const sessions = Object.values((await new SessionRegistry(repository).load()).sessions);
  const planSession = sessions.filter((session) => session.stage === "plan" && session.status === "integrated" && session.commit === head).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!planSession) throw new SafetyKernelError("Plan approval requires the integrated plan session for the current commit");
  const [planHead, planStatus] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: planSession.worktreePath, encoding: "utf8" }),
    execFileAsync("git", ["status", "--porcelain=v1"], { cwd: planSession.worktreePath, encoding: "utf8" }),
  ]);
  if (planHead.stdout.trim() !== head || planStatus.stdout.trim()) throw new SafetyKernelError("Integrated plan worktree is dirty or no longer matches the plan commit");
  const product = await loadDefinedProduct(planSession.worktreePath, config.documents);
  const graph = await loadWorkGraph(planSession.worktreePath, config.documents.workGraph, product.fingerprint);
  const approval: PlanApproval = { schemaVersion: 1, id: randomUUID(), graphFingerprint: graph.fingerprint, planCommit: head, approvedBy, approvedAt: new Date().toISOString() };
  await mkdir(join(repository.primaryRoot, ".idevflow", "approvals"), { recursive: true, mode: 0o700 });
  await writeFileAtomically(join(repository.primaryRoot, ".idevflow", "approvals", "plan.json"), `${JSON.stringify(approval, null, 2)}\n`);
  await transition(repository, "plan_approved", `approved work graph ${graph.fingerprint}`, `approval:${approvedBy}`);
  return approval;
}

export async function integrateCurrentStage(repository: RepositoryDescriptor, session: WriterSession, evidence: string, requestedSliceId?: string, founderAcceptedAssumptionIds: readonly string[] = [], founderAcceptedCritique = false): Promise<StageReceipt> {
  if (!evidence.trim()) throw new SafetyKernelError("Stage integration requires evidence");
  if (!["define", "plan", "build", "test", "learn"].includes(session.stage)) throw new SafetyKernelError(`Stage ${session.stage} does not produce an integration receipt`);
  const runtime = await new RuntimeStore(repository).status();
  const repair = session.stage === "test" ? await loadTestRepair(repository) : undefined;
  if (repair && repair.piSessionId !== session.piSessionId) throw new SafetyKernelError("Active test repair belongs to a different Pi session");
  const allowed: Partial<Record<WriterSession["stage"], readonly LifecycleState[]>> = { define: ["idea", "testflight_handoff"], plan: ["defined"], build: ["plan_approved", "built", "fix_required", "verification_failed"], test: ["built", "fix_required", "verification_failed", "testing"], learn: ["testflight_handoff"] };
  if (!allowed[session.stage]?.includes(runtime?.lifecycle as LifecycleState)) throw new SafetyKernelError(`Lifecycle ${runtime?.lifecycle ?? "uninitialized"} cannot integrate ${session.stage}`);
  const config = await loadConfig(repository.primaryRoot);
  const verificationFingerprint = await validatedSessionVerification(repository, session);
  const product = repair ? undefined : await loadDefinedProduct(session.worktreePath, config.documents);
  let acceptedIdeaClaims: readonly string[] | undefined;
  if (session.stage === "define") {
    if (!founderAcceptedCritique) throw new SafetyKernelError("Definition requires interactive founder acceptance of the skeptical critique");
    const quality = validateIdeaQuality(product!.memory, product!.slc);
    const accepted = new Set(founderAcceptedAssumptionIds);
    const missingAcceptance = quality.unresolvedCriticalAssumptionIds.filter((id) => !accepted.has(id));
    if (missingAcceptance.length) throw new SafetyKernelError(`Definition requires explicit founder acceptance for unresolved high-impact assumptions: ${missingAcceptance.join(", ")}`);
    acceptedIdeaClaims = quality.unresolvedCriticalAssumptionIds;
  }
  if (session.stage === "learn") {
    const previous = await loadDefinedProduct(repository.primaryRoot, config.documents);
    validateLearningUpdate(previous.memory, product!.memory);
  }
  let graphFingerprint: string | undefined;
  let sliceId: string | undefined;
  if (session.stage !== "define" && session.stage !== "learn" && !repair) {
    const graph = await loadWorkGraph(session.worktreePath, config.documents.workGraph, product!.fingerprint);
    graphFingerprint = graph.fingerprint;
    if (session.stage === "build") {
      const approval = await readApproval(repository);
      const planIsAncestor = approval.graphFingerprint === graph.fingerprint && await execFileAsync("git", ["merge-base", "--is-ancestor", approval.planCommit, session.baseCommit], { cwd: session.worktreePath }).then(() => true).catch(() => false);
      if (!planIsAncestor) throw new SafetyKernelError("Build session is not based on the approved work graph and plan commit");
      const matching = graph.graph.slices.filter((slice) => (!requestedSliceId || slice.id === requestedSliceId) && session.claims.every((claim) => pathIsClaimed(claim, slice.paths)));
      if (matching.length !== 1) throw new SafetyKernelError("Build claims must map to exactly one approved work slice; provide sliceId when ordered slices overlap");
      const selected = matching[0]!;
      const completed = await completedSlices(repository, graph.fingerprint);
      const missingDependencies = selected.dependsOn.filter((dependency) => !completed.has(dependency));
      if (missingDependencies.length) throw new SafetyKernelError(`Build slice ${selected.id} is blocked by incomplete dependencies: ${missingDependencies.join(", ")}`);
      sliceId = selected.id;
    } else if (session.stage === "test") {
      const completed = await completedSlices(repository, graph.fingerprint);
      const missingSlices = graph.graph.slices.filter((slice) => !completed.has(slice.id)).map((slice) => slice.id);
      if (missingSlices.length) throw new SafetyKernelError(`Test stage is blocked by incomplete work slices: ${missingSlices.join(", ")}`);
    }
  }
  const integration = await integrateSession(repository, config, session);
  const receipt: StageReceipt = {
    schemaVersion: 1, id: randomUUID(), stage: session.stage as StageReceipt["stage"], outcome: "pass", sourceCommit: integration.integratedCommit,
    verificationFingerprint, evidence: evidence.trim(), ...(graphFingerprint ? { graphFingerprint } : {}), ...(sliceId ? { sliceId } : {}), ...(acceptedIdeaClaims?.length ? { founderAcceptedAssumptionIds: acceptedIdeaClaims } : {}), ...(session.stage === "define" ? { founderAcceptedCritique: true as const } : {}), sessionId: session.id, integration, recordedAt: new Date().toISOString(),
  };
  await writeStageReceipt(repository, receipt);
  const by = actor(session.piSessionId);
  if (session.stage === "define") await transition(repository, "defined", `validated product memory and SLC ${product!.fingerprint}`, by);
  else if (session.stage === "plan") await transition(repository, "planned", `validated work graph ${graphFingerprint}`, by);
  else if (session.stage === "build") { await transition(repository, "building", `started approved slice ${sliceId}`, by); await transition(repository, "built", `integrated verified slice ${sliceId}`, by); }
  else if (session.stage === "test" && repair) { await rm(testRepairPath(repository), { force: true }); await transition(repository, repair.returnTo, `resolved test repair: ${repair.reason}`, by); }
  else if (session.stage === "test") { await transition(repository, "testing", "started integrated test stage", by); await transition(repository, "tested", "integrated verified test evidence", by); }
  return receipt;
}

function validateVerdict(value: unknown): ReviewVerdict {
  if (!value || typeof value !== "object") throw new SafetyKernelError("Review verdict must be an object");
  const raw = value as Record<string, unknown>;
  if (raw.verdict !== "pass" && raw.verdict !== "fix_required" && raw.verdict !== "blocked" && raw.verdict !== "manual_decision_required") throw new SafetyKernelError("Review verdict is invalid");
  if (typeof raw.summary !== "string" || !raw.summary.trim() || typeof raw.residualRisk !== "string" || !raw.residualRisk.trim()) throw new SafetyKernelError("Review summary and residualRisk are required");
  if (!Array.isArray(raw.findings)) throw new SafetyKernelError("Review findings must be an array");
  const findings = raw.findings.map((item, index) => {
    if (!item || typeof item !== "object") throw new SafetyKernelError(`Review finding ${index} is invalid`);
    const finding = item as Record<string, unknown>;
    const severity = finding.severity;
    if (!["critical", "high", "medium", "low"].includes(String(severity))) throw new SafetyKernelError(`Review finding ${index} severity is invalid`);
    for (const key of ["area", "finding", "evidence"] as const) if (typeof finding[key] !== "string" || !String(finding[key]).trim()) throw new SafetyKernelError(`Review finding ${index}.${key} is required`);
    return { severity: severity as "critical" | "high" | "medium" | "low", area: String(finding.area).trim(), finding: String(finding.finding).trim(), evidence: String(finding.evidence).trim() };
  });
  if (raw.verdict === "pass" && findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) throw new SafetyKernelError("A passing review cannot contain critical or high findings");
  return { verdict: raw.verdict, summary: raw.summary.trim(), findings, residualRisk: raw.residualRisk.trim() };
}

export async function recordReview(repository: RepositoryDescriptor, piSessionId: string, verificationFingerprint: string, rawVerdict: unknown): Promise<StageReceipt> {
  const state = await new RuntimeStore(repository).status();
  if (state?.lifecycle !== "tested" && state?.lifecycle !== "manual_decision_required") throw new SafetyKernelError(`Review requires tested or manual_decision_required lifecycle, found ${state?.lifecycle ?? "uninitialized"}`);
  const verdict = validateVerdict(rawVerdict);
  const config = await loadConfig(repository.primaryRoot);
  const commit = await integrationHead(repository, config);
  const verification = await new VerificationReceiptStore(repository).validated(verificationFingerprint);
  const verificationSession = verification ? (await new SessionRegistry(repository).load()).sessions[verification.sessionId] : undefined;
  const currentSource = verificationSession ? await sourceFingerprint(verificationSession) : undefined;
  if (!verification || !verification.success || !verificationSession || verification.sourceCommit !== commit || currentSource?.fingerprint !== verification.sourceFingerprint || currentSource.commit !== commit || VERIFICATION_PROFILES.indexOf(verification.profile) < VERIFICATION_PROFILES.indexOf("integration")) {
    throw new SafetyKernelError("Review requires integration-or-stronger verification for the current clean integrated commit");
  }
  await requireContextReceipt(repository, { session: verificationSession, stage: "review", risk: verificationSession.risk });
  await transition(repository, "reviewing",  `reviewing integrated commit ${commit}`, actor(piSessionId));
  if (verdict.verdict !== "pass") {
    const target = verdict.verdict === "fix_required" ? "fix_required" : verdict.verdict === "manual_decision_required" ? "manual_decision_required" : "blocked";
    await transition(repository, target, verdict.summary, actor(piSessionId));
    throw new SafetyKernelError(`Review did not pass: ${verdict.summary}`);
  }
  const receipt: StageReceipt = { schemaVersion: 1, id: randomUUID(), stage: "review", outcome: "pass", sourceCommit: commit, verificationFingerprint, evidence: verdict.summary, verdict, recordedAt: new Date().toISOString() };
  await writeStageReceipt(repository, receipt);
  await transition(repository, "review_passed", `review passed for ${commit}; verdict ${hash(verdict)}`, actor(piSessionId));
  return receipt;
}

export async function latestIntegratedSession(repository: RepositoryDescriptor, piSessionId: string): Promise<WriterSession | undefined> {
  const state = await new SessionRegistry(repository).load();
  return Object.values(state.sessions).filter((session) => session.piSessionId === piSessionId && session.status === "integrated").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
