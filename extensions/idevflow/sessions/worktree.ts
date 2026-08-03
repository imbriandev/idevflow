import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { iDevFlowConfig } from "../config/config.ts";
import type { Risk, Stage } from "../lifecycle/contracts.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import type { WriterSession } from "./types.ts";

const execFileAsync = promisify(execFile);

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "task";
}

export async function createWriterWorktree(input: {
  readonly repository: RepositoryDescriptor;
  readonly config: iDevFlowConfig;
  readonly piSessionId: string;
  readonly stage: Stage;
  readonly task: string;
  readonly risk: Risk;
}): Promise<WriterSession> {
  const id = randomUUID();
  const shortId = id.slice(0, 8);
  const branch = `idev/${slugify(input.task)}-${shortId}`;
  const defaultParent = join(dirname(input.repository.primaryRoot), `${basename(input.repository.primaryRoot)}.idev-worktrees`);
  const parent = input.config.worktreeDirectory
    ? (isAbsolute(input.config.worktreeDirectory) ? input.config.worktreeDirectory : resolve(input.repository.primaryRoot, input.config.worktreeDirectory))
    : defaultParent;
  const worktreePath = join(parent, `${slugify(input.task)}-${shortId}`);
  await mkdir(parent, { recursive: true });

  const integrationExists = await execFileAsync("git", ["rev-parse", "--verify", input.config.integrationBranch], {
    cwd: input.repository.primaryRoot,
    encoding: "utf8",
  }).then(() => true).catch(() => false);
  const sourceBranch = integrationExists ? input.config.integrationBranch : input.config.baseBranch;
  const baseCommitResult = await execFileAsync("git", ["rev-parse", "--verify", sourceBranch], {
    cwd: input.repository.primaryRoot,
    encoding: "utf8",
  });
  const baseCommit = baseCommitResult.stdout.trim();
  try {
    await execFileAsync("git", ["worktree", "add", "-b", branch, worktreePath, baseCommit], {
      cwd: input.repository.primaryRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    await rm(worktreePath, { recursive: true, force: true });
    throw new SafetyKernelError(`Failed to create writer worktree: ${(error as Error).message}`, { cause: error });
  }

  const now = new Date();
  return {
    id,
    piSessionId: input.piSessionId,
    stage: input.stage,
    task: input.task,
    risk: input.risk,
    status: "active",
    branch,
    worktreePath,
    baseCommit,
    claims: [],
    createdAt: now.toISOString(),
    heartbeatAt: now.toISOString(),
    leaseExpiresAt: new Date(now.getTime() + input.config.leaseSeconds * 1000).toISOString(),
  };
}
