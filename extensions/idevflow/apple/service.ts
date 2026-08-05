import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { hashPath } from "../artifacts/manifest.ts";
import type { iDevFlowConfig } from "../config/config.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { discoverXcodeProject } from "../xcode/discovery.ts";

const execFileAsync = promisify(execFile);

export interface SigningTarget {
  readonly target: string;
  readonly bundleId?: string;
  readonly teamId?: string;
  readonly identity?: string;
  readonly profile?: string;
  readonly entitlements?: string;
}

export interface SigningAudit {
  readonly project: { readonly container: string; readonly scheme: string; readonly bundleId?: string; readonly version?: string; readonly build?: string };
  readonly targets: readonly SigningTarget[];
  readonly identities: readonly string[];
  readonly findings: readonly string[];
}

function value(settings: Record<string, unknown>, key: string): string | undefined {
  const candidate = settings[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

export function signingTargets(settings: unknown): SigningTarget[] {
  if (!Array.isArray(settings)) throw new SafetyKernelError("xcodebuild returned invalid signing settings JSON");
  return settings.map((entry): SigningTarget => {
    const target = entry as { target?: string; buildSettings?: Record<string, unknown> };
    const build = target.buildSettings ?? {};
    const bundleId = value(build, "PRODUCT_BUNDLE_IDENTIFIER");
    const teamId = value(build, "DEVELOPMENT_TEAM");
    const identity = value(build, "CODE_SIGN_IDENTITY");
    const profile = value(build, "PROVISIONING_PROFILE_SPECIFIER");
    const entitlements = value(build, "CODE_SIGN_ENTITLEMENTS");
    return { target: target.target ?? "unknown", ...(bundleId ? { bundleId } : {}), ...(teamId ? { teamId } : {}), ...(identity ? { identity } : {}), ...(profile ? { profile } : {}), ...(entitlements ? { entitlements } : {}) };
  });
}

export function signingFindings(targets: readonly SigningTarget[], identities: readonly string[]): string[] {
  const findings: string[] = [];
  for (const target of targets) {
    if (!target.bundleId) findings.push(`${target.target}: PRODUCT_BUNDLE_IDENTIFIER is missing.`);
    if (!target.teamId) findings.push(`${target.target}: DEVELOPMENT_TEAM is missing.`);
    if (!target.identity) findings.push(`${target.target}: CODE_SIGN_IDENTITY is missing.`);
    if (/Apple Development|iPhone Developer/i.test(target.identity ?? "")) findings.push(`${target.target}: Release currently selects a development identity; an App Store distribution archive will need Apple Distribution signing.`);
  }
  if (!identities.some((identity) => /Apple Distribution|iPhone Distribution/i.test(identity))) findings.push("No Apple Distribution identity is installed; create or download one before exporting an App Store archive.");
  return findings;
}

async function command(executable: string, args: readonly string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(executable, [...args], { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    throw new SafetyKernelError(`${executable} failed: ${(result.stderr ?? String(error)).trim()}`);
  }
}

function projectArgs(project: { kind: string; container: string; scheme: string }): string[] {
  if (project.kind !== "workspace" && project.kind !== "project") throw new SafetyKernelError("Apple operation requires an Xcode project or workspace");
  return [project.kind === "workspace" ? "-workspace" : "-project", project.container, "-scheme", project.scheme];
}

export async function auditAppleSigning(root: string, config: iDevFlowConfig): Promise<SigningAudit> {
  if (config.xcode.platform !== "ios") throw new SafetyKernelError("Apple signing audit currently supports iOS projects only");
  const project = await discoverXcodeProject(root, config, undefined, "Release");
  if (project.kind !== "workspace" && project.kind !== "project") throw new SafetyKernelError("Apple signing audit requires an Xcode app project or workspace");
  const settings = await command("xcodebuild", [...projectArgs(project), "-configuration", "Release", "-showBuildSettings", "-json"], root);
  let targets: SigningTarget[];
  try { targets = signingTargets(JSON.parse(settings.stdout)); }
  catch (error) { if (error instanceof SafetyKernelError) throw error; throw new SafetyKernelError("xcodebuild returned invalid signing settings JSON", { cause: error }); }
  const security = await command("security", ["find-identity", "-v", "-p", "codesigning"], root).catch(() => ({ stdout: "", stderr: "" }));
  const identities = security.stdout.split("\n").map((line) => line.match(/\"(.+)\"/)?.[1]).filter((identity): identity is string => Boolean(identity));
  return { project: { container: project.containerName, scheme: project.scheme, ...(project.bundleIdentifier ? { bundleId: project.bundleIdentifier } : {}), ...(project.marketingVersion ? { version: project.marketingVersion } : {}), ...(project.buildNumber ? { build: project.buildNumber } : {}) }, targets, identities, findings: signingFindings(targets, identities) };
}

export async function provisionAppleDevice(root: string, config: iDevFlowConfig, deviceId: string): Promise<void> {
  if (!/^[A-Fa-f0-9-]{8,}$/.test(deviceId)) throw new SafetyKernelError("deviceId must be an iOS device UDID");
  const project = await discoverXcodeProject(root, config);
  if ((project.kind !== "workspace" && project.kind !== "project") || project.platform !== "ios") throw new SafetyKernelError("Device provisioning requires an iOS Xcode app project or workspace");
  await command("xcodebuild", [...projectArgs(project), "-configuration", config.xcode.configuration, "-destination", `id=${deviceId}`, "-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration", "build"], root);
}

export interface ArchiveSigningEvidence {
  readonly appPath: string;
  readonly authorities: readonly string[];
  readonly teamId?: string;
  readonly entitlementsFingerprint: string;
  readonly distributionSigned: boolean;
}

export interface ArchiveReceipt {
  readonly schemaVersion: 1;
  readonly candidate: { readonly id: string; readonly fingerprint: string; readonly commit: string; readonly target: string };
  readonly archive: { readonly path: string; readonly sha256: string; readonly bytes: number };
  readonly signing: ArchiveSigningEvidence;
  readonly configurationFindings: readonly string[];
  readonly verdict: "ready_for_founder_upload_review" | "signing_attention";
  readonly createdAt: string;
  readonly boundary: { readonly exported: false; readonly uploaded: false; readonly distributed: false };
}

export function archiveSigningEvidence(appPath: string, details: string): ArchiveSigningEvidence {
  const authorities = [...details.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1]!.trim());
  const teamId = details.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
  const entitlements = details.match(/<\?xml[\s\S]*<\/plist>/)?.[0] ?? "";
  return { appPath, authorities, ...(teamId ? { teamId } : {}), entitlementsFingerprint: createHash("sha256").update(entitlements).digest("hex"), distributionSigned: authorities.some((authority) => /Apple Distribution|iPhone Distribution/i.test(authority)) };
}

async function archivedAppPath(archivePath: string): Promise<string> {
  const directory = join(archivePath, "Products", "Applications");
  const apps = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (apps.length !== 1) throw new SafetyKernelError("Archive must contain exactly one iOS app bundle");
  return join(directory, apps[0]!.name);
}

export async function archiveAppleApp(root: string, config: iDevFlowConfig, archiveId: string): Promise<{ archivePath: string; signing: ArchiveSigningEvidence }> {
  const project = await discoverXcodeProject(root, config, undefined, "Release");
  if ((project.kind !== "workspace" && project.kind !== "project") || project.platform !== "ios") throw new SafetyKernelError("TestFlight archive requires an iOS Xcode app project or workspace");
  const directory = join(root, ".idevflow", "release", "archives");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const archivePath = join(directory, `${archiveId}.xcarchive`);
  await command("xcodebuild", [...projectArgs(project), "-configuration", "Release", "-destination", "generic/platform=iOS", "-allowProvisioningUpdates", "-archivePath", archivePath, "archive"], root);
  const appPath = await archivedAppPath(archivePath);
  const details = await command("codesign", ["-d", "--entitlements", ":-", appPath], root);
  return { archivePath, signing: archiveSigningEvidence(appPath, `${details.stdout}\n${details.stderr}`) };
}

export async function writeArchiveReceipt(root: string, candidate: { id: string; fingerprint: string; commit: string; target: string }, archivePath: string, signing: ArchiveSigningEvidence, configurationFindings: readonly string[]): Promise<{ receipt: ArchiveReceipt; path: string }> {
  const archive = await hashPath(archivePath);
  const receipt: ArchiveReceipt = { schemaVersion: 1, candidate: { id: candidate.id, fingerprint: candidate.fingerprint, commit: candidate.commit, target: candidate.target }, archive: { path: archivePath, ...archive }, signing, configurationFindings, verdict: signing.distributionSigned && !configurationFindings.length ? "ready_for_founder_upload_review" : "signing_attention", createdAt: new Date().toISOString(), boundary: { exported: false, uploaded: false, distributed: false } };
  const path = join(root, ".idevflow", "release", "archives", `${candidate.id}.json`);
  await writeFileAtomically(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, path };
}
