import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { iDevFlowConfig } from "../config/config.ts";
import { requireContextReceipt } from "../context/receipts.ts";
import { changedFiles } from "../git/changes.ts";
import { hashArtifact } from "../artifacts/manifest.ts";
import { assertArtifactContainsNoSecrets } from "../artifacts/security.ts";
import { pruneExpiredArtifactDirectories, pruneExpiredDirectories } from "../artifacts/retention.ts";
import { runSupervised, type ProcessSpec, type SupervisedProcessResult } from "../process/supervisor.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import type { WriterSession } from "../sessions/types.ts";
import { acquireSimulatorLease, releaseSimulatorLease } from "../simulator/service.ts";
import { SimulatorLeaseStore } from "../simulator/leases.ts";
import type { SimulatorLease } from "../simulator/types.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { discoverXcodeProject, systemProbe, type XcodeProjectDescriptor } from "../xcode/discovery.ts";
import { discoverToolchain } from "../xcode/toolchain.ts";
import { sourceFingerprint, verificationFingerprint } from "./fingerprint.ts";
import { collectProof, simulatorProof, type ProofInput } from "./proofs.ts";
import { PROFILE_CONTRACTS, VERIFICATION_PROFILES, assertVerificationProfileSupported, missingRequiredProofs, requiredProofs, selectVerificationProfile, type VerificationProfile } from "./profiles.ts";
import { VerificationReceiptStore } from "./receipts.ts";
import type { ArtifactRecord, QualityProof, VerificationReceipt } from "./types.ts";
import { assertPassedXCTest, assertPerformanceBudget, assertQualityTestSource } from "./xctest-evidence.ts";

const PROFILE_RANK = new Map(VERIFICATION_PROFILES.map((profile, index) => [profile, index]));

export interface VerificationInput {
  readonly repository: RepositoryDescriptor;
  readonly config: iDevFlowConfig;
  readonly session: WriterSession;
  readonly requestedProfile?: VerificationProfile;
  readonly proofs?: readonly ProofInput[];
  readonly signal?: AbortSignal;
  readonly onProgress?: (message: string) => void;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function chooseProfile(session: WriterSession, files: readonly string[], requested?: VerificationProfile): VerificationProfile {
  const adaptive = selectVerificationProfile({ stage: session.stage, risk: session.risk, changedFiles: files });
  if (!requested) return adaptive;
  if ((PROFILE_RANK.get(requested) ?? -1) < (PROFILE_RANK.get(adaptive) ?? 0)) {
    throw new SafetyKernelError(`Requested verification profile ${requested} is weaker than required ${adaptive}`);
  }
  return requested;
}

function xcodeBaseArgs(
  project: XcodeProjectDescriptor,
  config: iDevFlowConfig,
  simulator: SimulatorLease | undefined,
  derivedData: string,
  configuration: string,
): string[] {
  return [
    project.kind === "workspace" ? "-workspace" : "-project",
    project.container,
    "-scheme", project.scheme,
    "-configuration", configuration,
    "-destination", config.xcode.destination ?? (config.xcode.platform === "macos" ? "platform=macOS" : `platform=iOS Simulator,id=${simulator!.udid}`),
    "-derivedDataPath", derivedData,
    "COMPILER_INDEX_STORE_ENABLE=NO",
  ];
}

async function runCommand(spec: ProcessSpec, signal: AbortSignal | undefined): Promise<SupervisedProcessResult> {
  return runSupervised(spec, signal);
}

export async function verifySession(input: VerificationInput): Promise<VerificationReceipt> {
  if (input.session.status !== "active" && input.session.status !== "ready_for_integration" && input.session.status !== "integrated") {
    throw new SafetyKernelError(`Verification requires an active, ready, or integrated writer session, found ${input.session.status}`);
  }
  const files = await changedFiles(input.session.worktreePath);
  const profile = chooseProfile(input.session, files, input.requestedProfile);
  assertVerificationProfileSupported(profile, input.config.xcode.platform);
  const contract = PROFILE_CONTRACTS[profile];
  input.onProgress?.(`Selected ${profile} verification for ${files.length} changed file(s)`);
  const source = await sourceFingerprint(input.session);
  const contextReceipt = await requireContextReceipt(input.repository, { session: input.session, stage: input.session.stage, risk: input.session.risk, profile });

  const toolchain = await discoverToolchain(input.session.worktreePath);
  const project = profile === "docs" ? undefined : await discoverXcodeProject(input.session.worktreePath, input.config, systemProbe, profile === "release" ? "Release" : input.config.xcode.configuration);
  if (project && project.kind !== "swift-package") {
    const deployment = Number.parseFloat(project.deploymentTarget ?? "0");
    if (deployment < 26) throw new SafetyKernelError(`iDevFlow requires ${project.platform === "macos" ? "macOS" : "iOS"} deployment target 26 or newer, found ${project.deploymentTarget ?? "unknown"}`);
  }
  let simulator: SimulatorLease | undefined;
  let releaseSimulatorAfterVerification = false;
  if (project && project.kind !== "swift-package" && project.platform === "ios") {
    input.onProgress?.("Acquiring an exclusive iOS simulator lease");
    const currentLeases = await new SimulatorLeaseStore(input.repository).load();
    const preexisting = Object.values(currentLeases.leases).find((lease) => lease.sessionId === input.session.id && Date.parse(lease.expiresAt) >= Date.now());
    simulator = await acquireSimulatorLease(input.repository, input.config, input.session.id, true);
    releaseSimulatorAfterVerification = !preexisting;
  }

  try {
    const staleProof = (input.proofs ?? []).find((proof) => proof.metadata.sourceFingerprint !== source.fingerprint);
    if (staleProof) throw new SafetyKernelError(`${staleProof.kind} proof is not bound to the current source fingerprint`);
    const proofDescriptors = await Promise.all((input.proofs ?? []).map(async (proof) => {
      const artifact = await hashArtifact(proof.path, "proof");
      return { kind: proof.kind, sha256: artifact.sha256, bytes: artifact.bytes, metadata: proof.metadata };
    }));
    const proofFingerprint = createHash("sha256").update(JSON.stringify(proofDescriptors)).digest("hex");
    const fingerprints = verificationFingerprint({
      source: source.fingerprint,
      config: input.config,
      ...(project ? { project } : {}),
      toolchain,
      ...(simulator ? { simulator } : {}),
      profile,
      proofFingerprint,
      ...(contextReceipt ? { contextReceiptFingerprint: contextReceipt.selectionFingerprint } : {}),
    });
    const receiptStore = new VerificationReceiptStore(input.repository);
    if (contract.reusable) {
      const cached = await receiptStore.reusable(fingerprints.fingerprint, input.config.verification.receiptMaxAgeHours);
      if (cached) {
        input.onProgress?.(`Reused exact verification receipt ${cached.id}`);
        return { ...cached, reused: true };
      }
    }

    const artifactRoot = join(input.repository.primaryRoot, ".idevflow", "artifacts", "verification");
    const artifactDirectory = join(artifactRoot, fingerprints.fingerprint);
    await rm(artifactDirectory, { recursive: true, force: true });
    await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
    await pruneExpiredArtifactDirectories(artifactRoot, input.config.verification.artifactRetentionDays, new Set([fingerprints.fingerprint]));

    const providedProofs: QualityProof[] = [];
    for (const proof of input.proofs ?? []) providedProofs.push(await collectProof(proof, artifactDirectory));
    const providedKinds = new Set(providedProofs.map((proof) => proof.kind));
    const fullReleaseEvidence = input.config.release.evidence === "full";
    const externallyRequired = requiredProofs(profile, fullReleaseEvidence ? input.config.verification.requiredScreenshotVariants : [], fullReleaseEvidence && input.config.quality.requireXCTestEvidence, project?.platform ?? "ios").filter((kind) => kind !== "simulator");
    const missingExternal = externallyRequired.filter((kind) => !providedKinds.has(kind));
    if (missingExternal.length) throw new SafetyKernelError(`${profile} verification requires proof inputs: ${missingExternal.join(", ")}`);

    const commands: SupervisedProcessResult[] = [];
    const artifacts: ArtifactRecord[] = [];
    let testEvidenceValid = true;
    let testResultBundle: string | undefined;
    const startedAt = new Date().toISOString();
    const resourcesRoot = join(input.repository.primaryRoot, ".idevflow", "resources");
    await pruneExpiredDirectories(resourcesRoot, input.config.verification.artifactRetentionDays, new Set([input.session.id]));
    const resources = join(resourcesRoot, input.session.id);
    const derivedData = join(resources, "DerivedData");
    const scratch = join(resources, "SwiftScratch");
    const actions = project?.kind === "swift-package" ? contract.swiftActions : contract.xcodeActions;

    for (const [index, action] of actions.entries()) {
      input.onProgress?.(`Running ${action} (${index + 1}/${actions.length})`);
      const name = `${index + 1}-${action}`;
      const resultBundle = join(artifactDirectory, `${name}.xcresult`);
      let executable: string;
      let args: string[];
      if (!project) {
        executable = "git";
        args = ["diff", "--check", "HEAD"];
      } else if (project.kind === "swift-package") {
        executable = "swift";
        args = [action, "--scratch-path", scratch];
      } else {
        if (project.platform === "ios" && !simulator) throw new SafetyKernelError("iOS Xcode verification is missing a simulator lease");
        executable = "xcodebuild";
        args = [...xcodeBaseArgs(project, input.config, simulator, derivedData, profile === "release" ? "Release" : input.config.xcode.configuration), ...(action === "test" ? ["-parallel-testing-enabled", "NO"] : []), "-resultBundlePath", resultBundle, action];
      }
      const result = await runCommand({
        executable,
        args,
        cwd: input.session.worktreePath,
        timeoutMs: input.config.verificationTimeoutSeconds * 1000,
        stdoutPath: join(artifactDirectory, `${name}.stdout.log`),
        stderrPath: join(artifactDirectory, `${name}.stderr.log`),
        environment: { NSUnbufferedIO: "YES" },
      }, input.signal);
      commands.push(result);
      artifacts.push(await hashArtifact(result.stdoutPath, "stdout"), await hashArtifact(result.stderrPath, "stderr"));
      const hasResultBundle = await exists(resultBundle);
      if (result.code !== 0 || result.timedOut || result.cancelled) {
        if (hasResultBundle) artifacts.push(await hashArtifact(resultBundle, "xcresult"));
        break;
      }
      if (project && project.kind !== "swift-package" && input.config.verification.requireXcresult && !hasResultBundle) {
        testEvidenceValid = false;
        input.onProgress?.(`Missing required xcresult for ${action}`);
        break;
      }

      if (action === "test" && hasResultBundle) {
        testResultBundle = resultBundle;
        const summary = await runCommand({
          executable: "xcrun",
          args: ["xcresulttool", "get", "test-results", "summary", "--path", resultBundle, "--compact"],
          cwd: input.session.worktreePath,
          timeoutMs: 60_000,
          stdoutPath: join(artifactDirectory, `${name}.summary.json`),
          stderrPath: join(artifactDirectory, `${name}.summary.stderr.log`),
        }, input.signal);
        commands.push(summary);
        artifacts.push(
          await hashArtifact(summary.stdoutPath, "summary"),
          await hashArtifact(summary.stderrPath, "stderr"),
          await hashArtifact(resultBundle, "xcresult"),
        );
        if (summary.code !== 0) {
          testEvidenceValid = false;
          break;
        }
        try {
          const value = JSON.parse(await readFile(summary.stdoutPath, "utf8")) as { totalTestCount?: number; failedTests?: number };
          if (!value.totalTestCount || value.totalTestCount < 1 || (value.failedTests ?? 0) > 0) testEvidenceValid = false;
        } catch {
          testEvidenceValid = false;
        }
        if (!testEvidenceValid) {
          input.onProgress?.("Test result bundle contains no passing tests or has invalid summary evidence");
          break;
        }
      } else if (hasResultBundle) {
        artifacts.push(await hashArtifact(resultBundle, "xcresult"));
      }
    }

    if (profile === "docs") {
      const result = await runCommand({
        executable: "git",
        args: ["diff", "--check", "HEAD"],
        cwd: input.session.worktreePath,
        timeoutMs: 60_000,
        stdoutPath: join(artifactDirectory, "docs.stdout.log"),
        stderrPath: join(artifactDirectory, "docs.stderr.log"),
      }, input.signal);
      commands.push(result);
      artifacts.push(await hashArtifact(result.stdoutPath, "stdout"), await hashArtifact(result.stderrPath, "stderr"));
    }

    const success = testEvidenceValid && commands.length > 0 && commands.every((command) => command.code === 0 && !command.timedOut && !command.cancelled);
    if (success && profile === "release" && input.config.quality.requireXCTestEvidence) {
      if (!testResultBundle) throw new SafetyKernelError("Release quality proof requires a fresh XCTest result bundle");
      const accessibility = providedProofs.find((proof) => proof.kind === "accessibility");
      const performance = providedProofs.find((proof) => proof.kind === "performance");
      if (!accessibility || !performance) throw new SafetyKernelError("Release quality proof requires accessibility and performance inputs");
      const tests = await runCommand({ executable: "xcrun", args: ["xcresulttool", "get", "test-results", "tests", "--path", testResultBundle, "--compact"], cwd: input.session.worktreePath, timeoutMs: 60_000, stdoutPath: join(artifactDirectory, "quality.tests.json"), stderrPath: join(artifactDirectory, "quality.tests.stderr.log") }, input.signal);
      commands.push(tests); artifacts.push(await hashArtifact(tests.stdoutPath, "summary"), await hashArtifact(tests.stderrPath, "stderr"));
      if (tests.code !== 0) throw new SafetyKernelError("Could not read XCTest test evidence from the fresh xcresult");
      const testResults = JSON.parse(await readFile(tests.stdoutPath, "utf8")) as unknown;
      const accessibilityIdentifier = String(accessibility.metadata.testIdentifier ?? "");
      await assertQualityTestSource(input.session.worktreePath, "accessibility", accessibilityIdentifier);
      assertPassedXCTest(testResults, accessibilityIdentifier);
      const performanceIdentifier = String(performance.metadata.testIdentifier ?? "");
      const metric = String(performance.metadata.metric ?? "");
      await assertQualityTestSource(input.session.worktreePath, "performance", performanceIdentifier);
      assertPassedXCTest(testResults, performanceIdentifier);
      const budget = input.config.quality.performanceBudgets[metric];
      if (!budget) throw new SafetyKernelError(`No project-owned performance budget configured for XCTest metric ${metric}`);
      const metrics = await runCommand({ executable: "xcrun", args: ["xcresulttool", "get", "test-results", "metrics", "--path", testResultBundle, "--compact"], cwd: input.session.worktreePath, timeoutMs: 60_000, stdoutPath: join(artifactDirectory, "quality.metrics.json"), stderrPath: join(artifactDirectory, "quality.metrics.stderr.log") }, input.signal);
      commands.push(metrics); artifacts.push(await hashArtifact(metrics.stdoutPath, "summary"), await hashArtifact(metrics.stderrPath, "stderr"));
      if (metrics.code !== 0) throw new SafetyKernelError("Could not read XCTest performance evidence from the fresh xcresult");
      assertPerformanceBudget(JSON.parse(await readFile(metrics.stdoutPath, "utf8")) as unknown, performanceIdentifier, metric, budget);
    }
    const proofs = [...providedProofs];
    if (success && simulator) {
      proofs.push(await simulatorProof({
        udid: simulator.udid,
        name: simulator.name,
        runtimeVersion: simulator.runtimeVersion,
        destination: input.config.xcode.destination ?? `platform=iOS Simulator,id=${simulator.udid}`,
        commandsPassed: commands.length,
      }, artifactDirectory));
    }
    const missingProofs = missingRequiredProofs(profile, proofs, fullReleaseEvidence ? input.config.verification.requiredScreenshotVariants : [], project?.platform ?? "ios", fullReleaseEvidence && input.config.quality.requireXCTestEvidence);
    const finalSuccess = success && missingProofs.length === 0;
    artifacts.push(...proofs.map((proof) => proof.artifact));

    try {
      await assertArtifactContainsNoSecrets(artifactDirectory);
    } catch (error) {
      await rm(artifactDirectory, { recursive: true, force: true });
      throw error;
    }

    const receipt: VerificationReceipt = {
      schemaVersion: 1,
      id: randomUUID(),
      sessionId: input.session.id,
      profile,
      verificationFingerprint: fingerprints.fingerprint,
      sourceFingerprint: source.fingerprint,
      sourceCommit: source.commit,
      configurationFingerprint: fingerprints.configFingerprint,
      ...(contextReceipt ? { contextReceiptFingerprint: contextReceipt.selectionFingerprint } : {}),
      ...(project ? { project } : {}),
      toolchain,
      ...(simulator ? { simulator } : {}),
      startedAt,
      finishedAt: new Date().toISOString(),
      success: finalSuccess,
      reused: false,
      commands,
      artifacts,
      proofs,
    };
    await receiptStore.save(fingerprints.fingerprint, receipt);
    if (missingProofs.length) input.onProgress?.(`Missing required proofs: ${missingProofs.join(", ")}`);
    return receipt;
  } finally {
    if (simulator && releaseSimulatorAfterVerification) {
      await releaseSimulatorLease(input.repository, input.config, input.session.id).catch(() => undefined);
    }
  }
}
