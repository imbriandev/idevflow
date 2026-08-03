export const RUNTIME_SCHEMA_VERSION = 1 as const;

export const LIFECYCLE_STATES = [
  "idea",
  "defined",
  "planned",
  "plan_approved",
  "building",
  "built",
  "testing",
  "tested",
  "reviewing",
  "review_passed",
  "candidate_verified",
  "ready_for_ship_approval",
  "promoted",
  "testflight_handoff",
  "blocked",
  "fix_required",
  "manual_decision_required",
  "verification_failed",
  "stale_candidate",
  "conflicted",
  "parked",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export interface RuntimeState {
  readonly schemaVersion: typeof RUNTIME_SCHEMA_VERSION;
  readonly repositoryId: string;
  readonly repositoryFingerprint: string;
  readonly primaryRoot: string;
  readonly revision: number;
  readonly lifecycle: LifecycleState;
  readonly lastEventId: string;
  readonly lastEventHash: string;
  readonly updatedAt: string;
}

export interface RuntimeInitializedPayload {
  readonly repositoryId: string;
  readonly repositoryFingerprint: string;
  readonly primaryRoot: string;
}

export interface LifecycleTransitionedPayload {
  readonly from: LifecycleState;
  readonly to: LifecycleState;
  readonly reason: string;
}

export interface RuntimeEventPayloads {
  readonly runtime_initialized: RuntimeInitializedPayload;
  readonly lifecycle_transitioned: LifecycleTransitionedPayload;
}

export type RuntimeEventKind = keyof RuntimeEventPayloads;

export interface RuntimeEvent<K extends RuntimeEventKind = RuntimeEventKind> {
  readonly schemaVersion: typeof RUNTIME_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly timestamp: string;
  readonly kind: K;
  readonly actor: string;
  readonly previousHash: string | null;
  readonly payload: RuntimeEventPayloads[K];
  readonly hash: string;
}

export interface RuntimeSnapshot {
  readonly schemaVersion: typeof RUNTIME_SCHEMA_VERSION;
  readonly state: RuntimeState;
}
