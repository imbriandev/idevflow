import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, truncate } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { assertNoClaimConflicts } from "../git/claims.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { JournalCorruptionError, SafetyKernelError } from "../state/errors.ts";
import { withFileLock } from "../state/file-lock.ts";
import {
  SESSION_REGISTRY_SCHEMA_VERSION,
  type PayloadFor,
  type PostflightReceipt,
  type SessionEvent,
  type SessionEventKind,
  type SessionRegistryState,
  type WriterSession,
  type WriterStatus,
} from "./types.ts";

interface UnsignedSessionEvent<K extends SessionEventKind> extends Omit<SessionEvent<K>, "hash"> {}

function hashEvent(event: UnsignedSessionEvent<SessionEventKind>): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

function parseEvents(content: string): { events: SessionEvent[]; validBytes: number; partial: boolean } {
  if (!content) return { events: [], validBytes: 0, partial: false };
  const complete = content.endsWith("\n");
  const parts = content.split("\n");
  parts.pop();
  const lines = parts.filter(Boolean);
  const events = lines.map((line, index) => {
    let event: SessionEvent;
    try {
      event = JSON.parse(line) as SessionEvent;
    } catch (error) {
      throw new JournalCorruptionError(`Invalid session journal JSON at line ${index + 1}`, { cause: error });
    }
    if (event.schemaVersion !== SESSION_REGISTRY_SCHEMA_VERSION || typeof event.hash !== "string") {
      throw new JournalCorruptionError(`Invalid session event envelope at line ${index + 1}`);
    }
    const { hash, ...unsigned } = event;
    if (hashEvent(unsigned as UnsignedSessionEvent<SessionEventKind>) !== hash) {
      throw new JournalCorruptionError(`Session event hash mismatch at line ${index + 1}`);
    }
    return event;
  });
  const valid = lines.length ? `${lines.join("\n")}\n` : "";
  return { events, validBytes: Buffer.byteLength(valid), partial: !complete };
}

function emptyState(): SessionRegistryState {
  return { schemaVersion: SESSION_REGISTRY_SCHEMA_VERSION, revision: 0, sessions: {}, lastEventHash: null };
}

function reduce(events: readonly SessionEvent[]): SessionRegistryState {
  let state = emptyState();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.revision !== index + 1 || event.previousHash !== state.lastEventHash) {
      throw new JournalCorruptionError(`Broken session journal chain at revision ${event.revision}`);
    }
    const sessions = { ...state.sessions };
    const payload = event.payload;
    if (payload.kind === "session_started") {
      if (sessions[payload.session.id]) throw new JournalCorruptionError(`Duplicate session ${payload.session.id}`);
      sessions[payload.session.id] = payload.session;
    } else {
      const current = sessions[payload.sessionId];
      if (!current) throw new JournalCorruptionError(`Unknown session ${payload.sessionId}`);
      switch (payload.kind) {
        case "paths_claimed":
          sessions[current.id] = { ...current, claims: [...new Set([...current.claims, ...payload.claims])] };
          break;
        case "heartbeat":
          sessions[current.id] = { ...current, heartbeatAt: payload.heartbeatAt, leaseExpiresAt: payload.leaseExpiresAt };
          break;
        case "postflight_passed":
          sessions[current.id] = { ...current, status: "postflight_passed", postflight: payload.receipt };
          break;
        case "session_ready":
          sessions[current.id] = { ...current, status: "ready_for_integration", commit: payload.commit };
          break;
        case "session_status_changed":
          sessions[current.id] = { ...current, status: payload.status, statusReason: payload.reason };
          break;
      }
    }
    state = { ...state, revision: event.revision, sessions, lastEventHash: event.hash };
  }
  return state;
}

export class SessionRegistry {
  readonly directory: string;
  readonly journalPath: string;
  readonly snapshotPath: string;
  readonly lockPath: string;

  constructor(readonly repository: RepositoryDescriptor) {
    this.directory = join(repository.primaryRoot, ".pi-ios", "state", "sessions");
    this.journalPath = join(this.directory, "events.jsonl");
    this.snapshotPath = join(this.directory, "snapshot.json");
    this.lockPath = join(this.directory, "registry.lock");
  }

  async load(): Promise<SessionRegistryState> {
    try {
      await access(this.journalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
    return withFileLock(this.lockPath, async () => {
      const parsed = parseEvents(await readFile(this.journalPath, "utf8"));
      if (parsed.partial) throw new JournalCorruptionError("Session journal has an incomplete final record");
      return reduce(parsed.events);
    });
  }

  async findLatestByPiSession(piSessionId: string): Promise<WriterSession | undefined> {
    const state = await this.load();
    return Object.values(state.sessions)
      .filter((session) => session.piSessionId === piSessionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  async findByPiSession(piSessionId: string): Promise<WriterSession | undefined> {
    const state = await this.load();
    return Object.values(state.sessions)
      .filter((session) => session.piSessionId === piSessionId && ["active", "postflight_passed", "ready_for_integration"].includes(session.status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  start(session: WriterSession, actor: string): Promise<SessionRegistryState> {
    return this.append(
      "session_started",
      { kind: "session_started", session },
      actor,
      (state) => assertNoClaimConflicts(session.claims, Object.values(state.sessions), session.id),
    );
  }

  claim(sessionId: string, claims: readonly string[], actor: string): Promise<SessionRegistryState> {
    return this.append(
      "paths_claimed",
      { kind: "paths_claimed", sessionId, claims },
      actor,
      (state) => assertNoClaimConflicts(claims, Object.values(state.sessions), sessionId),
    );
  }

  resume(session: WriterSession, reason: string, actor: string): Promise<SessionRegistryState> {
    return this.append(
      "session_status_changed",
      { kind: "session_status_changed", sessionId: session.id, status: "active", reason },
      actor,
      (state) => assertNoClaimConflicts(session.claims, Object.values(state.sessions), session.id),
    );
  }

  heartbeat(sessionId: string, heartbeatAt: string, leaseExpiresAt: string, actor: string): Promise<SessionRegistryState> {
    return this.append("heartbeat", { kind: "heartbeat", sessionId, heartbeatAt, leaseExpiresAt }, actor);
  }

  recordPostflight(sessionId: string, receipt: PostflightReceipt, actor: string): Promise<SessionRegistryState> {
    return this.append("postflight_passed", { kind: "postflight_passed", sessionId, receipt }, actor);
  }

  markReady(sessionId: string, commit: string, actor: string): Promise<SessionRegistryState> {
    return this.append("session_ready", { kind: "session_ready", sessionId, commit }, actor);
  }

  changeStatus(sessionId: string, status: WriterStatus, reason: string, actor: string): Promise<SessionRegistryState> {
    return this.append("session_status_changed", { kind: "session_status_changed", sessionId, status, reason }, actor);
  }

  private async append<K extends SessionEventKind>(
    _kind: K,
    payload: PayloadFor<K>,
    actor: string,
    validate?: (state: SessionRegistryState) => void,
  ): Promise<SessionRegistryState> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return withFileLock(this.lockPath, async () => {
      let content = "";
      try {
        content = await readFile(this.journalPath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const parsed = parseEvents(content);
      if (parsed.partial) await truncate(this.journalPath, parsed.validBytes);
      const current = reduce(parsed.events);
      const generalPayload = payload as PayloadFor<SessionEventKind>;
      if (generalPayload.kind !== "session_started" && !current.sessions[generalPayload.sessionId]) {
        throw new SafetyKernelError(`Unknown writer session ${generalPayload.sessionId}`);
      }
      validate?.(current);
      const unsigned: UnsignedSessionEvent<K> = {
        schemaVersion: SESSION_REGISTRY_SCHEMA_VERSION,
        id: randomUUID(),
        revision: current.revision + 1,
        timestamp: new Date().toISOString(),
        actor,
        previousHash: current.lastEventHash,
        payload,
      };
      const event: SessionEvent<K> = { ...unsigned, hash: hashEvent(unsigned as unknown as UnsignedSessionEvent<SessionEventKind>) };
      const file = await open(this.journalPath, "a", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(event)}\n`, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      const next = reduce([...parsed.events, event as unknown as SessionEvent]);
      await writeFileAtomically(this.snapshotPath, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }
}
