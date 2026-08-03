import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { iDevFlowConfig } from "../config/config.ts";
import { assertChangedFilesClaimed, commitChangedFiles } from "../git/changes.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { withFileLock } from "../state/file-lock.ts";

const execFileAsync = promisify(execFile);
async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.stdout.trim();
}

export interface BatchSliceInput { readonly sliceId: string; readonly session: WriterSession }
export interface BatchIntegrationResult { readonly success: boolean; readonly baseCommit: string; readonly integratedCommit?: string; readonly error?: string }

export async function integratePipelineBatch(
  repository: RepositoryDescriptor,
  config: iDevFlowConfig,
  pipelineId: string,
  expectedBase: string,
  sourceBase: string,
  slices: readonly BatchSliceInput[],
): Promise<BatchIntegrationResult> {
  if (!slices.length) throw new SafetyKernelError("Pipeline integration batch cannot be empty");
  const lock = join(repository.primaryRoot, ".idevflow", "state", "locks", "integration.lock");
  return withFileLock(lock, async () => {
    const current = await git(repository.primaryRoot, ["rev-parse", config.integrationBranch]);
    if (current !== expectedBase) return { success: false, baseCommit: expectedBase, error: "integration epoch advanced before batch integration" };
    for (const { session } of slices) {
      if (session.status !== "ready_for_integration" || !session.commit || session.baseCommit !== sourceBase) return { success: false, baseCommit: expectedBase, error: `session ${session.id} is not ready on epoch ${expectedBase}` };
      if (await git(session.worktreePath, ["rev-parse", "HEAD"]) !== session.commit || await git(session.worktreePath, ["status", "--porcelain=v1"])) return { success: false, baseCommit: expectedBase, error: `session ${session.id} source moved or is dirty` };
      assertChangedFilesClaimed(await commitChangedFiles(session.worktreePath, session.commit), session.claims);
    }

    const suffix = randomUUID().slice(0, 8);
    const branch = `idev/epoch-${pipelineId}-${suffix}`;
    const root = join(dirname(repository.primaryRoot), `${basename(repository.primaryRoot)}.idev-epochs`, `${pipelineId}-${suffix}`);
    await mkdir(dirname(root), { recursive: true });
    let preparedCommit: string | undefined;
    try {
      await git(repository.primaryRoot, ["worktree", "add", "-b", branch, root, expectedBase]);
      for (const { session } of slices) await git(root, ["cherry-pick", "--no-gpg-sign", session.commit!]);
      preparedCommit = await git(root, ["rev-parse", "HEAD"]);
    } catch (error) {
      await git(root, ["cherry-pick", "--abort"]).catch(() => undefined);
      return { success: false, baseCommit: expectedBase, error: `batch cherry-pick failed: ${(error as Error).message}` };
    } finally {
      if (!preparedCommit) {
        await git(repository.primaryRoot, ["worktree", "remove", "--force", root]).catch(() => undefined);
        await rm(root, { recursive: true, force: true });
        await git(repository.primaryRoot, ["branch", "-D", branch]).catch(() => undefined);
      }
    }

    let integrationRoot = repository.primaryRoot;
    let temporaryIntegration = false;
    const primaryBranch = await git(repository.primaryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "");
    try {
      if (primaryBranch !== config.integrationBranch) {
        integrationRoot = join(dirname(repository.primaryRoot), `${basename(repository.primaryRoot)}.idev-integration`);
        await git(repository.primaryRoot, ["worktree", "prune"]).catch(() => undefined);
        await rm(integrationRoot, { recursive: true, force: true });
        await git(repository.primaryRoot, ["worktree", "add", integrationRoot, config.integrationBranch]);
        temporaryIntegration = true;
      }
      if (await git(integrationRoot, ["status", "--porcelain=v1"])) throw new SafetyKernelError("Integration worktree is dirty");
      if (await git(integrationRoot, ["rev-parse", "HEAD"]) !== expectedBase) throw new SafetyKernelError("Integration epoch changed during batch preparation");
      await git(integrationRoot, ["merge", "--ff-only", preparedCommit]);
      const integratedCommit = await git(integrationRoot, ["rev-parse", "HEAD"]);
      for (const { session } of slices) await new SessionRegistry(repository).changeStatus(session.id, "integrated", `pipeline ${pipelineId} integrated in batch ${integratedCommit}`, `pipeline:${pipelineId}`);
      return { success: true, baseCommit: expectedBase, integratedCommit };
    } finally {
      if (temporaryIntegration) {
        await git(repository.primaryRoot, ["worktree", "remove", "--force", integrationRoot]).catch(() => undefined);
        await rm(integrationRoot, { recursive: true, force: true });
      }
      await git(repository.primaryRoot, ["worktree", "remove", "--force", root]).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
      await git(repository.primaryRoot, ["branch", "-D", branch]).catch(() => undefined);
      await git(repository.primaryRoot, ["worktree", "prune"]).catch(() => undefined);
    }
  });
}
