import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";

const execFileAsync = promisify(execFile);

export interface SessionDiagnostic {
  readonly sessionId: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly recommendation: string;
}

export async function diagnoseSessions(repository: RepositoryDescriptor): Promise<SessionDiagnostic[]> {
  const state = await new SessionRegistry(repository).load();
  const diagnostics: SessionDiagnostic[] = [];
  const now = Date.now();
  for (const session of Object.values(state.sessions)) {
    let worktreeExists = true;
    try {
      await access(session.worktreePath);
    } catch {
      worktreeExists = false;
    }
    if (!worktreeExists) {
      diagnostics.push({ sessionId: session.id, severity: "error", message: `Registered worktree is missing: ${session.worktreePath}`, recommendation: "Inspect the preserved branch and repair registry state manually" });
      continue;
    }
    const expired = Date.parse(session.leaseExpiresAt) < now;
    if (session.status === "active" && expired) {
      diagnostics.push({ sessionId: session.id, severity: "warning", message: "Writer lease expired", recommendation: "Run doctor repair to mark stale, then inspect the preserved worktree" });
    } else if (session.status === "stale") {
      diagnostics.push({ sessionId: session.id, severity: "warning", message: `Stale session: ${session.statusReason ?? "unknown reason"}`, recommendation: "Inspect, resume deliberately, or preserve the branch for manual recovery" });
    } else {
      diagnostics.push({
        sessionId: session.id,
        severity: "info",
        message: `${session.status} on ${session.branch}`,
        recommendation: session.status === "ready_for_integration"
          ? "Run controlled lifecycle integration"
          : session.status === "integrated"
            ? "Retain as source-bound lifecycle evidence"
            : "Continue the owning Pi session",
      });
    }
  }
  const registeredPaths = new Set(Object.values(state.sessions).map((session) => session.worktreePath));
  for (const worktree of await registeredWorktrees(repository)) {
    if (worktree.branch?.startsWith("refs/heads/pi-ios/") && !registeredPaths.has(worktree.path)) {
      diagnostics.push({ sessionId: `orphan:${worktree.path}`, severity: "warning", message: `Unregistered Pi iOS worktree on ${worktree.branch}`, recommendation: "Inspect and preserve its source; doctor will not delete it automatically" });
    }
  }
  return diagnostics;
}

export async function repairExpiredSessions(repository: RepositoryDescriptor, actor: string): Promise<WriterSession[]> {
  const registry = new SessionRegistry(repository);
  const state = await registry.load();
  const repaired: WriterSession[] = [];
  const now = Date.now();
  for (const session of Object.values(state.sessions)) {
    if (session.status !== "active" || Date.parse(session.leaseExpiresAt) >= now) continue;
    const next = await registry.changeStatus(session.id, "stale", "lease expired; source worktree preserved", actor);
    repaired.push(next.sessions[session.id]!);
  }
  return repaired;
}

export interface WorktreeInfo {
  readonly path: string;
  readonly branch: string | null;
}

export async function registeredWorktrees(repository: RepositoryDescriptor): Promise<WorktreeInfo[]> {
  const result = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: repository.primaryRoot, encoding: "utf8" });
  return result.stdout.trim().split(/\n\n+/).filter(Boolean).map((block) => {
    const lines = block.split("\n");
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (!path) throw new Error(`Malformed git worktree record: ${block}`);
    return { path, branch: lines.find((line) => line.startsWith("branch "))?.slice("branch ".length) ?? null };
  });
}
