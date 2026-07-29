import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathIsClaimed } from "./claims.ts";
import { SafetyKernelError } from "../state/errors.ts";

const execFileAsync = promisify(execFile);

async function git(worktree: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: worktree, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.stdout;
}

function nulPaths(value: string): string[] {
  return value.split("\0").filter(Boolean).map((path) => path.replace(/\\/g, "/"));
}

export async function commitChangedFiles(worktree: string, commit: string): Promise<string[]> {
  return nulPaths(await git(worktree, ["diff-tree", "--no-commit-id", "--name-only", "-z", "-r", `${commit}^`, commit])).sort();
}

export async function changedFiles(worktree: string): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    git(worktree, ["diff", "--name-only", "-z", "HEAD"]),
    git(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return [...new Set([...nulPaths(tracked), ...nulPaths(untracked)])].sort();
}

export function assertChangedFilesClaimed(files: readonly string[], claims: readonly string[]): void {
  const outside = files.filter((file) => !pathIsClaimed(file, claims));
  if (outside.length) throw new SafetyKernelError(`Changed files outside claimed paths: ${outside.join(", ")}`);
}

export async function fingerprintChanges(worktree: string, files: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(`${file}\0`);
    const absolute = join(worktree, file);
    try {
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) hash.update(`symlink:${await readlink(absolute)}\0`);
      else if (info.isFile()) hash.update(await readFile(absolute));
      else hash.update(`mode:${info.mode}\0`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") hash.update("deleted\0");
      else throw error;
    }
  }
  return hash.digest("hex");
}

export async function diffCheck(worktree: string): Promise<void> {
  try {
    await execFileAsync("git", ["diff", "--check", "HEAD"], { cwd: worktree, encoding: "utf8" });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new SafetyKernelError(`git diff --check failed${stderr ? `: ${stderr}` : ""}`, { cause: error });
  }
}
