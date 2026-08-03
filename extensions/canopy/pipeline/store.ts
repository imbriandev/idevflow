import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, truncate } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { JournalCorruptionError, SafetyKernelError } from "../state/errors.ts";
import { withFileLock } from "../state/file-lock.ts";
import { PIPELINE_SCHEMA_VERSION, type PipelineEvent, type PipelineState } from "./types.ts";

function safeId(value: string): string {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new SafetyKernelError("Pipeline id must be lowercase kebab case");
  return value;
}
function eventHash(event: Omit<PipelineEvent, "hash">): string { return createHash("sha256").update(JSON.stringify(event)).digest("hex"); }

function parseJournal(content: string): { events: PipelineEvent[]; partial: boolean; validBytes: number } {
  if (!content) return { events: [], partial: false, validBytes: 0 };
  const complete = content.endsWith("\n");
  const pieces = content.split("\n");
  pieces.pop();
  const lines = pieces.filter(Boolean);
  const events = lines.map((line, index) => {
    let event: PipelineEvent;
    try { event = JSON.parse(line) as PipelineEvent; } catch (error) { throw new JournalCorruptionError(`Invalid pipeline journal JSON at line ${index + 1}`, { cause: error }); }
    if (event.schemaVersion !== PIPELINE_SCHEMA_VERSION || !event.hash || !event.state) throw new JournalCorruptionError(`Invalid pipeline event at line ${index + 1}`);
    const { hash, ...unsigned } = event;
    if (eventHash(unsigned) !== hash) throw new JournalCorruptionError(`Pipeline event hash mismatch at line ${index + 1}`);
    return event;
  });
  const valid = lines.length ? `${lines.join("\n")}\n` : "";
  return { events, partial: !complete, validBytes: Buffer.byteLength(valid) };
}

function reduce(events: readonly PipelineEvent[], pipelineId: string, repositoryFingerprint: string): PipelineState | null {
  let state: PipelineState | null = null;
  let previousHash: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.pipelineId !== pipelineId || event.revision !== index + 1 || event.previousHash !== previousHash) throw new JournalCorruptionError(`Broken pipeline journal at revision ${event.revision}`);
    if (event.state.revision !== event.revision || event.state.repositoryFingerprint !== repositoryFingerprint || event.state.id !== pipelineId) throw new JournalCorruptionError(`Pipeline state binding mismatch at revision ${event.revision}`);
    state = event.state;
    previousHash = event.hash;
  }
  return state;
}

export class PipelineStore {
  readonly root: string;
  readonly snapshots: string;
  readonly journals: string;
  readonly lockPath: string;

  constructor(readonly repository: RepositoryDescriptor) {
    this.root = join(repository.primaryRoot, ".canopy", "pipeline");
    this.snapshots = join(this.root, "states");
    this.journals = join(this.root, "events");
    this.lockPath = join(repository.primaryRoot, ".canopy", "state", "locks", "pipeline.lock");
  }

  private journal(id: string): string { return join(this.journals, `${safeId(id)}.jsonl`); }
  private snapshot(id: string): string { return join(this.snapshots, `${safeId(id)}.json`); }

  async load(id: string): Promise<PipelineState | null> {
    safeId(id);
    return withFileLock(this.lockPath, async () => this.loadUnlocked(id, false));
  }

  async list(): Promise<PipelineState[]> {
    let names: string[];
    try { names = await readdir(this.journals); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const states: PipelineState[] = [];
    for (const name of names.filter((value) => value.endsWith(".jsonl")).sort()) {
      const state = await this.load(name.slice(0, -6));
      if (state) states.push(state);
    }
    return states;
  }

  async create(initial: Omit<PipelineState, "revision" | "updatedAt">, actor: string): Promise<PipelineState> {
    const id = safeId(initial.id);
    return withFileLock(this.lockPath, async () => {
      if (await this.loadUnlocked(id, true)) throw new SafetyKernelError(`Pipeline ${id} already exists`);
      const now = new Date().toISOString();
      const state: PipelineState = { ...initial, revision: 1, updatedAt: now };
      await this.appendUnlocked(id, null, "pipeline_created", actor, state);
      return state;
    });
  }

  async mutate(id: string, kind: string, actor: string, update: (current: PipelineState) => PipelineState): Promise<PipelineState> {
    safeId(id);
    return withFileLock(this.lockPath, async () => {
      const current = await this.loadUnlocked(id, true);
      if (!current) throw new SafetyKernelError(`Unknown pipeline ${id}`);
      const proposed = update(structuredClone(current));
      if (proposed.id !== id || proposed.repositoryFingerprint !== current.repositoryFingerprint || proposed.graphFingerprint !== current.graphFingerprint || proposed.planCommit !== current.planCommit) throw new SafetyKernelError("Pipeline immutable binding changed during mutation");
      const next: PipelineState = { ...proposed, revision: current.revision + 1, updatedAt: new Date().toISOString() };
      const parsed = parseJournal(await readFile(this.journal(id), "utf8"));
      const previousHash = parsed.events.at(-1)?.hash ?? null;
      await this.appendUnlocked(id, previousHash, kind, actor, next);
      return next;
    });
  }

  private async loadUnlocked(id: string, repairPartial: boolean): Promise<PipelineState | null> {
    let content: string;
    try { content = await readFile(this.journal(id), "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const parsed = parseJournal(content);
    if (parsed.partial) {
      if (!repairPartial) throw new JournalCorruptionError("Pipeline journal has an incomplete final record");
      await truncate(this.journal(id), parsed.validBytes);
    }
    const state = reduce(parsed.events, id, this.repository.fingerprint);
    if (state) await writeFileAtomically(this.snapshot(id), `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  private async appendUnlocked(id: string, previousHash: string | null, kind: string, actor: string, state: PipelineState): Promise<void> {
    await Promise.all([mkdir(this.journals, { recursive: true, mode: 0o700 }), mkdir(this.snapshots, { recursive: true, mode: 0o700 })]);
    const unsigned: Omit<PipelineEvent, "hash"> = { schemaVersion: PIPELINE_SCHEMA_VERSION, id: randomUUID(), pipelineId: id, revision: state.revision, timestamp: new Date().toISOString(), actor, kind, previousHash, state };
    const event: PipelineEvent = { ...unsigned, hash: eventHash(unsigned) };
    const file = await open(this.journal(id), "a", 0o600);
    try { await file.writeFile(`${JSON.stringify(event)}\n`); await file.sync(); } finally { await file.close(); }
    await writeFileAtomically(this.snapshot(id), `${JSON.stringify(state, null, 2)}\n`);
  }
}
