import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, stat, truncate } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { writeFileAtomically } from "./atomic-file.ts";
import { JournalCorruptionError, RevisionConflictError } from "./errors.ts";
import { withFileLock, type FileLockOptions } from "./file-lock.ts";
import {
  LIFECYCLE_STATES,
  RUNTIME_SCHEMA_VERSION,
  type LifecycleState,
  type RuntimeEvent,
  type RuntimeEventKind,
  type RuntimeEventPayloads,
  type RuntimeSnapshot,
  type RuntimeState,
} from "./runtime-types.ts";
import { assertTransitionAllowed } from "./transitions.ts";

const JOURNAL_NAME = "events.jsonl";
const SNAPSHOT_NAME = "snapshot.json";
const LOCK_NAME = "runtime.lock";

interface UnsignedEvent<K extends RuntimeEventKind> {
  readonly schemaVersion: typeof RUNTIME_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly timestamp: string;
  readonly kind: K;
  readonly actor: string;
  readonly previousHash: string | null;
  readonly payload: RuntimeEventPayloads[K];
}

function eventHash(event: UnsignedEvent<RuntimeEventKind>): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

function isRuntimeEventKind(value: unknown): value is RuntimeEventKind {
  return value === "runtime_initialized" || value === "lifecycle_transitioned";
}

function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === "string" && (LIFECYCLE_STATES as readonly string[]).includes(value);
}

function payloadIsValid(kind: RuntimeEventKind, payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  if (kind === "runtime_initialized") {
    return (
      typeof value.repositoryId === "string" && value.repositoryId.length > 0 &&
      typeof value.repositoryFingerprint === "string" && value.repositoryFingerprint.length > 0 &&
      typeof value.primaryRoot === "string" && value.primaryRoot.length > 0
    );
  }
  return isLifecycleState(value.from) && isLifecycleState(value.to) && typeof value.reason === "string" && value.reason.length > 0;
}

function parseEvent(line: string, lineNumber: number): RuntimeEvent {
  let candidate: unknown;
  try {
    candidate = JSON.parse(line);
  } catch (error) {
    throw new JournalCorruptionError(`Invalid JSON at runtime journal line ${lineNumber}`, { cause: error });
  }
  if (!candidate || typeof candidate !== "object") {
    throw new JournalCorruptionError(`Runtime journal line ${lineNumber} is not an object`);
  }
  const event = candidate as Partial<RuntimeEvent>;
  if (
    event.schemaVersion !== RUNTIME_SCHEMA_VERSION ||
    typeof event.id !== "string" ||
    typeof event.revision !== "number" ||
    typeof event.timestamp !== "string" ||
    !isRuntimeEventKind(event.kind) ||
    typeof event.actor !== "string" ||
    !(event.previousHash === null || typeof event.previousHash === "string") ||
    !payloadIsValid(event.kind, event.payload) ||
    typeof event.hash !== "string"
  ) {
    throw new JournalCorruptionError(`Runtime journal line ${lineNumber} has an invalid envelope`);
  }
  const { hash, ...unsigned } = event as RuntimeEvent;
  if (eventHash(unsigned as UnsignedEvent<RuntimeEventKind>) !== hash) {
    throw new JournalCorruptionError(`Runtime journal hash mismatch at line ${lineNumber}`);
  }
  return event as RuntimeEvent;
}

interface JournalRead {
  readonly events: RuntimeEvent[];
  readonly validBytes: number;
  readonly hadPartialTail: boolean;
}

async function readJournal(path: string): Promise<JournalRead> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { events: [], validBytes: 0, hadPartialTail: false };
    }
    throw error;
  }
  if (content.length === 0) return { events: [], validBytes: 0, hadPartialTail: false };

  const endsWithNewline = content.endsWith("\n");
  const parts = content.split("\n");
  if (endsWithNewline) parts.pop();
  else parts.pop();
  const completeLines = parts.filter((line) => line.length > 0);
  const validText = completeLines.length === 0 ? "" : `${completeLines.join("\n")}\n`;
  return {
    events: completeLines.map((line, index) => parseEvent(line, index + 1)),
    validBytes: Buffer.byteLength(validText),
    hadPartialTail: !endsWithNewline,
  };
}

function reduceEvents(events: readonly RuntimeEvent[]): RuntimeState | null {
  let state: RuntimeState | null = null;
  let expectedHash: string | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.revision !== index + 1) {
      throw new JournalCorruptionError(`Expected revision ${index + 1}, found ${event.revision}`);
    }
    if (event.previousHash !== expectedHash) {
      throw new JournalCorruptionError(`Broken runtime hash chain at revision ${event.revision}`);
    }

    if (event.kind === "runtime_initialized") {
      if (state !== null || event.revision !== 1) {
        throw new JournalCorruptionError("runtime_initialized must be the first and only initialization event");
      }
      const payload = event.payload as RuntimeEventPayloads["runtime_initialized"];
      state = {
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        repositoryId: payload.repositoryId,
        repositoryFingerprint: payload.repositoryFingerprint,
        primaryRoot: payload.primaryRoot,
        revision: event.revision,
        lifecycle: "idea",
        lastEventId: event.id,
        lastEventHash: event.hash,
        updatedAt: event.timestamp,
      };
    } else {
      if (!state) throw new JournalCorruptionError("Runtime journal is missing initialization");
      const payload = event.payload as RuntimeEventPayloads["lifecycle_transitioned"];
      if (payload.from !== state.lifecycle) {
        throw new JournalCorruptionError(
          `Transition source ${payload.from} does not match current lifecycle ${state.lifecycle}`,
        );
      }
      assertTransitionAllowed(payload.from, payload.to);
      state = {
        ...(state as RuntimeState),
        revision: event.revision,
        lifecycle: payload.to,
        lastEventId: event.id,
        lastEventHash: event.hash,
        updatedAt: event.timestamp,
      };
    }
    expectedHash = event.hash;
  }
  return state;
}

async function appendEvent(path: string, event: RuntimeEvent): Promise<void> {
  const file = await open(path, "a", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(event)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}

function createEvent<K extends RuntimeEventKind>(
  kind: K,
  payload: RuntimeEventPayloads[K],
  actor: string,
  revision: number,
  previousHash: string | null,
): RuntimeEvent<K> {
  const unsigned: UnsignedEvent<K> = {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: randomUUID(),
    revision,
    timestamp: new Date().toISOString(),
    kind,
    actor,
    previousHash,
    payload,
  };
  return { ...unsigned, hash: eventHash(unsigned as UnsignedEvent<RuntimeEventKind>) };
}

export class RuntimeStore {
  readonly runtimeRoot: string;
  readonly stateDirectory: string;
  readonly journalPath: string;
  readonly snapshotPath: string;
  readonly lockPath: string;

  constructor(
    readonly repository: RepositoryDescriptor,
    private readonly lockOptions: FileLockOptions = {},
  ) {
    this.runtimeRoot = join(repository.primaryRoot, ".appforge");
    this.stateDirectory = join(this.runtimeRoot, "state");
    this.journalPath = join(this.stateDirectory, JOURNAL_NAME);
    this.snapshotPath = join(this.stateDirectory, SNAPSHOT_NAME);
    this.lockPath = join(this.stateDirectory, "locks", LOCK_NAME);
  }

  async status(): Promise<RuntimeState | null> {
    try {
      await access(this.journalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return withFileLock(
      this.lockPath,
      async () => {
        const read = await readJournal(this.journalPath);
        if (read.hadPartialTail) {
          throw new JournalCorruptionError("Runtime journal has an incomplete final record; initialize or transition will repair it under lock");
        }
        const state = reduceEvents(read.events);
        this.assertRepository(state);
        return state;
      },
      this.lockOptions,
    );
  }

  async initialize(actor: string): Promise<RuntimeState> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    return withFileLock(
      this.lockPath,
      async () => {
        const read = await readJournal(this.journalPath);
        if (read.hadPartialTail) await truncate(this.journalPath, read.validBytes);
        const current = reduceEvents(read.events);
        if (current) {
          this.assertRepository(current);
          await this.writeSnapshot(current);
          return current;
        }

        const event = createEvent(
          "runtime_initialized",
          {
            repositoryId: randomUUID(),
            repositoryFingerprint: this.repository.fingerprint,
            primaryRoot: this.repository.primaryRoot,
          },
          actor,
          1,
          null,
        );
        await appendEvent(this.journalPath, event);
        const state = reduceEvents([event]);
        if (!state) throw new JournalCorruptionError("Initialization did not produce runtime state");
        await this.writeSnapshot(state);
        return state;
      },
      this.lockOptions,
    );
  }

  async transition(
    to: LifecycleState,
    reason: string,
    actor: string,
    expectedRevision: number,
  ): Promise<RuntimeState> {
    return withFileLock(
      this.lockPath,
      async () => {
        const read = await readJournal(this.journalPath);
        if (read.hadPartialTail) await truncate(this.journalPath, read.validBytes);
        const current = reduceEvents(read.events);
        if (!current) throw new RevisionConflictError("Runtime must be initialized before lifecycle transitions");
        this.assertRepository(current);
        if (current.revision !== expectedRevision) {
          throw new RevisionConflictError(
            `Expected runtime revision ${expectedRevision}, found ${current.revision}`,
          );
        }
        assertTransitionAllowed(current.lifecycle, to);
        const event = createEvent(
          "lifecycle_transitioned",
          { from: current.lifecycle, to, reason },
          actor,
          current.revision + 1,
          current.lastEventHash,
        );
        await appendEvent(this.journalPath, event);
        const next = reduceEvents([...read.events, event]);
        if (!next) throw new JournalCorruptionError("Transition did not produce runtime state");
        await this.writeSnapshot(next);
        return next;
      },
      this.lockOptions,
    );
  }

  private assertRepository(state: RuntimeState | null): void {
    if (state && state.repositoryFingerprint !== this.repository.fingerprint) {
      throw new JournalCorruptionError("Runtime repository fingerprint does not match the current Git common directory");
    }
  }

  private async writeSnapshot(state: RuntimeState): Promise<void> {
    const snapshot: RuntimeSnapshot = { schemaVersion: RUNTIME_SCHEMA_VERSION, state };
    await writeFileAtomically(this.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  }
}

export async function runtimeFilesExist(store: RuntimeStore): Promise<boolean> {
  try {
    await stat(store.journalPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
