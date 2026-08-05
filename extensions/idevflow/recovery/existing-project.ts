import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryDescriptor } from "../repository/discovery.ts";

const ADOPTION_FILE = "existing-project-adoption.json";

export interface ExistingProjectAudit {
  readonly kind: "existing_project_audit";
  readonly repository: { readonly branch: string | null; readonly head: string | null; readonly clean: boolean };
  readonly signals: readonly string[];
  readonly topLevelDirectories: readonly string[];
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

export async function hasExistingAppleProject(root: string): Promise<boolean> {
  return (await signals(await readdir(root, { withFileTypes: true }))).length > 0;
}

export async function inspectExistingProject(repository: RepositoryDescriptor): Promise<ExistingProjectAudit> {
  const entries = await readdir(repository.primaryRoot, { withFileTypes: true });
  const detected = signals(entries);
  return {
    kind: "existing_project_audit",
    repository: { branch: repository.branch, head: repository.head, clean: repository.clean },
    signals: detected,
    topLevelDirectories: entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort(),
    recommendations: [
      "Review the current product, architecture, tests, CI, and release risks without changing source.",
      "Do not treat existing code as iDevFlow verification, review, or release evidence.",
      "After founder acknowledgement, define the current product and plan only the next change.",
    ],
  };
}

function adoptionPath(root: string): string { return join(root, ".idevflow", ADOPTION_FILE); }

export async function isExistingProjectAdopted(root: string): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(adoptionPath(root), "utf8")) as { adopted?: boolean };
    return value.adopted === true;
  } catch { return false; }
}

export async function adoptExistingProject(root: string, actor: string): Promise<void> {
  const directory = join(root, ".idevflow");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = adoptionPath(root);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ adopted: true, adoptedAt: new Date().toISOString(), actor }), { mode: 0o600 });
  await rename(temporary, path);
  await access(path);
}
