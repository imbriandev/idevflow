import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { hashArtifact } from "../extensions/appforge/artifacts/manifest.ts";
import { initializeConfig } from "../extensions/appforge/config/config.ts";
import { loadDefinedProduct } from "../extensions/appforge/documents/product.ts";
import { approvePlan, integrateCurrentStage, recordReview } from "../extensions/appforge/lifecycle/service.ts";
import { discoverRepository } from "../extensions/appforge/repository/discovery.ts";
import { createCandidate, createTestFlightHandoff, issuePromotionApproval, promoteCandidate } from "../extensions/appforge/release/service.ts";
import { SessionRegistry } from "../extensions/appforge/sessions/registry.ts";
import { finishSession, runPostflight, writePreflight } from "../extensions/appforge/sessions/service.ts";
import type { WriterSession } from "../extensions/appforge/sessions/types.ts";
import { RuntimeStore } from "../extensions/appforge/state/runtime-store.ts";
import { sourceFingerprint } from "../extensions/appforge/verification/fingerprint.ts";
import type { VerificationProfile } from "../extensions/appforge/verification/profiles.ts";
import { VerificationReceiptStore } from "../extensions/appforge/verification/receipts.ts";
import type { ArtifactRecord, QualityProof, VerificationReceipt } from "../extensions/appforge/verification/types.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fakeVerification(repository: Awaited<ReturnType<typeof discoverRepository>>, session: WriterSession, profile: VerificationProfile, project = false): Promise<string> {
  const source = await sourceFingerprint(session);
  const fingerprint = randomUUID().replaceAll("-", "");
  const now = new Date().toISOString();
  const artifacts: ArtifactRecord[] = [];
  const proofs: QualityProof[] = [];
  if (project && profile === "release") {
    const directory = join(repository.primaryRoot, ".appforge", "artifacts", "fake-release", fingerprint);
    await mkdir(directory, { recursive: true });
    for (const [name, kind] of [["build.xcresult", "xcresult"], ["test.xcresult", "xcresult"], ["summary.json", "summary"], ["quality.tests.json", "summary"], ["quality.metrics.json", "summary"]] as const) {
      const path = join(directory, name);
      await writeFile(path, name);
      artifacts.push(await hashArtifact(path, kind));
    }
    for (const [kind, variant] of [["simulator", ""], ["screenshot", "compact-light"], ["screenshot", "compact-dark"], ["screenshot", "accessibility-xxxl"], ["accessibility", ""], ["performance", ""]] as const) {
      const path = join(directory, `${kind}-${variant || "proof"}.json`);
      await writeFile(path, JSON.stringify({ kind, variant }));
      const artifact = await hashArtifact(path, "proof");
      artifacts.push(artifact);
      proofs.push({ kind, artifact, metadata: { sourceFingerprint: source.fingerprint, ...(variant ? { variant } : {}), ...(kind === "accessibility" ? { passed: true, tests: ["QualityTests.testAccessibility"], testIdentifier: "QualityTests.testAccessibility", auditAPI: "XCUIApplication.performAccessibilityAudit", auditIssues: 0 } : {}), ...(kind === "performance" ? { passed: true, metrics: { "Application Launch": 0.8 }, testIdentifier: "QualityTests.testLaunch", metric: "Application Launch" } : {}) } });
    }
  }
  const receipt: VerificationReceipt = {
    schemaVersion: 1, id: randomUUID(), sessionId: session.id, profile, verificationFingerprint: fingerprint,
    sourceFingerprint: source.fingerprint, sourceCommit: source.commit, configurationFingerprint: "config",
    ...(project ? { project: { kind: "project" as const, root: session.worktreePath, container: "App.xcodeproj", containerName: "App.xcodeproj", scheme: "App", schemes: ["App"], deploymentTarget: "26.0", bundleIdentifier: "com.example.golden", marketingVersion: "1.0", buildNumber: "1" } } : {}),
    toolchain: { xcode: "Xcode 26", swift: "Apple Swift version 6.2", developerDirectory: "/Applications/Xcode.app", fingerprint: "toolchain" },
    startedAt: now, finishedAt: now, success: true, reused: false, commands: [], artifacts, proofs,
  };
  await new VerificationReceiptStore(repository).save(fingerprint, receipt);
  return fingerprint;
}

async function completeWriterStage(
  repository: Awaited<ReturnType<typeof discoverRepository>>,
  input: { piSessionId: string; stage: "define" | "plan" | "build" | "test" | "learn"; task: string; paths: string[]; write(session: WriterSession): Promise<void> },
): Promise<WriterSession> {
  let session = await writePreflight(repository, { ...input, risk: "medium" });
  await input.write(session);
  const verification = await fakeVerification(repository, session, input.stage === "define" || input.stage === "plan" || input.stage === "learn" ? "docs" : "integration");
  await runPostflight(repository, session, `${input.stage} evidence`, verification);
  session = (await new SessionRegistry(repository).findLatestByPiSession(input.piSessionId))!;
  await finishSession(repository, session, `test: complete ${input.stage}`);
  session = (await new SessionRegistry(repository).findLatestByPiSession(input.piSessionId))!;
  await integrateCurrentStage(repository, session, `${input.stage} integrated evidence`);
  return (await new SessionRegistry(repository).findLatestByPiSession(input.piSessionId))!;
}

describe("single-agent full lifecycle", () => {
  it("moves a frozen SLC through approval, receipts, candidate promotion, and manual TestFlight handoff", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup, async () => rm(`${fixture.root}.pi-ios-worktrees`, { recursive: true, force: true }), async () => rm(`${fixture.root}.pi-ios-integration`, { recursive: true, force: true }));
    await execFileAsync("git", ["config", "user.name", "Pi iOS Tests"], { cwd: fixture.root });
    await execFileAsync("git", ["config", "user.email", "tests@example.invalid"], { cwd: fixture.root });
    const repository = await discoverRepository(fixture.root);
    await initializeConfig(repository.primaryRoot);
    await new RuntimeStore(repository).initialize("test");

    const define = await completeWriterStage(repository, {
      piSessionId: "golden", stage: "define", task: "define golden app", paths: ["docs/pi-ios/product-memory.json", "docs/pi-ios/slc.json"],
      async write(session) {
        await mkdir(join(session.worktreePath, "docs/pi-ios"), { recursive: true });
        await writeFile(join(session.worktreePath, "docs/pi-ios/product-memory.json"), JSON.stringify({ schemaVersion: 1, product: { name: "Golden", targetUser: "Indie founders", problem: "Uncertain releases", promise: "A verified handoff" }, principles: ["Evidence first"], decisions: [] }));
        await writeFile(join(session.worktreePath, "docs/pi-ios/slc.json"), JSON.stringify({ schemaVersion: 1, title: "Golden SLC", simple: ["One flow"], lovable: ["Clear status"], complete: ["Verified handoff"], nonGoals: ["Automatic upload"], successSignals: ["One beta handoff"], risks: ["Release drift"] }));
      },
    });
    assert.equal(define.status, "integrated");
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "defined");
    const product = await loadDefinedProduct(define.worktreePath, (await initializeConfig(repository.primaryRoot)).documents);

    const plan = await completeWriterStage(repository, {
      piSessionId: "golden", stage: "plan", task: "plan golden app", paths: ["docs/pi-ios/work-graph.json"],
      async write(session) {
        await writeFile(join(session.worktreePath, "docs/pi-ios/work-graph.json"), JSON.stringify({ schemaVersion: 1, title: "Golden graph", sourceSpecFingerprint: product.fingerprint, architecture: [{ id: "ADR-1", title: "Local", decision: "Keep state local", rationale: "Safety", status: "accepted" }], slices: [{ id: "slice-1", title: "Golden app", goal: "Create release inputs", paths: ["Sources", "docs/pi-ios/privacy-review.json", "docs/pi-ios/release.json"], risk: "medium", dependsOn: [], acceptance: ["App and release evidence exist"], verificationProfile: "integration" }] }));
      },
    });
    const approval = await approvePlan(repository, "founder");
    assert.equal(approval.planCommit, plan.commit);
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "plan_approved");

    await completeWriterStage(repository, {
      piSessionId: "golden", stage: "build", task: "build golden slice", paths: ["Sources", "docs/pi-ios/privacy-review.json", "docs/pi-ios/release.json"],
      async write(session) {
        await mkdir(join(session.worktreePath, "Sources"), { recursive: true });
        await writeFile(join(session.worktreePath, "Sources/App.swift"), "struct AppFeature {}\n");
        await writeFile(join(session.worktreePath, "docs/pi-ios/privacy-review.json"), JSON.stringify({ schemaVersion: 1, decision: "go", dataPractices: [], permissions: [], findings: [] }));
        await writeFile(join(session.worktreePath, "docs/pi-ios/release.json"), JSON.stringify({ schemaVersion: 1, version: "1.0", build: "1", bundleId: "com.example.golden", target: "testflight-internal", releaseNotes: "Golden beta", knownIssues: [], supportUrl: "https://example.com/support", privacyUrl: "https://example.com/privacy" }));
      },
    });
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "built");

    const tested = await completeWriterStage(repository, {
      piSessionId: "golden", stage: "test", task: "test golden app", paths: ["Tests"],
      async write(session) { await mkdir(join(session.worktreePath, "Tests"), { recursive: true }); await writeFile(join(session.worktreePath, "Tests/AppTests.swift"), "// verified regression\n"); },
    });
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "tested");

    const integrationVerification = await fakeVerification(repository, tested, "integration");
    const review = await recordReview(repository, "golden", integrationVerification, { verdict: "pass", summary: "No blockers", findings: [], residualRisk: "Manual upload remains" });
    assert.equal(review.stage, "review");
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "review_passed");

    const releaseVerification = await fakeVerification(repository, tested, "release", true);
    const candidate = await createCandidate(repository, tested, releaseVerification, "testflight-internal");
    assert.equal(candidate.status, "ready");
    assert.equal(candidate.monetization.status, "not_required");
    const approvalResult = await issuePromotionApproval(repository, "founder");
    await execFileAsync("git", ["checkout", "pi-ios/integration"], { cwd: fixture.root });
    await assert.rejects(promoteCandidate(repository, "wrong-token"), /does not match/);
    const promoted = await promoteCandidate(repository, approvalResult.token);
    assert.equal(promoted.status, "promoted");
    await assert.rejects(promoteCandidate(repository, approvalResult.token));
    const handoff = await createTestFlightHandoff(repository, "founder");
    assert.equal(handoff.candidate.status, "handed_off");
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "testflight_handoff");
    await completeWriterStage(repository, {
      piSessionId: "golden", stage: "learn", task: "record beta learning", paths: ["docs/pi-ios/product-memory.json"],
      async write(session) {
        const updated = { schemaVersion: 1, product: { name: "Golden", targetUser: "Indie founders", problem: "Uncertain releases", promise: "A verified handoff" }, principles: ["Evidence first"], decisions: [{ id: "learning-1", decision: "Keep upload manual", rationale: "The handoff boundary was clear", status: "active" }] };
        await writeFile(join(session.worktreePath, "docs/pi-ios/product-memory.json"), JSON.stringify(updated));
      },
    });
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "testflight_handoff");
    assert.equal((await execFileAsync("git", ["rev-parse", "main"], { cwd: fixture.root, encoding: "utf8" })).stdout.trim(), candidate.commit);
  });
});
