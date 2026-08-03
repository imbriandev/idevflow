import type { ApplePlatform } from "../config/config.ts";
import type { Risk } from "../lifecycle/contracts.ts";
import type { VerificationProfile } from "../verification/profiles.ts";

export const PIPELINE_SCHEMA_VERSION = 1 as const;

export type PipelineStatus = "approved" | "running" | "paused" | "blocked" | "candidate_ready" | "stale_candidate" | "cancelled";
export type SliceStatus = "pending" | "awaiting_risk_approval" | "dispatched" | "working" | "ready_to_integrate" | "integrated" | "repair_exhausted" | "blocked" | "worker_lost";

export interface PipelineStageReceipts {
  readonly build: { readonly verificationFingerprint: string; readonly postflightFingerprint: string; readonly sourceCommit: string };
  readonly test: { readonly verificationFingerprint: string; readonly sourceFingerprint: string; readonly sourceCommit: string };
  readonly review: { readonly verdict: "pass"; readonly summary: string; readonly residualRisk: string; readonly findings: readonly PipelineFinding[]; readonly sourceCommit: string };
}

export interface PipelineFinding {
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly area: string;
  readonly finding: string;
  readonly evidence: string;
}

export interface WorkerRunRecord {
  readonly runId: string;
  readonly packetId: string;
  readonly packetPath: string;
  readonly packetDigest: string;
  readonly capabilityHash: string;
  readonly state: "reserved" | "running" | "submitted" | "exited" | "lost" | "cancelled";
  readonly attempt: number;
  readonly pid?: number;
  readonly startedAt: string;
  readonly leaseExpiresAt: string;
  readonly finishedAt?: string;
  readonly exitCode?: number | null;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

export interface PipelineSliceState {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly claims: readonly string[];
  readonly risk: Risk;
  readonly dependsOn: readonly string[];
  readonly acceptance: readonly string[];
  readonly verificationProfile: VerificationProfile;
  readonly platforms?: readonly ApplePlatform[];
  readonly status: SliceStatus;
  readonly riskApproved: boolean;
  readonly attempts: number;
  readonly repairCycles: number;
  readonly runs: readonly WorkerRunRecord[];
  readonly sessionId?: string | undefined;
  readonly sourceCommit?: string | undefined;
  readonly sourceFingerprint?: string | undefined;
  readonly receipts?: PipelineStageReceipts | undefined;
  readonly integratedCommit?: string | undefined;
  readonly blockedReason?: string | undefined;
}

export interface CoordinatorLease {
  readonly ownerPiSessionId: string;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly expiresAt: string;
}

export interface IntegrationBatchRecord {
  readonly id: string;
  readonly sliceIds: readonly string[];
  readonly baseCommit: string;
  readonly result: "integrated" | "split" | "conflicted";
  readonly integratedCommit?: string;
  readonly children?: readonly string[];
  readonly recordedAt: string;
}

export interface PipelineCandidateSnapshot {
  readonly commit: string;
  readonly graphFingerprint: string;
  readonly planCommit: string;
  readonly pipelineRevision: number;
  readonly sliceReceiptFingerprint: string;
  readonly combinedVerificationFingerprint: string;
  readonly candidateSessionId: string;
  readonly candidateWorktree: string;
  readonly fingerprint: string;
  readonly createdAt: string;
}

export interface PipelineState {
  readonly schemaVersion: typeof PIPELINE_SCHEMA_VERSION;
  readonly id: string;
  readonly repositoryFingerprint: string;
  readonly graphFingerprint: string;
  readonly planCommit: string;
  readonly integrationEpoch: string;
  readonly status: PipelineStatus;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly coordinator: CoordinatorLease;
  readonly slices: Readonly<Record<string, PipelineSliceState>>;
  readonly batches: readonly IntegrationBatchRecord[];
  readonly candidate?: PipelineCandidateSnapshot;
  readonly statusReason?: string | undefined;
}

export interface PipelineEvent {
  readonly schemaVersion: typeof PIPELINE_SCHEMA_VERSION;
  readonly id: string;
  readonly pipelineId: string;
  readonly revision: number;
  readonly timestamp: string;
  readonly actor: string;
  readonly kind: string;
  readonly previousHash: string | null;
  readonly state: PipelineState;
  readonly hash: string;
}
