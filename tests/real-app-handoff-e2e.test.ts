import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { initializeConfig, loadConfig } from "../extensions/idevflow/config/config.ts";
import { selectKnowledge } from "../extensions/idevflow/context/knowledge.ts";
import { recordContextReceipt } from "../extensions/idevflow/context/receipts.ts";
import { recordReview } from "../extensions/idevflow/lifecycle/service.ts";
import { createCandidate, createTestFlightHandoff, issuePromotionApproval, promoteCandidate } from "../extensions/idevflow/release/service.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { acquireSimulatorLease, captureSimulatorScreenshot, releaseSimulatorLease } from "../extensions/idevflow/simulator/service.ts";
import { RuntimeStore } from "../extensions/idevflow/state/runtime-store.ts";
import { sourceFingerprint } from "../extensions/idevflow/verification/fingerprint.ts";
import { verifySession } from "../extensions/idevflow/verification/engine.ts";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
const enabled = process.env.IDEVFLOW_IOS_XCODE_E2E === "1";

async function git(cwd: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd, encoding: "utf8" })).stdout.trim();
}

async function advanceToTested(repository: Awaited<ReturnType<typeof discoverRepository>>): Promise<void> {
  const store = new RuntimeStore(repository); let state = await store.initialize("real-handoff-e2e");
  for (const lifecycle of ["defined", "planned", "plan_approved", "building", "built", "testing", "tested"] as const) state = await store.transition(lifecycle, "real SampleApp cutover setup", "real-handoff-e2e", state.revision);
}

describe("real app manual TestFlight handoff", () => {
  it("takes SampleApp through real release verification, local promotion, and a no-upload handoff", { skip: !enabled }, async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-real-handoff-")); roots.push(root, `${root}.idev-promotion`);
    await cp(join(import.meta.dirname, "fixtures", "SampleApp"), root, { recursive: true });
    await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["-c", "user.name=iDevFlow Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "fixture"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "iDevFlow Tests"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });
    await execFileAsync("git", ["checkout", "-b", "idev/integration"], { cwd: root });
    await mkdir(join(root, "docs", "idevflow"), { recursive: true });
    await writeFile(join(root, "docs", "idevflow", "privacy-review.json"), JSON.stringify({ schemaVersion: 1, decision: "go", dataPractices: [], permissions: [], findings: [] }));
    await writeFile(join(root, "docs", "idevflow", "release.json"), JSON.stringify({ schemaVersion: 1, version: "1.0", build: "1", bundleId: "dev.piios.SampleApp", target: "testflight-internal", releaseNotes: "Verified SampleApp cutover", knownIssues: [], supportUrl: "https://example.com/support", privacyUrl: "https://example.com/privacy" }));
    await writeFile(join(root, "SampleApp", "ContentView.swift"), "import SwiftUI\n\nstruct ContentView: View { var body: some View { Text(\"Verified cutover\") } }\n");
    await execFileAsync("git", ["add", "."], { cwd: root }); await execFileAsync("git", ["commit", "-m", "feat: prepare verified handoff"], { cwd: root });

    const repository = await discoverRepository(root); await initializeConfig(root); await advanceToTested(repository);
    const commit = await git(root, ["rev-parse", "HEAD"]); const now = new Date().toISOString();
    const session: WriterSession = { id: "real-handoff-session", piSessionId: "real-handoff", stage: "test", task: "verify real SampleApp handoff", risk: "high", status: "integrated", branch: "idev/integration", worktreePath: root, baseCommit: await git(root, ["rev-parse", "main"]), claims: ["SampleApp", "docs/idevflow"], createdAt: now, heartbeatAt: now, leaseExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), commit };
    await new SessionRegistry(repository).start(session, "real-handoff-e2e");
    await recordContextReceipt(repository, { session, stage: "test", risk: "high", task: session.task, selection: selectKnowledge({ stage: "test", risk: "high", task: session.task }) });
    const initialConfig = await loadConfig(root);
    await writeFile(join(root, ".idevflow", "config.json"), JSON.stringify({ ...initialConfig, quality: { ...initialConfig.quality, performanceBudgets: { "Duration (AppLaunch)": 60 } } }));
    const config = await loadConfig(root);
    const integration = await verifySession({ repository, config, session, requestedProfile: "integration" });
    assert.equal(integration.success, true, integration.commands.map((result) => result.stderrTail).join("\n"));
    await recordContextReceipt(repository, { session, stage: "review", risk: "high", task: "Review SampleApp integration quality", selection: selectKnowledge({ stage: "review", risk: "high", task: "Review SampleApp integration quality" }) });
    await recordReview(repository, "real-handoff", integration.verificationFingerprint, { verdict: "pass", summary: "SampleApp integration verification passed", findings: [], residualRisk: "Manual upload remains outside iDevFlow" });
    await recordContextReceipt(repository, { session, stage: "ship", risk: "critical", task: "Release SampleApp TestFlight candidate", selection: selectKnowledge({ stage: "ship", risk: "critical", task: "Release SampleApp TestFlight candidate" }) });

    const source = await sourceFingerprint(session);
    await acquireSimulatorLease(repository, config, session.id, true);
    const screenshots = await Promise.all(config.verification.requiredScreenshotVariants.map((variant) => captureSimulatorScreenshot(repository, config, session.id, variant, source.fingerprint)));
    const evidenceDirectory = join(root, ".idevflow", "evidence", session.id); await mkdir(evidenceDirectory, { recursive: true });
    const accessibility = join(evidenceDirectory, "accessibility-evidence.json"); const performance = join(evidenceDirectory, "performance-evidence.json");
    await writeFile(accessibility, JSON.stringify({ integrationTestReceipt: integration.id, result: "manual accessibility checklist passed" }));
    await writeFile(performance, JSON.stringify({ integrationTestReceipt: integration.id, xcodeTestDurationMs: integration.commands.reduce((total, result) => total + result.durationMs, 0) }));
    const release = await verifySession({ repository, config, session, requestedProfile: "release", proofs: [
      ...screenshots.map((shot) => ({ kind: "screenshot" as const, path: shot.path, metadata: { sourceFingerprint: source.fingerprint, variant: shot.lease ? shot.path.split("/").at(-1)!.replace(/\.png$/, "") : "" } })),
      { kind: "accessibility", path: accessibility, metadata: { sourceFingerprint: source.fingerprint, passed: true, tests: ["SampleAppTests.testAccessibilityAudit"], testIdentifier: "SampleAppTests.testAccessibilityAudit", auditAPI: "XCUIApplication.performAccessibilityAudit", auditIssues: 0 } },
      { kind: "performance", path: performance, metadata: { sourceFingerprint: source.fingerprint, passed: true, testIdentifier: "SampleAppTests.testLaunchPerformance", metric: "Duration (AppLaunch)", metrics: { xcodeTestDurationMs: integration.commands.reduce((total, result) => total + result.durationMs, 0) } } },
    ] });
    assert.equal(release.success, true, release.commands.map((result) => result.stderrTail).join("\n"));
    const candidate = await createCandidate(repository, session, release.verificationFingerprint, "testflight-internal");
    const approval = await issuePromotionApproval(repository, "real-handoff-founder"); const promoted = await promoteCandidate(repository, approval.token);
    const handoff = await createTestFlightHandoff(repository, "real-handoff-founder");
    assert.equal(promoted.status, "promoted"); assert.equal(handoff.candidate.status, "handed_off");
    assert.equal(await git(root, ["rev-parse", "main"]), candidate.commit);
    await releaseSimulatorLease(repository, config, session.id);
  });
});
