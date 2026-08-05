import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { containsSensitiveText } from "../process/redaction.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { withFileLock } from "../state/file-lock.ts";

export const BLOCKER_LEDGER_SCHEMA_VERSION = 1 as const;
export const BLOCKER_KINDS = ["code", "verification", "apple_developer", "external_validation", "release"] as const;
export type BlockerKind = (typeof BLOCKER_KINDS)[number];
export type BlockerStatus = "open" | "resolved";
export const EXTERNAL_BLOCKER_OWNERS = ["founder", "coordinator"] as const;
export type ExternalBlockerOwner = (typeof EXTERNAL_BLOCKER_OWNERS)[number];

export interface ExternalBlocker {
  readonly owner: ExternalBlockerOwner;
  readonly evidenceRequired: string;
  readonly requiredBefore: "ship";
}

export interface Blocker {
  readonly id: string;
  readonly kind: BlockerKind;
  readonly title: string;
  readonly nextAction: string;
  readonly openedAt: string;
  readonly openedBy: string;
  readonly sourceCommit?: string;
  readonly external?: ExternalBlocker;
  readonly status: BlockerStatus;
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
  readonly resolution?: string;
}

interface BlockerLedger {
  readonly schemaVersion: typeof BLOCKER_LEDGER_SCHEMA_VERSION;
  readonly blockers: readonly Blocker[];
}

function validText(value: string, label: string, maximum: number): string {
  const text = value.trim();
  if (!text || text.length > maximum) throw new Error(`${label} must be between 1 and ${maximum} characters`);
  if (containsSensitiveText(text)) throw new Error(`${label} must not contain credentials or secrets`);
  return text;
}

function validate(ledger: unknown): BlockerLedger {
  if (!ledger || typeof ledger !== "object") throw new Error("Blocker ledger is malformed");
  const value = ledger as Partial<BlockerLedger>;
  if (value.schemaVersion !== BLOCKER_LEDGER_SCHEMA_VERSION || !Array.isArray(value.blockers)) throw new Error("Blocker ledger schema is unsupported");
  return value as BlockerLedger;
}

export class BlockerStore {
  readonly directory: string;
  readonly path: string;
  readonly lockPath: string;

  constructor(readonly repository: RepositoryDescriptor) {
    this.directory = join(repository.primaryRoot, ".idevflow", "state", "blockers");
    this.path = join(this.directory, "ledger.json");
    this.lockPath = join(this.directory, "ledger.lock");
  }

  async list(): Promise<readonly Blocker[]> {
    try { return (await this.load()).blockers; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async open(input: { kind: BlockerKind; title: string; nextAction: string; actor: string; sourceCommit?: string; external?: { owner: ExternalBlockerOwner; evidenceRequired: string } }): Promise<Blocker> {
    const title = validText(input.title, "Blocker title", 240);
    const nextAction = validText(input.nextAction, "Blocker next action", 500);
    const actor = validText(input.actor, "Blocker actor", 120);
    const external = input.external ? { owner: input.external.owner, evidenceRequired: validText(input.external.evidenceRequired, "External evidence requirement", 500), requiredBefore: "ship" as const } : undefined;
    if (["apple_developer", "external_validation", "release"].includes(input.kind) && !external) throw new Error(`${input.kind} blockers require owner and evidenceRequired`);
    if (input.sourceCommit && !/^[0-9a-f]{40}$/i.test(input.sourceCommit)) throw new Error("Blocker sourceCommit must be an exact Git commit");
    return this.mutate((ledger) => {
      const blocker: Blocker = { id: randomUUID(), kind: input.kind, title, nextAction, openedAt: new Date().toISOString(), openedBy: actor, ...(input.sourceCommit ? { sourceCommit: input.sourceCommit } : {}), ...(external ? { external } : {}), status: "open" };
      return { ledger: { ...ledger, blockers: [...ledger.blockers, blocker] }, result: blocker };
    });
  }

  async resolve(id: string, resolution: string, actor: string): Promise<Blocker> {
    const explanation = validText(resolution, "Blocker resolution", 500);
    const resolvedBy = validText(actor, "Blocker actor", 120);
    return this.mutate((ledger) => {
      const existing = ledger.blockers.find((blocker) => blocker.id === id);
      if (!existing) throw new Error(`Unknown blocker ${id}`);
      if (existing.status !== "open") throw new Error(`Blocker ${id} is already ${existing.status}`);
      const result: Blocker = { ...existing, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy, resolution: explanation };
      return { ledger: { ...ledger, blockers: ledger.blockers.map((blocker) => blocker.id === id ? result : blocker) }, result };
    });
  }

  async openShipBlockers(): Promise<readonly Blocker[]> {
    return (await this.list()).filter((blocker) => blocker.status === "open" && blocker.external?.requiredBefore === "ship");
  }

  private async load(): Promise<BlockerLedger> { return validate(JSON.parse(await readFile(this.path, "utf8"))); }

  private async mutate<T>(operation: (ledger: BlockerLedger) => { ledger: BlockerLedger; result: T }): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return withFileLock(this.lockPath, async () => {
      const ledger = await this.load().catch((error) => (error as NodeJS.ErrnoException).code === "ENOENT" ? { schemaVersion: BLOCKER_LEDGER_SCHEMA_VERSION, blockers: [] } : Promise.reject(error));
      const next = operation(ledger);
      await writeFileAtomically(this.path, `${JSON.stringify(next.ledger, null, 2)}\n`);
      return next.result;
    });
  }
}
