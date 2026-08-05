import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { iDevFlowConfig } from "../config/config.ts";
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

export async function archiveAppleApp(root: string, config: iDevFlowConfig, archiveId: string): Promise<string> {
  const project = await discoverXcodeProject(root, config, undefined, "Release");
  if ((project.kind !== "workspace" && project.kind !== "project") || project.platform !== "ios") throw new SafetyKernelError("TestFlight archive requires an iOS Xcode app project or workspace");
  const directory = join(root, ".idevflow", "release", "archives");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const archivePath = join(directory, `${archiveId}.xcarchive`);
  await command("xcodebuild", [...projectArgs(project), "-configuration", "Release", "-destination", "generic/platform=iOS", "-allowProvisioningUpdates", "-archivePath", archivePath, "archive"], root);
  return archivePath;
}
