import type { Risk, Stage } from "../lifecycle/contracts.ts";

export const SESSION_REGISTRY_SCHEMA_VERSION = 1 as const;
export type WriterStatus = "active" | "parked" | "postflight_passed" | "ready_for_integration" | "stale" | "blocked";

export interface PostflightReceipt {
  readonly evidence: string;
  readonly changedFiles: readonly string[];
  readonly diffHash: string;
  readonly recordedAt: string;
}

export interface WriterSession {
  readonly id: string;
  readonly piSessionId: string;
  readonly stage: Stage;
  readonly task: string;
  readonly risk: Risk;
  readonly status: WriterStatus;
  readonly branch: string;
  readonly worktreePath: string;
  readonly baseCommit: string;
  readonly claims: readonly string[];
  readonly createdAt: string;
  readonly heartbeatAt: string;
  readonly leaseExpiresAt: string;
  readonly postflight?: PostflightReceipt;
  readonly commit?: string;
  readonly statusReason?: string;
}

export function leaseIsValid(session: WriterSession, now = Date.now()): boolean {
  const expires = Date.parse(session.leaseExpiresAt);
  return Number.isFinite(expires) && expires >= now;
}

export interface SessionRegistryState {
  readonly schemaVersion: typeof SESSION_REGISTRY_SCHEMA_VERSION;
  readonly revision: number;
  readonly sessions: Readonly<Record<string, WriterSession>>;
  readonly lastEventHash: string | null;
}

type SessionEventPayload =
  | { readonly kind: "session_started"; readonly session: WriterSession }
  | { readonly kind: "paths_claimed"; readonly sessionId: string; readonly claims: readonly string[] }
  | { readonly kind: "heartbeat"; readonly sessionId: string; readonly heartbeatAt: string; readonly leaseExpiresAt: string }
  | { readonly kind: "postflight_passed"; readonly sessionId: string; readonly receipt: PostflightReceipt }
  | { readonly kind: "session_ready"; readonly sessionId: string; readonly commit: string }
  | { readonly kind: "session_status_changed"; readonly sessionId: string; readonly status: WriterStatus; readonly reason: string };

export type SessionEventKind = SessionEventPayload["kind"];
export type PayloadFor<K extends SessionEventKind> = Extract<SessionEventPayload, { kind: K }>;

export interface SessionEvent<K extends SessionEventKind = SessionEventKind> {
  readonly schemaVersion: typeof SESSION_REGISTRY_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly timestamp: string;
  readonly actor: string;
  readonly previousHash: string | null;
  readonly payload: PayloadFor<K>;
  readonly hash: string;
}
