import { discoverConfigMigration } from "../config/config.ts";
import { PipelineStore } from "../pipeline/store.ts";
import { loadCandidate } from "../release/service.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { diagnoseBlockers, diagnoseLocks, diagnosePipelines, diagnoseSessions, diagnoseSimulatorLeases, type SessionDiagnostic } from "./doctor.ts";

export const DIAGNOSTIC_REPORT_SCHEMA_VERSION = 1 as const;

export interface DiagnosticReport {
  readonly schemaVersion: typeof DIAGNOSTIC_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly repository: { readonly fingerprint: string; readonly primaryRoot: string; readonly head: string | null };
  readonly runtime: { readonly lifecycle: string; readonly revision: number } | null;
  readonly configMigration: { readonly needed: boolean; readonly fromVersion: number; readonly toVersion: number };
  readonly sessions: { readonly total: number; readonly active: number; readonly stale: number };
  readonly pipelines: { readonly total: number; readonly running: number; readonly blocked: number; readonly staleCandidate: number };
  readonly candidate: { readonly status: string; readonly commit: string; readonly target: string } | null;
  readonly diagnostics: readonly SessionDiagnostic[];
  readonly health: "ready" | "attention";
}

/** Metadata-only support report. It intentionally excludes task text, source, packets, logs, tokens, and receipts. */
export async function createDiagnosticReport(repository: RepositoryDescriptor): Promise<DiagnosticReport> {
  const [runtime, migration, registry, pipelines, candidate, sessionDiagnostics, simulatorDiagnostics, pipelineDiagnostics, blockerDiagnostics, lockDiagnostics] = await Promise.all([
    new RuntimeStore(repository).status(),
    discoverConfigMigration(repository.primaryRoot),
    new SessionRegistry(repository).load(),
    new PipelineStore(repository).list(),
    loadCandidate(repository),
    diagnoseSessions(repository),
    diagnoseSimulatorLeases(repository),
    diagnosePipelines(repository),
    diagnoseBlockers(repository),
    diagnoseLocks(repository),
  ]);
  const sessions = Object.values(registry.sessions);
  const diagnostics = [...sessionDiagnostics, ...simulatorDiagnostics, ...pipelineDiagnostics, ...blockerDiagnostics, ...lockDiagnostics];
  const blocked = pipelines.filter((pipeline) => pipeline.status === "blocked" || pipeline.status === "cancelled").length;
  const staleCandidate = pipelines.filter((pipeline) => pipeline.status === "stale_candidate").length;
  return {
    schemaVersion: DIAGNOSTIC_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repository: { fingerprint: repository.fingerprint, primaryRoot: repository.primaryRoot, head: repository.head },
    runtime: runtime ? { lifecycle: runtime.lifecycle, revision: runtime.revision } : null,
    configMigration: { needed: migration.needed, fromVersion: migration.fromVersion, toVersion: migration.toVersion },
    sessions: { total: sessions.length, active: sessions.filter((session) => session.status === "active").length, stale: sessions.filter((session) => session.status === "stale").length },
    pipelines: { total: pipelines.length, running: pipelines.filter((pipeline) => pipeline.status === "running").length, blocked, staleCandidate },
    candidate: candidate ? { status: candidate.status, commit: candidate.commit, target: candidate.target } : null,
    diagnostics,
    health: diagnostics.some((diagnostic) => diagnostic.severity !== "info") || migration.needed || blocked > 0 || staleCandidate > 0 ? "attention" : "ready",
  };
}
