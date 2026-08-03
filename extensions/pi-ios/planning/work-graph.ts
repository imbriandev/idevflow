import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ApplePlatform } from "../config/config.ts";
import type { Risk } from "../lifecycle/contracts.ts";
import { RISKS } from "../lifecycle/contracts.ts";
import { claimsOverlap, normalizeClaim } from "../git/claims.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { VERIFICATION_PROFILES, type VerificationProfile } from "../verification/profiles.ts";

export const LEGACY_WORK_GRAPH_SCHEMA_VERSION = 1 as const;
export const WORK_GRAPH_SCHEMA_VERSION = 2 as const;

export interface ArchitectureDecision {
  readonly id: string;
  readonly title: string;
  readonly decision: string;
  readonly rationale: string;
  readonly status: "accepted" | "proposed";
}

export interface WorkSlice {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly paths: readonly string[];
  readonly risk: Risk;
  readonly dependsOn: readonly string[];
  readonly acceptance: readonly string[];
  readonly verificationProfile: VerificationProfile;
  readonly platforms?: readonly ApplePlatform[];
}

export interface WorkGraph {
  readonly schemaVersion: typeof LEGACY_WORK_GRAPH_SCHEMA_VERSION | typeof WORK_GRAPH_SCHEMA_VERSION;
  readonly title: string;
  readonly sourceSpecFingerprint: string;
  readonly architecture: readonly ArchitectureDecision[];
  readonly slices: readonly WorkSlice[];
}

export interface ValidatedWorkGraph {
  readonly graph: WorkGraph;
  readonly fingerprint: string;
  readonly path: string;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SafetyKernelError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new SafetyKernelError(`${label} must be a non-empty string`);
  return value.trim();
}
function texts(value: unknown, label: string, minimum = 0): string[] {
  if (!Array.isArray(value) || value.length < minimum) throw new SafetyKernelError(`${label} must be an array with at least ${minimum} item(s)`);
  const result = value.map((item, index) => text(item, `${label}[${index}]`));
  if (new Set(result).size !== result.length) throw new SafetyKernelError(`${label} contains duplicates`);
  return result;
}

function transitiveDependencies(id: string, slices: ReadonlyMap<string, WorkSlice>, visiting = new Set<string>()): Set<string> {
  if (visiting.has(id)) throw new SafetyKernelError(`Work graph contains a dependency cycle at ${id}`);
  visiting.add(id);
  const result = new Set<string>();
  for (const dependency of slices.get(id)?.dependsOn ?? []) {
    if (!slices.has(dependency)) throw new SafetyKernelError(`Slice ${id} depends on unknown slice ${dependency}`);
    result.add(dependency);
    for (const nested of transitiveDependencies(dependency, slices, new Set(visiting))) result.add(nested);
  }
  return result;
}

export function validateWorkGraph(value: unknown, root: string, expectedSpecFingerprint: string): WorkGraph {
  const raw = object(value, "work graph");
  if (raw.schemaVersion !== LEGACY_WORK_GRAPH_SCHEMA_VERSION && raw.schemaVersion !== WORK_GRAPH_SCHEMA_VERSION) throw new SafetyKernelError("Unsupported work graph schema");
  const sourceSpecFingerprint = text(raw.sourceSpecFingerprint, "sourceSpecFingerprint");
  if (sourceSpecFingerprint !== expectedSpecFingerprint) throw new SafetyKernelError("Work graph is stale relative to the current product/SLC specification");
  if (!Array.isArray(raw.architecture) || raw.architecture.length === 0) throw new SafetyKernelError("Work graph requires architecture decisions");
  const architecture = raw.architecture.map((item, index) => {
    const decision = object(item, `architecture[${index}]`);
    const status = text(decision.status, `architecture[${index}].status`);
    if (status !== "accepted" && status !== "proposed") throw new SafetyKernelError(`architecture[${index}].status is invalid`);
    return { id: text(decision.id, `architecture[${index}].id`), title: text(decision.title, `architecture[${index}].title`), decision: text(decision.decision, `architecture[${index}].decision`), rationale: text(decision.rationale, `architecture[${index}].rationale`), status: status as "accepted" | "proposed" };
  });
  if (new Set(architecture.map((item) => item.id)).size !== architecture.length) throw new SafetyKernelError("Architecture decision ids must be unique");
  if (architecture.some((item) => item.status !== "accepted")) throw new SafetyKernelError("Every architecture decision must be accepted before plan approval");
  if (!Array.isArray(raw.slices) || raw.slices.length === 0) throw new SafetyKernelError("Work graph requires at least one vertical slice");
  const slices = raw.slices.map((item, index) => {
    const slice = object(item, `slices[${index}]`);
    const risk = text(slice.risk, `slices[${index}].risk`) as Risk;
    const verificationProfile = text(slice.verificationProfile, `slices[${index}].verificationProfile`) as VerificationProfile;
    if (!(RISKS as readonly string[]).includes(risk)) throw new SafetyKernelError(`Slice ${index} has invalid risk ${risk}`);
    if (!(VERIFICATION_PROFILES as readonly string[]).includes(verificationProfile)) throw new SafetyKernelError(`Slice ${index} has invalid verification profile ${verificationProfile}`);
    const paths = texts(slice.paths, `slices[${index}].paths`, 1).map((path) => normalizeClaim(path, root));
    const platforms = raw.schemaVersion === WORK_GRAPH_SCHEMA_VERSION ? texts(slice.platforms, `slices[${index}].platforms`, 1) : ["ios"];
    if (platforms.some((platform) => platform !== "ios" && platform !== "macos")) throw new SafetyKernelError(`Slice ${index} has an invalid platform`);
    return { id: text(slice.id, `slices[${index}].id`), title: text(slice.title, `slices[${index}].title`), goal: text(slice.goal, `slices[${index}].goal`), paths, risk, dependsOn: texts(slice.dependsOn, `slices[${index}].dependsOn`), acceptance: texts(slice.acceptance, `slices[${index}].acceptance`, 1), verificationProfile, platforms: platforms as ApplePlatform[] };
  });
  const byId = new Map(slices.map((slice) => [slice.id, slice]));
  if (byId.size !== slices.length) throw new SafetyKernelError("Work slice ids must be unique");
  const dependencies = new Map(slices.map((slice) => [slice.id, transitiveDependencies(slice.id, byId)]));
  for (let leftIndex = 0; leftIndex < slices.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < slices.length; rightIndex += 1) {
      const left = slices[leftIndex]!;
      const right = slices[rightIndex]!;
      const ordered = dependencies.get(left.id)!.has(right.id) || dependencies.get(right.id)!.has(left.id);
      if (!ordered && left.paths.some((a) => right.paths.some((b) => claimsOverlap(a, b)))) {
        throw new SafetyKernelError(`Independent slices ${left.id} and ${right.id} have overlapping path claims`);
      }
    }
  }
  return { schemaVersion: raw.schemaVersion, title: text(raw.title, "work graph title"), sourceSpecFingerprint, architecture, slices };
}

export async function loadWorkGraph(root: string, configuredPath: string, expectedSpecFingerprint: string): Promise<ValidatedWorkGraph> {
  const absolute = resolve(root, configuredPath);
  let value: unknown;
  try { value = JSON.parse(await readFile(absolute, "utf8")); }
  catch (error) { throw new SafetyKernelError(`Cannot read work graph ${configuredPath}`, { cause: error }); }
  const graph = validateWorkGraph(value, root, expectedSpecFingerprint);
  return { graph, path: configuredPath, fingerprint: createHash("sha256").update(JSON.stringify(graph)).digest("hex") };
}
