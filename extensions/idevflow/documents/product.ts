import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";

export const LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION = 1 as const;
export const LEGACY_SLC_SPEC_SCHEMA_VERSION = 1 as const;
export const IDEA_QUALITY_PRODUCT_MEMORY_SCHEMA_VERSION = 2 as const;
export const PRODUCT_MEMORY_SCHEMA_VERSION = 3 as const;
export const SLC_SPEC_SCHEMA_VERSION = 2 as const;

type ClaimKind = "founder_evidence" | "observed_feedback" | "assumption" | "unknown";
type ClaimStatus = "open" | "confirmed" | "weakened" | "disproven";
type Confidence = "low" | "medium" | "high";
type Impact = "low" | "medium" | "high" | "critical";
type ClaimScope = "product" | "market" | "competitor";
type LearningEvidenceKind = "founder_feedback" | "tester_feedback" | "metric" | "incident";

interface ProductCore {
  readonly product: { readonly name: string; readonly targetUser: string; readonly problem: string; readonly promise: string };
  readonly principles: readonly string[];
  readonly decisions: readonly { readonly id: string; readonly decision: string; readonly rationale: string; readonly status: "active" | "superseded" }[];
}

export interface LegacyProductMemory extends ProductCore {
  readonly schemaVersion: typeof LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION;
}

export interface IdeaClaim {
  readonly id: string;
  readonly claim: string;
  readonly kind: ClaimKind;
  readonly source?: string;
  readonly confidence: Confidence;
  readonly impact: Impact;
  readonly validationPlan: string;
  readonly status: ClaimStatus;
  readonly scope: ClaimScope;
  readonly sourceUrls: readonly string[];
  readonly learningEvidenceIds: readonly string[];
}

interface LearningEvidence {
  readonly id: string;
  readonly kind: LearningEvidenceKind;
  readonly source: string;
  readonly finding: string;
  readonly metric?: { readonly name: string; readonly value: number; readonly unit: string; readonly target: string };
}

interface IdeaValidationCore {
  readonly learningQuestion: string;
  readonly primaryAssumptionId: string;
  readonly claims: readonly IdeaClaim[];
  readonly skepticalCritique: { readonly alternative: string; readonly adoptionRisk: string; readonly invalidatingSignal: string; readonly unresolvedClaimIds: readonly string[] };
  readonly learningEvidence: readonly LearningEvidence[];
}

export interface LegacyIdeaQualityProductMemory extends ProductCore {
  readonly schemaVersion: typeof IDEA_QUALITY_PRODUCT_MEMORY_SCHEMA_VERSION;
  readonly ideaValidation: IdeaValidationCore;
}

export interface ProductMemory extends ProductCore {
  readonly schemaVersion: typeof PRODUCT_MEMORY_SCHEMA_VERSION;
  readonly ideaValidation: IdeaValidationCore & {
    readonly discovery: {
      readonly disposition: "evidence_sufficient" | "research_completed" | "prototype_completed";
      readonly rationale: string;
      readonly records: readonly { readonly id: string; readonly kind: "research" | "prototype"; readonly hypothesisClaimIds: readonly string[]; readonly method: string; readonly source: string; readonly finding: string; readonly limitation: string; readonly artifactPath?: string; readonly userTask?: string; readonly observedResult?: string }[];
    };
  };
}

export type ProductMemoryDocument = ProductMemory | LegacyIdeaQualityProductMemory | LegacyProductMemory;

interface SlcCore {
  readonly title: string;
  readonly simple: readonly string[];
  readonly lovable: readonly string[];
  readonly complete: readonly string[];
  readonly nonGoals: readonly string[];
  readonly successSignals: readonly string[];
  readonly risks: readonly string[];
}

export interface LegacySlcSpec extends SlcCore {
  readonly schemaVersion: typeof LEGACY_SLC_SPEC_SCHEMA_VERSION;
}

export interface SlcSpec extends SlcCore {
  readonly schemaVersion: typeof SLC_SPEC_SCHEMA_VERSION;
  readonly experienceExpectations: {
    readonly empty: string;
    readonly loading: string;
    readonly failure: string;
    readonly accessibility: string;
    readonly privacy: string;
    readonly trust: string;
  };
}

export type SlcSpecDocument = SlcSpec | LegacySlcSpec;

export interface IdeaQualityReport {
  readonly unresolvedCriticalAssumptionIds: readonly string[];
}

export interface DefinedProduct {
  readonly memory: ProductMemoryDocument;
  readonly slc: SlcSpecDocument;
  readonly fingerprint: string;
  readonly paths: { readonly memory: string; readonly slc: string };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SafetyKernelError(`${label} must be a JSON object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new SafetyKernelError(`${label} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, label: string, minimum = 1): string[] {
  if (!Array.isArray(value) || value.length < minimum) throw new SafetyKernelError(`${label} must contain at least ${minimum} item(s)`);
  const result = value.map((item, index) => text(item, `${label}[${index}]`));
  if (new Set(result).size !== result.length) throw new SafetyKernelError(`${label} contains duplicate items`);
  return result;
}

function optionalStrings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  return strings(value, label, 0);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new SafetyKernelError(`${label} is invalid`);
  return value as T;
}

function productCore(raw: Record<string, unknown>): ProductCore {
  const product = object(raw.product, "product memory product");
  const decisions = Array.isArray(raw.decisions) ? raw.decisions.map((item, index) => {
    const decision = object(item, `decisions[${index}]`);
    const status = enumValue(decision.status, ["active", "superseded"] as const, `decisions[${index}].status`);
    return { id: text(decision.id, `decisions[${index}].id`), decision: text(decision.decision, `decisions[${index}].decision`), rationale: text(decision.rationale, `decisions[${index}].rationale`), status };
  }) : [];
  if (new Set(decisions.map((item) => item.id)).size !== decisions.length) throw new SafetyKernelError("Product decision ids must be unique");
  return {
    product: { name: text(product.name, "product.name"), targetUser: text(product.targetUser, "product.targetUser"), problem: text(product.problem, "product.problem"), promise: text(product.promise, "product.promise") },
    principles: strings(raw.principles, "principles"),
    decisions,
  };
}

function claims(value: unknown): IdeaClaim[] {
  if (!Array.isArray(value) || value.length === 0) throw new SafetyKernelError("ideaValidation.claims must contain at least one claim");
  const result = value.map((item, index) => {
    const claim = object(item, `ideaValidation.claims[${index}]`);
    const kind = enumValue(claim.kind, ["founder_evidence", "observed_feedback", "assumption", "unknown"] as const, `ideaValidation.claims[${index}].kind`);
    const source = claim.source === undefined ? undefined : text(claim.source, `ideaValidation.claims[${index}].source`);
    if ((kind === "founder_evidence" || kind === "observed_feedback") && !source) throw new SafetyKernelError(`ideaValidation.claims[${index}].source is required for evidence or feedback`);
    return {
      id: text(claim.id, `ideaValidation.claims[${index}].id`),
      claim: text(claim.claim, `ideaValidation.claims[${index}].claim`),
      kind,
      ...(source ? { source } : {}),
      confidence: enumValue(claim.confidence, ["low", "medium", "high"] as const, `ideaValidation.claims[${index}].confidence`),
      impact: enumValue(claim.impact, ["low", "medium", "high", "critical"] as const, `ideaValidation.claims[${index}].impact`),
      validationPlan: text(claim.validationPlan, `ideaValidation.claims[${index}].validationPlan`),
      status: enumValue(claim.status, ["open", "confirmed", "weakened", "disproven"] as const, `ideaValidation.claims[${index}].status`),
      scope: enumValue(claim.scope, ["product", "market", "competitor"] as const, `ideaValidation.claims[${index}].scope`),
      sourceUrls: optionalStrings(claim.sourceUrls, `ideaValidation.claims[${index}].sourceUrls`),
      learningEvidenceIds: optionalStrings(claim.learningEvidenceIds, `ideaValidation.claims[${index}].learningEvidenceIds`),
    };
  });
  if (new Set(result.map((claim) => claim.id)).size !== result.length) throw new SafetyKernelError("Idea claim ids must be unique");
  return result;
}

export function validateProductMemory(value: unknown): ProductMemoryDocument {
  const raw = object(value, "product memory");
  const core = productCore(raw);
  if (raw.schemaVersion === LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION) return { schemaVersion: LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION, ...core };
  if (raw.schemaVersion !== IDEA_QUALITY_PRODUCT_MEMORY_SCHEMA_VERSION && raw.schemaVersion !== PRODUCT_MEMORY_SCHEMA_VERSION) throw new SafetyKernelError("Unsupported product memory schema");
  const validation = object(raw.ideaValidation, "ideaValidation");
  const validatedClaims = claims(validation.claims);
  const primaryAssumptionId = text(validation.primaryAssumptionId, "ideaValidation.primaryAssumptionId");
  const primary = validatedClaims.find((claim) => claim.id === primaryAssumptionId);
  if (!primary || (primary.kind !== "assumption" && primary.kind !== "unknown")) throw new SafetyKernelError("ideaValidation.primaryAssumptionId must reference an assumption or unknown claim");
  for (const claim of validatedClaims) {
    if ((claim.scope === "market" || claim.scope === "competitor") && (!claim.sourceUrls.length || claim.sourceUrls.some((url) => !/^https:\/\/[^\s]+$/i.test(url)))) {
      throw new SafetyKernelError(`Market or competitor claim ${claim.id} requires at least one HTTPS source URL`);
    }
  }
  const critique = object(validation.skepticalCritique, "ideaValidation.skepticalCritique");
  const unresolvedClaimIds = strings(critique.unresolvedClaimIds, "ideaValidation.skepticalCritique.unresolvedClaimIds", 0);
  const knownClaimIds = new Set(validatedClaims.map((claim) => claim.id));
  if (unresolvedClaimIds.some((id) => !knownClaimIds.has(id))) throw new SafetyKernelError("skepticalCritique references an unknown claim");
  const learningEvidence = Array.isArray(validation.learningEvidence) ? validation.learningEvidence.map((item, index) => {
    const evidence = object(item, `ideaValidation.learningEvidence[${index}]`);
    const kind = enumValue(evidence.kind, ["founder_feedback", "tester_feedback", "metric", "incident"] as const, `ideaValidation.learningEvidence[${index}].kind`);
    const metric = evidence.metric === undefined ? undefined : object(evidence.metric, `ideaValidation.learningEvidence[${index}].metric`);
    if (kind === "metric" && !metric) throw new SafetyKernelError(`Metric learning evidence ${index} requires metric details`);
    if (metric && (typeof metric.value !== "number" || !Number.isFinite(metric.value))) throw new SafetyKernelError(`Metric learning evidence ${index}.metric.value must be finite`);
    return { id: text(evidence.id, `ideaValidation.learningEvidence[${index}].id`), kind, source: text(evidence.source, `ideaValidation.learningEvidence[${index}].source`), finding: text(evidence.finding, `ideaValidation.learningEvidence[${index}].finding`), ...(metric ? { metric: { name: text(metric.name, `ideaValidation.learningEvidence[${index}].metric.name`), value: metric.value as number, unit: text(metric.unit, `ideaValidation.learningEvidence[${index}].metric.unit`), target: text(metric.target, `ideaValidation.learningEvidence[${index}].metric.target`) } } : {}) };
  }) : [];
  if (new Set(learningEvidence.map((item) => item.id)).size !== learningEvidence.length) throw new SafetyKernelError("Learning evidence ids must be unique");
  const learningIds = new Set(learningEvidence.map((item) => item.id));
  for (const claim of validatedClaims) {
    if (claim.learningEvidenceIds.some((id) => !learningIds.has(id))) throw new SafetyKernelError(`Claim ${claim.id} references unknown learning evidence`);
    if (claim.status !== "open" && !claim.learningEvidenceIds.length) throw new SafetyKernelError(`Claim ${claim.id} requires learning evidence before it can be ${claim.status}`);
  }
  const ideaValidation: IdeaValidationCore = { learningQuestion: text(validation.learningQuestion, "ideaValidation.learningQuestion"), primaryAssumptionId, claims: validatedClaims, skepticalCritique: { alternative: text(critique.alternative, "ideaValidation.skepticalCritique.alternative"), adoptionRisk: text(critique.adoptionRisk, "ideaValidation.skepticalCritique.adoptionRisk"), invalidatingSignal: text(critique.invalidatingSignal, "ideaValidation.skepticalCritique.invalidatingSignal"), unresolvedClaimIds }, learningEvidence };
  if (raw.schemaVersion === IDEA_QUALITY_PRODUCT_MEMORY_SCHEMA_VERSION) return { schemaVersion: IDEA_QUALITY_PRODUCT_MEMORY_SCHEMA_VERSION, ...core, ideaValidation };
  const discovery = object(validation.discovery, "ideaValidation.discovery");
  const records = Array.isArray(discovery.records) ? discovery.records.map((item, index) => {
    const record = object(item, `ideaValidation.discovery.records[${index}]`);
    const kind = enumValue(record.kind, ["research", "prototype"] as const, `ideaValidation.discovery.records[${index}].kind`);
    const hypothesisClaimIds = strings(record.hypothesisClaimIds, `ideaValidation.discovery.records[${index}].hypothesisClaimIds`);
    if (hypothesisClaimIds.some((id) => !knownClaimIds.has(id))) throw new SafetyKernelError("Discovery record references an unknown claim");
    const artifactPath = record.artifactPath === undefined ? undefined : text(record.artifactPath, `ideaValidation.discovery.records[${index}].artifactPath`);
    if (artifactPath && (artifactPath.startsWith("/") || artifactPath.split(/[\\/]/).includes(".."))) throw new SafetyKernelError("Discovery artifact path must stay project-relative");
    if (kind === "prototype" && (!artifactPath || !record.userTask || !record.observedResult)) throw new SafetyKernelError("Prototype discovery requires artifactPath, userTask, and observedResult");
    return { id: text(record.id, `ideaValidation.discovery.records[${index}].id`), kind, hypothesisClaimIds, method: text(record.method, `ideaValidation.discovery.records[${index}].method`), source: text(record.source, `ideaValidation.discovery.records[${index}].source`), finding: text(record.finding, `ideaValidation.discovery.records[${index}].finding`), limitation: text(record.limitation, `ideaValidation.discovery.records[${index}].limitation`), ...(artifactPath ? { artifactPath } : {}), ...(record.userTask ? { userTask: text(record.userTask, `ideaValidation.discovery.records[${index}].userTask`) } : {}), ...(record.observedResult ? { observedResult: text(record.observedResult, `ideaValidation.discovery.records[${index}].observedResult`) } : {}) };
  }) : [];
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new SafetyKernelError("Discovery record ids must be unique");
  const disposition = enumValue(discovery.disposition, ["evidence_sufficient", "research_completed", "prototype_completed"] as const, "ideaValidation.discovery.disposition");
  if ((disposition === "research_completed" && !records.some((record) => record.kind === "research")) || (disposition === "prototype_completed" && !records.some((record) => record.kind === "prototype"))) throw new SafetyKernelError("Discovery disposition requires a matching record");
  return { schemaVersion: PRODUCT_MEMORY_SCHEMA_VERSION, ...core, ideaValidation: { ...ideaValidation, discovery: { disposition, rationale: text(discovery.rationale, "ideaValidation.discovery.rationale"), records } } };
}

function slcCore(raw: Record<string, unknown>): SlcCore {
  return {
    title: text(raw.title, "SLC title"),
    simple: strings(raw.simple, "simple"),
    lovable: strings(raw.lovable, "lovable"),
    complete: strings(raw.complete, "complete"),
    nonGoals: strings(raw.nonGoals, "nonGoals"),
    successSignals: strings(raw.successSignals, "successSignals"),
    risks: strings(raw.risks, "risks"),
  };
}

export function validateSlcSpec(value: unknown): SlcSpecDocument {
  const raw = object(value, "SLC spec");
  const core = slcCore(raw);
  if (raw.schemaVersion === LEGACY_SLC_SPEC_SCHEMA_VERSION) return { schemaVersion: LEGACY_SLC_SPEC_SCHEMA_VERSION, ...core };
  if (raw.schemaVersion !== SLC_SPEC_SCHEMA_VERSION) throw new SafetyKernelError("Unsupported SLC spec schema");
  const expectations = object(raw.experienceExpectations, "experienceExpectations");
  return {
    schemaVersion: SLC_SPEC_SCHEMA_VERSION,
    ...core,
    experienceExpectations: {
      empty: text(expectations.empty, "experienceExpectations.empty"),
      loading: text(expectations.loading, "experienceExpectations.loading"),
      failure: text(expectations.failure, "experienceExpectations.failure"),
      accessibility: text(expectations.accessibility, "experienceExpectations.accessibility"),
      privacy: text(expectations.privacy, "experienceExpectations.privacy"),
      trust: text(expectations.trust, "experienceExpectations.trust"),
    },
  };
}

export function validateIdeaQuality(memory: ProductMemoryDocument, slc: SlcSpecDocument): IdeaQualityReport {
  if (memory.schemaVersion !== PRODUCT_MEMORY_SCHEMA_VERSION || slc.schemaVersion !== SLC_SPEC_SCHEMA_VERSION) {
    throw new SafetyKernelError("New product definitions require product memory schema version 3 with discovery records and SLC schema version 2");
  }
  const evidence = memory.ideaValidation.claims.filter((claim) => claim.kind === "founder_evidence" || claim.kind === "observed_feedback");
  if (!evidence.length) throw new SafetyKernelError("Idea validation requires at least one founder evidence or observed feedback claim");
  const primary = memory.ideaValidation.claims.find((claim) => claim.id === memory.ideaValidation.primaryAssumptionId)!;
  if (primary.status !== "open") throw new SafetyKernelError("A new definition requires an open primary assumption or unknown claim");
  const unresolvedCriticalAssumptionIds = memory.ideaValidation.claims
    .filter((claim) => (claim.kind === "assumption" || claim.kind === "unknown") && claim.status === "open" && (claim.impact === "high" || claim.impact === "critical"))
    .map((claim) => claim.id);
  if (unresolvedCriticalAssumptionIds.some((id) => !memory.ideaValidation.skepticalCritique.unresolvedClaimIds.includes(id))) {
    throw new SafetyKernelError("Skeptical critique must name every unresolved high-impact assumption");
  }
  return { unresolvedCriticalAssumptionIds };
}

export function validateLearningUpdate(previous: ProductMemoryDocument, next: ProductMemoryDocument): void {
  if (previous.schemaVersion === LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION || next.schemaVersion === LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION || previous.schemaVersion !== next.schemaVersion) {
    throw new SafetyKernelError("Learning updates require matching schema version 2 or 3 idea-validation documents");
  }
  const previousIdea = previous as ProductMemory | LegacyIdeaQualityProductMemory;
  const nextIdea = next as ProductMemory | LegacyIdeaQualityProductMemory;
  const oldClaims = new Map(previousIdea.ideaValidation.claims.map((claim) => [claim.id, claim]));
  const changed = nextIdea.ideaValidation.claims.filter((claim) => oldClaims.get(claim.id)?.status !== claim.status);
  if (!changed.length) throw new SafetyKernelError("Learning integration must update at least one existing claim status from feedback or metrics");
  if (changed.some((claim) => claim.status === "open" || !claim.learningEvidenceIds.length)) throw new SafetyKernelError("Learning claim conclusions require linked feedback or metric evidence");
}

function projectPath(root: string, configured: string): { absolute: string; relative: string } {
  const absolute = isAbsolute(configured) ? resolve(configured) : resolve(root, configured);
  const normalized = relative(root, absolute).split("\\").join("/");
  if (!normalized || normalized === ".." || normalized.startsWith("../")) throw new SafetyKernelError(`Product document path escapes project: ${configured}`);
  return { absolute, relative: normalized };
}

export async function loadDefinedProduct(root: string, paths: { readonly productMemory: string; readonly slcSpec: string }): Promise<DefinedProduct> {
  const memoryPath = projectPath(root, paths.productMemory);
  const slcPath = projectPath(root, paths.slcSpec);
  let memoryRaw: unknown;
  let slcRaw: unknown;
  try {
    [memoryRaw, slcRaw] = await Promise.all([readFile(memoryPath.absolute, "utf8"), readFile(slcPath.absolute, "utf8")]);
  } catch (error) {
    throw new SafetyKernelError("Product memory and SLC spec must both exist", { cause: error });
  }
  let memoryValue: unknown;
  let slcValue: unknown;
  try {
    memoryValue = JSON.parse(memoryRaw as string);
    slcValue = JSON.parse(slcRaw as string);
  } catch (error) {
    throw new SafetyKernelError("Product memory and SLC spec must contain valid JSON", { cause: error });
  }
  const memory = validateProductMemory(memoryValue);
  const slc = validateSlcSpec(slcValue);
  const artifacts = memory.schemaVersion === PRODUCT_MEMORY_SCHEMA_VERSION
    ? await Promise.all(memory.ideaValidation.discovery.records.filter((record) => record.artifactPath).map(async (record) => {
      const path = projectPath(root, record.artifactPath!).absolute;
      try { return { path: record.artifactPath!, hash: createHash("sha256").update(await readFile(path)).digest("hex") }; }
      catch (error) { throw new SafetyKernelError(`Discovery prototype artifact is missing or unreadable: ${record.artifactPath}`, { cause: error }); }
    }))
    : [];
  const fingerprint = createHash("sha256").update(JSON.stringify({ memory, slc, artifacts })).digest("hex");
  return { memory, slc, fingerprint, paths: { memory: memoryPath.relative, slc: slcPath.relative } };
}
