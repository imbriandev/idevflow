import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";

export function normalizeClaim(input: string, worktreeRoot: string): string {
  if (!input.trim()) throw new SafetyKernelError("Claim path cannot be empty");
  const absolute = isAbsolute(input) ? resolve(input) : resolve(worktreeRoot, input);
  const normalized = relative(worktreeRoot, absolute);
  if (normalized === "" || normalized === ".") throw new SafetyKernelError("Claiming the entire repository is forbidden");
  if (normalized === ".." || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) {
    throw new SafetyKernelError(`Claim path escapes the worktree: ${input}`);
  }
  const projectPath = normalized.split(sep).join("/").replace(/^\.\//, "").replace(/\/$/, "");
  if ([".git", ".idevflow", ".pi"].includes(projectPath.split("/")[0]!)) throw new SafetyKernelError(`Claim path targets protected control state: ${input}`);
  return projectPath;
}

export async function resolveSafeWritePath(input: string, worktreeRoot: string): Promise<{ absolute: string; projectPath: string }> {
  const absolute = isAbsolute(input) ? resolve(input) : resolve(worktreeRoot, input);
  const projectPath = relative(worktreeRoot, absolute);
  if (projectPath === "" || projectPath === ".." || projectPath.startsWith(`..${sep}`) || isAbsolute(projectPath)) {
    throw new SafetyKernelError(`Write path escapes the worktree: ${input}`);
  }
  const canonicalRoot = await realpath(worktreeRoot);
  let cursor = canonicalRoot;
  for (const segment of projectPath.split(sep)) {
    cursor = resolve(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) {
        throw new SafetyKernelError(`Write path crosses a symbolic link: ${input}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return { absolute, projectPath: projectPath.split(sep).join("/") };
}

export function claimsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function pathIsClaimed(path: string, claims: readonly string[]): boolean {
  return claims.some((claim) => path === claim || path.startsWith(`${claim}/`));
}

export function assertNoClaimConflicts(
  requested: readonly string[],
  sessions: readonly { readonly id: string; readonly status: string; readonly claims: readonly string[] }[],
  requestingSessionId: string,
): void {
  const owningStatuses = new Set(["active", "postflight_passed", "ready_for_integration"]);
  for (const session of sessions) {
    if (session.id === requestingSessionId || !owningStatuses.has(session.status)) continue;
    for (const request of requested) {
      const conflict = session.claims.find((claim) => claimsOverlap(request, claim));
      if (conflict) throw new SafetyKernelError(`Claim ${request} overlaps ${conflict} owned by session ${session.id}`);
    }
  }
}
