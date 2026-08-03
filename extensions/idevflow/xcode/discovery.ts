import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { ApplePlatform, iDevFlowConfig } from "../config/config.ts";
import { SafetyKernelError } from "../state/errors.ts";

const execFileAsync = promisify(execFile);
const IGNORED_DIRECTORIES = new Set([".git", ".idevflow", "DerivedData", ".build", "Pods", "Carthage", "node_modules"]);

export interface ProbeResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandProbe {
  run(executable: string, args: readonly string[], cwd: string): Promise<ProbeResult>;
}

export const systemProbe: CommandProbe = {
  async run(executable, args, cwd) {
    try {
      const result = await execFileAsync(executable, [...args], { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
      return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const value = error as { code?: number; stdout?: string; stderr?: string };
      return { code: typeof value.code === "number" ? value.code : 1, stdout: value.stdout ?? "", stderr: value.stderr ?? String(error) };
    }
  },
};

export type ProjectKind = "workspace" | "project" | "swift-package";

export interface XcodeProjectDescriptor {
  readonly platform: ApplePlatform;
  readonly kind: ProjectKind;
  readonly root: string;
  readonly container: string;
  readonly containerName: string;
  readonly scheme: string;
  readonly schemes: readonly string[];
  readonly deploymentTarget?: string;
  readonly entitlementsPath?: string;
  readonly hardenedRuntime?: boolean;
  readonly swiftLanguageVersion?: string;
  readonly bundleIdentifier?: string;
  readonly marketingVersion?: string;
  readonly buildNumber?: string;
}

async function discoverContainers(root: string, depth = 0): Promise<{ workspaces: string[]; projects: string[]; packages: string[] }> {
  const result = { workspaces: [] as string[], projects: [] as string[], packages: [] as string[] };
  if (depth > 4) return result;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === "Package.swift" && entry.isFile()) result.packages.push(join(root, entry.name));
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.name.endsWith(".xcworkspace")) {
      if (!path.includes(`${sep}.xcodeproj${sep}`)) result.workspaces.push(path);
      continue;
    }
    if (entry.name.endsWith(".xcodeproj")) {
      result.projects.push(path);
      continue;
    }
    const nested = await discoverContainers(path, depth + 1);
    result.workspaces.push(...nested.workspaces);
    result.projects.push(...nested.projects);
    result.packages.push(...nested.packages);
  }
  return result;
}

function safeConfiguredContainer(root: string, configured: string): string {
  const absolute = isAbsolute(configured) ? resolve(configured) : resolve(root, configured);
  const path = relative(root, absolute);
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new SafetyKernelError("Configured Xcode container escapes the worktree");
  return absolute;
}

async function xcodeSchemes(container: string, kind: "workspace" | "project", root: string, probe: CommandProbe): Promise<string[]> {
  const result = await probe.run("xcodebuild", [kind === "workspace" ? "-workspace" : "-project", container, "-list", "-json"], root);
  if (result.code !== 0) throw new SafetyKernelError(`xcodebuild -list failed for ${container}: ${result.stderr.trim()}`);
  let value: { workspace?: { schemes?: string[] }; project?: { schemes?: string[] } };
  try {
    value = JSON.parse(result.stdout) as typeof value;
  } catch (error) {
    throw new SafetyKernelError(`xcodebuild returned invalid project JSON for ${container}`, { cause: error });
  }
  return [...new Set(value.workspace?.schemes ?? value.project?.schemes ?? [])].sort();
}

async function buildSettings(
  container: string,
  kind: "workspace" | "project",
  scheme: string,
  configuration: string,
  root: string,
  probe: CommandProbe,
): Promise<Readonly<Record<string, string>>> {
  const result = await probe.run("xcodebuild", [kind === "workspace" ? "-workspace" : "-project", container, "-scheme", scheme, "-configuration", configuration, "-showBuildSettings", "-json"], root);
  if (result.code !== 0) throw new SafetyKernelError(`xcodebuild -showBuildSettings failed: ${result.stderr.trim()}`);
  try {
    const entries = JSON.parse(result.stdout) as { buildSettings?: Record<string, string> }[];
    const app = entries.find((entry) => entry.buildSettings?.PRODUCT_TYPE === "com.apple.product-type.application") ?? entries[0];
    return app?.buildSettings ?? {};
  } catch (error) {
    throw new SafetyKernelError("xcodebuild returned invalid build-settings JSON", { cause: error });
  }
}

function selectScheme(schemes: readonly string[], configured?: string): string {
  if (configured) {
    if (!schemes.includes(configured)) throw new SafetyKernelError(`Configured scheme ${configured} is not shared or discoverable`);
    return configured;
  }
  const nonTest = schemes.filter((scheme) => !/tests?$/i.test(scheme));
  if (nonTest.length === 1) return nonTest[0]!;
  if (schemes.length === 1) return schemes[0]!;
  throw new SafetyKernelError(`Scheme selection is ambiguous: ${schemes.join(", ") || "none"}. Set xcode.scheme in .idevflow/config.json`);
}

export async function discoverXcodeProject(
  root: string,
  config: iDevFlowConfig,
  probe: CommandProbe = systemProbe,
  configuration = config.xcode.configuration,
): Promise<XcodeProjectDescriptor> {
  const discovered = await discoverContainers(root);
  let container: string | undefined;
  let kind: ProjectKind | undefined;
  if (config.xcode.container) {
    container = safeConfiguredContainer(root, config.xcode.container);
    const extension = extname(container);
    kind = extension === ".xcworkspace" ? "workspace" : extension === ".xcodeproj" ? "project" : basename(container) === "Package.swift" ? "swift-package" : undefined;
    if (!kind) throw new SafetyKernelError(`Unsupported configured Xcode container: ${container}`);
    try {
      await stat(container);
    } catch {
      throw new SafetyKernelError(`Configured Xcode container does not exist: ${container}`);
    }
  } else if (discovered.workspaces.length === 1) {
    [container] = discovered.workspaces;
    kind = "workspace";
  } else if (discovered.workspaces.length > 1) {
    throw new SafetyKernelError(`Multiple Xcode workspaces found: ${discovered.workspaces.join(", ")}`);
  } else if (discovered.projects.length === 1) {
    [container] = discovered.projects;
    kind = "project";
  } else if (discovered.projects.length > 1) {
    throw new SafetyKernelError(`Multiple Xcode projects found: ${discovered.projects.join(", ")}`);
  } else if (discovered.packages.length === 1) {
    [container] = discovered.packages;
    kind = "swift-package";
  }
  if (!container || !kind) throw new SafetyKernelError("No unique Xcode workspace, project, or Swift package was discovered");

  if (kind === "swift-package") {
    const result = await probe.run("swift", ["package", "describe", "--type", "json"], root);
    if (result.code !== 0) throw new SafetyKernelError(`Swift package discovery failed: ${result.stderr.trim()}`);
    let name = "Package";
    try {
      name = (JSON.parse(result.stdout) as { name?: string }).name ?? name;
    } catch {
      throw new SafetyKernelError("swift package describe returned invalid JSON");
    }
    return { platform: config.xcode.platform, kind, root, container, containerName: basename(container), scheme: config.xcode.scheme ?? name, schemes: [name] };
  }

  const schemes = await xcodeSchemes(container, kind, root, probe);
  const scheme = selectScheme(schemes, config.xcode.scheme);
  const settings = await buildSettings(container, kind, scheme, configuration, root, probe);
  return {
    platform: config.xcode.platform,
    kind,
    root,
    container,
    containerName: basename(container),
    scheme,
    schemes,
    ...((config.xcode.platform === "macos" ? settings.MACOSX_DEPLOYMENT_TARGET : settings.IPHONEOS_DEPLOYMENT_TARGET) ? { deploymentTarget: config.xcode.platform === "macos" ? settings.MACOSX_DEPLOYMENT_TARGET : settings.IPHONEOS_DEPLOYMENT_TARGET } : {}),
    ...(settings.CODE_SIGN_ENTITLEMENTS ? { entitlementsPath: settings.CODE_SIGN_ENTITLEMENTS } : {}),
    ...(config.xcode.platform === "macos" ? { hardenedRuntime: settings.ENABLE_HARDENED_RUNTIME === "YES" } : {}),
    ...(settings.SWIFT_VERSION ? { swiftLanguageVersion: settings.SWIFT_VERSION } : {}),
    ...(settings.PRODUCT_BUNDLE_IDENTIFIER ? { bundleIdentifier: settings.PRODUCT_BUNDLE_IDENTIFIER } : {}),
    ...(settings.MARKETING_VERSION ? { marketingVersion: settings.MARKETING_VERSION } : {}),
    ...(settings.CURRENT_PROJECT_VERSION ? { buildNumber: settings.CURRENT_PROJECT_VERSION } : {}),
  };
}
