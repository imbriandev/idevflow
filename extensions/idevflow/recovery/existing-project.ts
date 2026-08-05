import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../config/config.ts";
import { inspectBaseline, type BaselineReport } from "../git/baseline.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { discoverXcodeProject } from "../xcode/discovery.ts";

const ADOPTION_FILE = "existing-project-adoption.json";
const IGNORED_DIRECTORIES = new Set([".git", ".idevflow", "DerivedData", ".build", "Pods", "Carthage", "node_modules"]);

export const EXISTING_PROJECT_ADOPTION_SCHEMA_VERSION = 1 as const;

export interface ExistingProjectAdoption {
  readonly schemaVersion: typeof EXISTING_PROJECT_ADOPTION_SCHEMA_VERSION;
  readonly adoptedAt: string;
  readonly actor: string;
  readonly repository: { readonly fingerprint: string; readonly head: string | null };
  readonly audit: ExistingProjectAudit;
}

export interface ExistingProjectAudit {
  readonly kind: "existing_project_audit";
  readonly repository: { readonly branch: string | null; readonly head: string | null; readonly clean: boolean; readonly baseline: BaselineReport };
  readonly signals: readonly string[];
  readonly topLevelDirectories: readonly string[];
  readonly testDirectories: readonly string[];
  readonly automation: readonly string[];
  readonly releaseInputs: readonly string[];
  readonly xcode?: { readonly kind: string; readonly container: string; readonly scheme: string; readonly bundleId?: string; readonly version?: string; readonly build?: string; readonly entitlements?: string };
  readonly xcodeIssue?: string;
  readonly recommendations: readonly string[];
}

function signals(entries: readonly { name: string; isDirectory(): boolean; isFile(): boolean }[]): string[] {
  return entries.flatMap((entry) => {
    if (entry.name.endsWith(".xcworkspace") && entry.isDirectory()) return ["Xcode workspace"];
    if (entry.name.endsWith(".xcodeproj") && entry.isDirectory()) return ["Xcode project"];
    if (entry.name === "Package.swift" && entry.isFile()) return ["Swift package"];
    if (entry.name === "Sources" && entry.isDirectory()) return ["source directory"];
    if ((entry.name === "Tests" || entry.name.endsWith("Tests")) && entry.isDirectory()) return ["test directory"];
    return [];
  });
}

async function releaseMarkers(root: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.name === "PrivacyInfo.xcprivacy" || entry.name.endsWith(".storekit")) found.push(entry.name);
    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) found.push(...await releaseMarkers(join(root, entry.name), depth + 1));
  }
  return found.sort();
}

export async function hasExistingAppleProject(root: string): Promise<boolean> {
  return (await signals(await readdir(root, { withFileTypes: true }))).length > 0;
}

export async function inspectExistingProject(repository: RepositoryDescriptor): Promise<ExistingProjectAudit> {
  const [entries, config] = await Promise.all([readdir(repository.primaryRoot, { withFileTypes: true }), loadConfig(repository.primaryRoot)]);
  const [baseline, markers, githubWorkflows] = await Promise.all([
    inspectBaseline(repository, config),
    releaseMarkers(repository.primaryRoot),
    readdir(join(repository.primaryRoot, ".github", "workflows")).then((items) => items.filter((item) => /\.ya?ml$/i.test(item)).map((item) => `.github/workflows/${item}`)).catch(() => []),
  ]);
  const detected = signals(entries);
  const names = new Set(entries.map((entry) => entry.name));
  const descriptor = await discoverXcodeProject(repository.primaryRoot, config).catch((error) => error as Error);
  const xcode = descriptor instanceof Error || descriptor.kind === "swift-package" ? undefined : {
    kind: descriptor.kind, container: descriptor.containerName, scheme: descriptor.scheme,
    ...(descriptor.bundleIdentifier ? { bundleId: descriptor.bundleIdentifier } : {}),
    ...(descriptor.marketingVersion ? { version: descriptor.marketingVersion } : {}),
    ...(descriptor.buildNumber ? { build: descriptor.buildNumber } : {}),
    ...(descriptor.entitlementsPath ? { entitlements: descriptor.entitlementsPath } : {}),
  };
  return {
    kind: "existing_project_audit",
    repository: { branch: repository.branch, head: repository.head, clean: repository.clean, baseline },
    signals: detected,
    topLevelDirectories: entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort(),
    testDirectories: entries.filter((entry) => entry.isDirectory() && (entry.name === "Tests" || entry.name.endsWith("Tests"))).map((entry) => entry.name).sort(),
    automation: [...githubWorkflows, ...(names.has(".gitlab-ci.yml") ? [".gitlab-ci.yml"] : []), ...(names.has("fastlane") ? ["fastlane"] : [])],
    releaseInputs: [...(names.has("PrivacyInfo.xcprivacy") ? ["PrivacyInfo.xcprivacy"] : []), ...markers, ...(names.has("fastlane") ? ["fastlane"] : [])],
    ...(xcode ? { xcode } : descriptor instanceof Error ? { xcodeIssue: descriptor.message } : {}),
    recommendations: [
      "Use this snapshot to define the current product state and next founder outcome.",
      "Classify failing tests, Apple setup, and device/sandbox work as repair or external validation; do not treat them as definition evidence.",
      "Do not treat existing code as iDevFlow verification, review, or release evidence.",
    ],
  };
}

function adoptionPath(root: string): string { return join(root, ".idevflow", ADOPTION_FILE); }

export async function loadExistingProjectAdoption(root: string): Promise<ExistingProjectAdoption | undefined> {
  try {
    const value = JSON.parse(await readFile(adoptionPath(root), "utf8")) as ExistingProjectAdoption;
    if (value.schemaVersion !== EXISTING_PROJECT_ADOPTION_SCHEMA_VERSION || !value.actor || !value.adoptedAt || !value.repository?.fingerprint || !value.audit) return undefined;
    return value;
  } catch { return undefined; }
}

export async function isExistingProjectAdopted(repository: RepositoryDescriptor): Promise<boolean> {
  const adoption = await loadExistingProjectAdoption(repository.primaryRoot);
  return adoption?.repository.fingerprint === repository.fingerprint && adoption.repository.head === repository.head;
}

export async function adoptExistingProject(repository: RepositoryDescriptor, actor: string): Promise<ExistingProjectAdoption> {
  await mkdir(join(repository.primaryRoot, ".idevflow"), { recursive: true, mode: 0o700 });
  const adoption: ExistingProjectAdoption = {
    schemaVersion: EXISTING_PROJECT_ADOPTION_SCHEMA_VERSION,
    adoptedAt: new Date().toISOString(),
    actor,
    repository: { fingerprint: repository.fingerprint, head: repository.head },
    audit: await inspectExistingProject(repository),
  };
  await writeFileAtomically(adoptionPath(repository.primaryRoot), `${JSON.stringify(adoption, null, 2)}\n`);
  return adoption;
}
