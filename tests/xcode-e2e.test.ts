import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateArtifact } from "../extensions/pi-ios/artifacts/manifest.ts";
import { initializeConfig, loadConfig } from "../extensions/pi-ios/config/config.ts";
import { selectKnowledge } from "../extensions/pi-ios/context/knowledge.ts";
import { recordContextReceipt } from "../extensions/pi-ios/context/receipts.ts";
import { discoverRepository } from "../extensions/pi-ios/repository/discovery.ts";
import { finishSession, runPostflight, writePreflight } from "../extensions/pi-ios/sessions/service.ts";
import { SessionRegistry } from "../extensions/pi-ios/sessions/registry.ts";
import { RuntimeStore } from "../extensions/pi-ios/state/runtime-store.ts";
import { verifySession } from "../extensions/pi-ios/verification/engine.ts";
import { verifyPlatformMatrix } from "../extensions/pi-ios/verification/matrix.ts";
import { VerificationReceiptStore } from "../extensions/pi-ios/verification/receipts.ts";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const enabled = process.env.PI_IOS_XCODE_E2E === "1";
const macEnabled = process.env.PI_MACOS_XCODE_E2E === "1";
const universalEnabled = process.env.PI_UNIVERSAL_XCODE_E2E === "1";

describe("real Xcode verification", () => {
  it("builds a real iOS app on an exclusive simulator and reuses exact proof", { skip: !enabled }, async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-xcode-e2e-"));
    roots.push(root, `${root}.pi-ios-worktrees`);
    await cp(join(import.meta.dirname, "fixtures", "SampleApp"), root, { recursive: true });
    await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["-c", "user.name=Pi iOS Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "fixture"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "Pi iOS Tests"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });

    const repository = await discoverRepository(root);
    await new RuntimeStore(repository).initialize("xcode-e2e");
    await initializeConfig(repository.primaryRoot);
    let session = await writePreflight(repository, {
      piSessionId: "xcode-e2e",
      stage: "build",
      task: "verify sample app",
      risk: "high",
      paths: ["SampleApp/ContentView.swift"],
    });
    const source = join(session.worktreePath, "SampleApp", "ContentView.swift");
    await writeFile(source, (await readFile(source, "utf8")).replace("verification fixture", "verified fixture"));

    const config = await loadConfig(repository.primaryRoot);
    await recordContextReceipt(repository, { session, stage: "build", risk: "high", task: session.task, selection: selectKnowledge({ stage: "build", risk: "high", task: session.task }) });
    const first = await verifySession({ repository, config, session });
    assert.equal(first.success, true, JSON.stringify({ commands: first.commands.map((command) => ({ code: command.code, signal: command.signal, stderr: command.stderrTail.slice(-2000) })), proofs: first.proofs.map((proof) => proof.kind) }, null, 2));
    assert.equal(first.profile, "integration");
    assert.equal(first.project?.kind, "project");
    assert.equal(first.proofs.some((proof) => proof.kind === "simulator"), true);
    assert.equal(first.artifacts.some((artifact) => artifact.kind === "xcresult"), true);
    assert.equal(first.artifacts.some((artifact) => artifact.kind === "summary"), true);
    const artifactChecks = await Promise.all(first.artifacts.map(async (artifact) => ({ path: artifact.path, valid: await validateArtifact(artifact) })));
    assert.ok(await new VerificationReceiptStore(repository).validated(first.verificationFingerprint), JSON.stringify(artifactChecks, null, 2));

    const second = await verifySession({ repository, config, session });
    assert.equal(second.success, true, JSON.stringify({ fingerprint: second.verificationFingerprint, firstFingerprint: first.verificationFingerprint, commands: second.commands.map((command) => ({ code: command.code, signal: command.signal, stderr: command.stderrTail.slice(-2000) })), proofs: second.proofs.map((proof) => proof.kind) }, null, 2));
    assert.equal(second.reused, true);
    assert.equal(second.id, first.id);

    await runPostflight(repository, session, "real Xcode simulator build", first.verificationFingerprint);
    session = (await new SessionRegistry(repository).findLatestByPiSession("xcode-e2e"))!;
    assert.match(await finishSession(repository, session, "test: verify sample app"), /^[a-f0-9]{40}$/);
  });

  it("verifies one exact universal commit on iOS and macOS", { skip: !universalEnabled }, async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-universal-xcode-e2e-"));
    roots.push(root, `${root}.pi-ios-worktrees`);
    await cp(join(import.meta.dirname, "fixtures", "UniversalApp"), root, { recursive: true });
    await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["-c", "user.name=Pi iOS Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "fixture"], { cwd: root });
    const repository = await discoverRepository(root);
    await new RuntimeStore(repository).initialize("universal-e2e");
    await initializeConfig(repository.primaryRoot);
    const session = await writePreflight(repository, { piSessionId: "universal-e2e", stage: "build", task: "verify universal app", risk: "high", paths: ["SampleApp/ContentView.swift"] });
    const source = join(session.worktreePath, "SampleApp", "ContentView.swift");
    await writeFile(source, (await readFile(source, "utf8")).replace("verification fixture", "universal verified fixture"));
    const config = await loadConfig(repository.primaryRoot);
    const universalConfig = { ...config, xcode: { ...config.xcode, requiredPlatforms: ["ios", "macos"] as const } };
    await recordContextReceipt(repository, { session, stage: "build", risk: "high", task: session.task, selection: selectKnowledge({ stage: "build", risk: "high", task: session.task }) });
    const receipt = await verifyPlatformMatrix({ repository, config: universalConfig, session });
    assert.equal(receipt.success, true, JSON.stringify(receipt.commands.map((command) => ({ code: command.code, stderr: command.stderrTail.slice(-2000) })), null, 2));
    assert.deepEqual(receipt.platformMatrix?.requiredPlatforms, ["ios", "macos"]);
    assert.ok(receipt.platformMatrix?.receiptFingerprints.ios);
    assert.ok(receipt.platformMatrix?.receiptFingerprints.macos);
  });

  it("builds and tests a real macOS app without acquiring an iOS simulator", { skip: !macEnabled }, async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-macos-xcode-e2e-"));
    roots.push(root, `${root}.pi-ios-worktrees`);
    await cp(join(import.meta.dirname, "fixtures", "MacApp"), root, { recursive: true });
    await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["-c", "user.name=Pi iOS Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "fixture"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "Pi iOS Tests"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });

    const repository = await discoverRepository(root);
    await new RuntimeStore(repository).initialize("macos-e2e");
    await initializeConfig(repository.primaryRoot);
    let session = await writePreflight(repository, { piSessionId: "macos-e2e", stage: "build", task: "verify macOS sample app", risk: "high", paths: ["SampleApp/ContentView.swift"] });
    const source = join(session.worktreePath, "SampleApp", "ContentView.swift");
    await writeFile(source, (await readFile(source, "utf8")).replace("verification fixture", "verified fixture"));
    const config = await loadConfig(repository.primaryRoot);
    const macConfig = { ...config, xcode: { ...config.xcode, platform: "macos" as const, requiredPlatforms: ["macos"] as const } };
    await recordContextReceipt(repository, { session, stage: "build", risk: "high", task: session.task, selection: selectKnowledge({ stage: "build", risk: "high", task: session.task }) });
    const receipt = await verifySession({ repository, config: macConfig, session });
    assert.equal(receipt.success, true, JSON.stringify(receipt.commands.map((command) => ({ code: command.code, stderr: command.stderrTail.slice(-2000) })), null, 2));
    assert.equal(receipt.project?.platform, "macos");
    assert.equal(receipt.simulator, undefined);
    assert.equal(receipt.proofs.some((proof) => proof.kind === "simulator"), false);
    assert.equal(receipt.artifacts.some((artifact) => artifact.kind === "xcresult"), true);
    await runPostflight(repository, session, "real macOS build and test", receipt.verificationFingerprint);
    session = (await new SessionRegistry(repository).findLatestByPiSession("macos-e2e"))!;
    assert.match(await finishSession(repository, session, "test: verify macOS sample app"), /^[a-f0-9]{40}$/);
  });
});
