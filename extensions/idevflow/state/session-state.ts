import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Stage } from "../lifecycle/contracts.ts";

export const SESSION_ENTRY_TYPE = "idev-session-state";
export const SESSION_STATE_VERSION = 1;

export interface SessionState {
  readonly schemaVersion: typeof SESSION_STATE_VERSION;
  readonly stage?: Stage;
  readonly request?: string;
  readonly startedAt?: string;
}

export function emptySessionState(): SessionState {
  return { schemaVersion: SESSION_STATE_VERSION };
}

export function restoreSessionState(ctx: ExtensionContext): SessionState {
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== SESSION_ENTRY_TYPE) continue;
    const candidate = entry.data as Partial<SessionState> | undefined;
    if (candidate?.schemaVersion === SESSION_STATE_VERSION) {
      return candidate as SessionState;
    }
  }
  return emptySessionState();
}

export function persistSessionState(pi: ExtensionAPI, state: SessionState): void {
  pi.appendEntry(SESSION_ENTRY_TYPE, state);
}
