import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { RepositoryDiscoveryError } from "../state/errors.ts";

const execFileAsync = promisify(execFile);

export interface RepositoryDescriptor {
  readonly worktreeRoot: string;
  readonly primaryRoot: string;
  readonly commonGitDirectory: string;
  readonly fingerprint: string;
  readonly head: string | null;
  readonly branch: string | null;
  readonly clean: boolean;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", [...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim();
  } catch (error) {
    throw new RepositoryDiscoveryError(`Git repository discovery failed in ${cwd}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

async function optionalGit(cwd: string, args: readonly string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

export async function discoverRepository(cwd: string): Promise<RepositoryDescriptor> {
  const worktreeRoot = await realpath(await git(cwd, ["rev-parse", "--show-toplevel"]));
  const commonRaw = await git(worktreeRoot, ["rev-parse", "--git-common-dir"]);
  const commonGitDirectory = await realpath(isAbsolute(commonRaw) ? commonRaw : resolve(worktreeRoot, commonRaw));
  const primaryRoot = dirname(commonGitDirectory);
  const head = await optionalGit(worktreeRoot, ["rev-parse", "--verify", "HEAD"]);
  const branchValue = await optionalGit(worktreeRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const status = await git(worktreeRoot, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  const fingerprint = createHash("sha256").update(commonGitDirectory).digest("hex");

  return {
    worktreeRoot,
    primaryRoot,
    commonGitDirectory,
    fingerprint,
    head,
    branch: branchValue || null,
    clean: status.length === 0,
  };
}
