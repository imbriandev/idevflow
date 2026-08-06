import type { Stage } from "../lifecycle/contracts.ts";

export interface SessionState {
  readonly schemaVersion: 1;
  readonly stage?: Stage;
  readonly request?: string;
  readonly startedAt?: string;
}

export function emptySessionState(): SessionState {
  return { schemaVersion: 1 };
}
