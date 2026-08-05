import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { BlockerStore } from "../blockers/store.ts";
import { PipelineStore } from "../pipeline/store.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";
import { SimulatorLeaseStore } from "../simulator/leases.ts";
import { forceReleaseFileLock, inspectFileLock } from "../state/file-lock.ts";

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
    if (worktree.branch?.startsWith("refs/heads/idev/") && !registeredPaths.has(worktree.path)) {
      diagnostics.push({ sessionId: `orphan:${worktree.path}`, severity: "warning", message: `Unregistered iDevFlow worktree on ${worktree.branch}`, recommendation: "Inspect and preserve its source; doctor will not delete it automatically" });
    }
  }
  return diagnostics;
}

export async function diagnoseSimulatorLeases(repository: RepositoryDescriptor): Promise<SessionDiagnostic[]> {
  const [leases, sessions] = await Promise.all([new SimulatorLeaseStore(repository).load(), new SessionRegistry(repository).load()]);
  const now = Date.now();
  return Object.values(leases.leases).map((lease) => {
    const owner = sessions.sessions[lease.sessionId];
    const expired = Date.parse(lease.expiresAt) < now;
    const orphaned = !owner || owner.status === "stale" || owner.status === "parked";
    return {
      sessionId: `simulator:${lease.udid}`,
      severity: expired || orphaned ? "warning" : "info",
      message: `${lease.name} leased by ${lease.sessionId}${expired ? " (expired)" : ""}`,
      recommendation: expired ? "Acquire a simulator lease to prune it" : orphaned ? "Use doctor release for the writer session; its simulator lease will be released" : "Continue the owning writer session",
    };
  });
}

export type DoctorLockTarget = "runtime" | "sessions" | "pipeline" | "simulators" | "integration";

function lockPath(repository: RepositoryDescriptor, target: DoctorLockTarget): string {
  const root = join(repository.primaryRoot, ".idevflow", "state");
  return target === "sessions" ? join(root, "sessions", "registry.lock")
    : target === "simulators" ? join(root, "simulators", "leases.lock")
      : target === "integration" ? join(root, "locks", "integration.lock")
        : join(root, "locks", `${target}.lock`);
}

export async function diagnoseLocks(repository: RepositoryDescriptor): Promise<SessionDiagnostic[]> {
  const diagnostics = await Promise.all((["runtime", "sessions", "pipeline", "simulators", "integration"] as const).map(async (target): Promise<SessionDiagnostic | undefined> => {
    const lock = await inspectFileLock(lockPath(repository, target));
    return lock ? { sessionId: `lock:${target}`, severity: "warning", message: `Lock held by pid ${lock.owner?.pid ?? "unknown"} on ${lock.owner?.hostname ?? "unknown"}`, recommendation: "If the owner is gone and normal recovery times out, use doctor release_lock with explicit confirmation" } : undefined;
  }));
  return diagnostics.filter((item): item is SessionDiagnostic => item !== undefined);
}

export async function releaseLock(repository: RepositoryDescriptor, target: DoctorLockTarget): Promise<boolean> {
  return forceReleaseFileLock(lockPath(repository, target));
}

export async function diagnoseBlockers(repository: RepositoryDescriptor): Promise<SessionDiagnostic[]> {
  const blockers = await new BlockerStore(repository).list();
  return blockers.filter((blocker) => blocker.status === "open").map((blocker) => ({
    sessionId: `blocker:${blocker.id}`,
    severity: "warning" as const,
    message: `[${blocker.kind}] ${blocker.title}`,
    recommendation: blocker.nextAction,
  }));
}

export async function diagnosePipelines(repository: RepositoryDescriptor): Promise<SessionDiagnostic[]> {
  const pipelines = await new PipelineStore(repository).list();
  const now = Date.now();
  return pipelines.flatMap((pipeline) => {
    const running = Object.values(pipeline.slices).filter((slice) => slice.status === "working");
    const expiredRuns = running.flatMap((slice) => slice.runs.filter((run) => run.state === "running" && Date.parse(run.leaseExpiresAt) < now));
    const severity: SessionDiagnostic["severity"] = ["blocked", "cancelled", "stale_candidate"].includes(pipeline.status) || expiredRuns.length ? "warning" : "info";
    return [{
      sessionId: `pipeline:${pipeline.id}`,
      severity,
      message: `${pipeline.status}; ${running.length} working, ${expiredRuns.length} expired worker lease(s), ${pipeline.batches.length} integration batch record(s)`,
      recommendation: expiredRuns.length ? "Run idev_pipeline reconcile as the current coordinator; worker source will be preserved" : pipeline.status === "stale_candidate" ? "Inspect integration drift and create or run a new pipeline deliberately" : "Use idev_pipeline status for source-bound slice and batch receipts",
    }];
  });
}

export async function repairExpiredSessions(repository: RepositoryDescriptor, actor: string): Promise<WriterSession[]> {
  const registry = new SessionRegistry(repository);
  await registry.repairPartialTail();
  const state = await registry.load();
  const repaired: WriterSession[] = [];
  const now = Date.now();
  for (const session of Object.values(state.sessions)) {
    if (session.status !== "active" || Date.parse(session.leaseExpiresAt) >= now) continue;
    await new SimulatorLeaseStore(repository).release(session.id);
    const next = await registry.changeStatus(session.id, "stale", "lease expired; source worktree preserved", actor);
    repaired.push(next.sessions[session.id]!);
  }
  return repaired;
}

export async function releaseActiveSession(repository: RepositoryDescriptor, sessionId: string, reason: string, actor: string): Promise<WriterSession> {
  if (!sessionId.trim()) throw new Error("Session ID is required");
  if (!reason.trim()) throw new Error("Release reason is required");
  const registry = new SessionRegistry(repository);
  const session = (await registry.load()).sessions[sessionId];
  if (!session) throw new Error(`Unknown writer session ${sessionId}`);
  if (session.status !== "active") throw new Error(`Session ${sessionId} is ${session.status}, not active`);
  await new SimulatorLeaseStore(repository).release(sessionId);
  const next = await registry.changeStatus(sessionId, "stale", `manually released: ${reason.trim()}; source worktree preserved`, actor);
  return next.sessions[sessionId]!;
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
