import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { CanopyConfig } from "../config/config.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { withFileLock } from "../state/file-lock.ts";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.stdout.trim();
}

export interface IntegrationReceipt {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly sourceCommit: string;
  readonly previousCommit: string;
  readonly integratedCommit: string;
  readonly branch: string;
  readonly integratedAt: string;
}

export async function integrationHead(repository: RepositoryDescriptor, config: CanopyConfig): Promise<string> {
  return git(repository.primaryRoot, ["rev-parse", "--verify", config.integrationBranch]).catch(async () => git(repository.primaryRoot, ["rev-parse", "--verify", config.baseBranch]));
}

export async function integrateSession(repository: RepositoryDescriptor, config: CanopyConfig, session: WriterSession): Promise<IntegrationReceipt> {
  if (session.status !== "ready_for_integration" || !session.commit) throw new SafetyKernelError("Controlled integration requires a ready writer session");
  const actor = `pi-session:${session.piSessionId}`;
  const lockPath = join(repository.primaryRoot, ".canopy", "state", "locks", "integration.lock");
  return withFileLock(lockPath, async () => {
    const sourceHead = await git(session.worktreePath, ["rev-parse", "HEAD"]);
    if (sourceHead !== session.commit) throw new SafetyKernelError("Writer branch moved after finish");
    if (await git(session.worktreePath, ["status", "--porcelain=v1"])) throw new SafetyKernelError("Writer worktree is dirty before integration");
    const branchExists = await git(repository.primaryRoot, ["show-ref", "--verify", `refs/heads/${config.integrationBranch}`]).then(() => true).catch(() => false);
    if (!branchExists) await git(repository.primaryRoot, ["branch", config.integrationBranch, config.baseBranch]);
    const previousCommit = await git(repository.primaryRoot, ["rev-parse", config.integrationBranch]);
    if (previousCommit !== session.baseCommit) throw new SafetyKernelError("Integration branch advanced after this writer session started; preserve the branch for Milestone-6 reconciliation");

    const currentBranch = await git(repository.primaryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "");
    let worktree = repository.primaryRoot;
    let temporary = false;
    if (currentBranch !== config.integrationBranch) {
      const parent = join(dirname(repository.primaryRoot), `${basename(repository.primaryRoot)}.canopy-integration`);
      await git(repository.primaryRoot, ["worktree", "prune"]).catch(() => undefined);
      await rm(parent, { recursive: true, force: true });
      await mkdir(dirname(parent), { recursive: true });
      await git(repository.primaryRoot, ["worktree", "add", parent, config.integrationBranch]);
      worktree = parent;
      temporary = true;
    }
    try {
      if (await git(worktree, ["status", "--porcelain=v1"])) throw new SafetyKernelError("Integration worktree is dirty");
      await git(worktree, ["merge", "--ff-only", session.commit]);
      const integratedCommit = await git(worktree, ["rev-parse", "HEAD"]);
      if (integratedCommit !== session.commit) throw new SafetyKernelError("Fast-forward integration did not land the exact writer commit");
      const receipt: IntegrationReceipt = { schemaVersion: 1, sessionId: session.id, sourceCommit: session.commit, previousCommit, integratedCommit, branch: config.integrationBranch, integratedAt: new Date().toISOString() };
      await mkdir(join(repository.primaryRoot, ".canopy", "receipts", "integration"), { recursive: true, mode: 0o700 });
      await writeFileAtomically(join(repository.primaryRoot, ".canopy", "receipts", "integration", `${session.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
      await new SessionRegistry(repository).changeStatus(session.id, "integrated", `integrated as ${integratedCommit}`, actor);
      return receipt;
    } finally {
      if (temporary) {
        await git(repository.primaryRoot, ["worktree", "remove", "--force", worktree]).catch(() => undefined);
        await rm(worktree, { recursive: true, force: true });
        await git(repository.primaryRoot, ["worktree", "prune"]).catch(() => undefined);
      }
    }
  });
}
