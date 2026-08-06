import { discoverConfigMigration } from "../config/config.ts";
import { loadCandidate } from "../release/service.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { diagnoseBlockers, diagnoseLocks, diagnoseSessions, diagnoseSimulatorLeases, type SessionDiagnostic } from "./doctor.ts";

export const DIAGNOSTIC_REPORT_SCHEMA_VERSION = 1 as const;

export interface DiagnosticReport {
  readonly schemaVersion: typeof DIAGNOSTIC_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly repository: { readonly fingerprint: string; readonly primaryRoot: string; readonly head: string | null };
  readonly runtime: { readonly lifecycle: string; readonly revision: number } | null;
  readonly configMigration: { readonly needed: boolean; readonly fromVersion: number; readonly toVersion: number };
  readonly sessions: { readonly total: number; readonly active: number; readonly stale: number };
  readonly candidate: { readonly status: string; readonly commit: string; readonly target: string } | null;
  readonly diagnostics: readonly SessionDiagnostic[];
  readonly health: "ready" | "attention";
}

/** Metadata-only support report. It intentionally excludes task text, source, packets, logs, tokens, and receipts. */
export async function createDiagnosticReport(repository: RepositoryDescriptor): Promise<DiagnosticReport> {
  const [runtime, migration, registry, candidate, sessionDiagnostics, simulatorDiagnostics, blockerDiagnostics, lockDiagnostics] = await Promise.all([
    new RuntimeStore(repository).status(),
    discoverConfigMigration(repository.primaryRoot),
    new SessionRegistry(repository).load(),
    loadCandidate(repository),
    diagnoseSessions(repository),
    diagnoseSimulatorLeases(repository),
    diagnoseBlockers(repository),
    diagnoseLocks(repository),
  ]);
  const sessions = Object.values(registry.sessions);
  const diagnostics = [...sessionDiagnostics, ...simulatorDiagnostics, ...blockerDiagnostics, ...lockDiagnostics];
  return {
    schemaVersion: DIAGNOSTIC_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repository: { fingerprint: repository.fingerprint, primaryRoot: repository.primaryRoot, head: repository.head },
    runtime: runtime ? { lifecycle: runtime.lifecycle, revision: runtime.revision } : null,
    configMigration: { needed: migration.needed, fromVersion: migration.fromVersion, toVersion: migration.toVersion },
    sessions: { total: sessions.length, active: sessions.filter((session) => session.status === "active").length, stale: sessions.filter((session) => session.status === "stale").length },
    candidate: candidate ? { status: candidate.status, commit: candidate.commit, target: candidate.target } : null,
    diagnostics,
    health: diagnostics.some((diagnostic) => diagnostic.severity !== "info") || migration.needed ? "attention" : "ready",
  };
}
