import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { iDevFlowConfig } from "../config/config.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";

const execFileAsync = promisify(execFile);

async function git(repository: RepositoryDescriptor, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: repository.primaryRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return result.stdout.trim();
}

export interface BaselineReport {
  readonly ready: boolean;
  readonly head: string | null;
  readonly currentBranch: string | null;
  readonly baseBranch: string;
  readonly baseCommit: string | null;
  readonly clean: boolean;
  readonly localOnlyChanges: readonly string[];
  readonly problems: readonly string[];
}

export async function inspectBaseline(
  repository: RepositoryDescriptor,
  config: iDevFlowConfig,
): Promise<BaselineReport> {
  const problems: string[] = [];
  const head = await git(repository, ["rev-parse", "--verify", "HEAD"]).catch(() => null);
  const currentBranch = await git(repository, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => null);
  const [status, localSettings] = await Promise.all([
    git(repository, ["status", "--porcelain=v1", "--untracked-files=normal", "--", ".", ":(exclude).pi/settings.json"]),
    git(repository, ["status", "--porcelain=v1", "--untracked-files=normal", "--", ".pi/settings.json"]),
  ]);
  const clean = status.length === 0;
  const localOnlyChanges = localSettings ? [".pi/settings.json"] : [];
  let baseCommit: string | null = null;
  const baseRefValid = await git(repository, ["check-ref-format", "--branch", config.baseBranch]).then(() => true).catch(() => false);
  const integrationRefValid = await git(repository, ["check-ref-format", "--branch", config.integrationBranch]).then(() => true).catch(() => false);
  if (!baseRefValid) problems.push(`Base branch name ${config.baseBranch} is invalid`);
  if (!integrationRefValid) problems.push(`Integration branch name ${config.integrationBranch} is invalid`);
  if (baseRefValid) {
    try {
      baseCommit = await git(repository, ["rev-parse", "--verify", config.baseBranch]);
    } catch {
      problems.push(`Base branch ${config.baseBranch} does not exist`);
    }
  }
  if (!head) problems.push("Repository has no committed HEAD baseline");
  if (!clean) problems.push("Primary worktree has uncommitted or untracked changes");
  if (currentBranch !== config.baseBranch && currentBranch !== config.integrationBranch) {
    problems.push(`Current branch ${currentBranch ?? "detached"} is neither base nor integration branch`);
  }
  return {
    ready: problems.length === 0,
    head,
    currentBranch,
    baseBranch: config.baseBranch,
    baseCommit,
    clean,
    localOnlyChanges,
    problems,
  };
}

export async function requireBaseline(
  repository: RepositoryDescriptor,
  config: iDevFlowConfig,
): Promise<BaselineReport> {
  const report = await inspectBaseline(repository, config);
  if (!report.ready) throw new SafetyKernelError(`Repository baseline is not ready: ${report.problems.join("; ")}`);
  return report;
}
