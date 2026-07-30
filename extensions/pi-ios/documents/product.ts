import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";

export const LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION = 1 as const;
export const LEGACY_SLC_SPEC_SCHEMA_VERSION = 1 as const;
export const PRODUCT_MEMORY_SCHEMA_VERSION = 2 as const;
export const SLC_SPEC_SCHEMA_VERSION = 2 as const;

type ClaimKind = "founder_evidence" | "observed_feedback" | "assumption" | "unknown";
type ClaimStatus = "open" | "confirmed" | "weakened" | "disproven";
type Confidence = "low" | "medium" | "high";
type Impact = "low" | "medium" | "high" | "critical";

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
}

export interface ProductMemory extends ProductCore {
  readonly schemaVersion: typeof PRODUCT_MEMORY_SCHEMA_VERSION;
  readonly ideaValidation: {
    readonly learningQuestion: string;
    readonly primaryAssumptionId: string;
    readonly claims: readonly IdeaClaim[];
  };
}

export type ProductMemoryDocument = ProductMemory | LegacyProductMemory;

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
    };
  });
  if (new Set(result.map((claim) => claim.id)).size !== result.length) throw new SafetyKernelError("Idea claim ids must be unique");
  return result;
}

export function validateProductMemory(value: unknown): ProductMemoryDocument {
  const raw = object(value, "product memory");
  const core = productCore(raw);
  if (raw.schemaVersion === LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION) return { schemaVersion: LEGACY_PRODUCT_MEMORY_SCHEMA_VERSION, ...core };
  if (raw.schemaVersion !== PRODUCT_MEMORY_SCHEMA_VERSION) throw new SafetyKernelError("Unsupported product memory schema");
  const validation = object(raw.ideaValidation, "ideaValidation");
  const validatedClaims = claims(validation.claims);
  const primaryAssumptionId = text(validation.primaryAssumptionId, "ideaValidation.primaryAssumptionId");
  const primary = validatedClaims.find((claim) => claim.id === primaryAssumptionId);
  if (!primary || (primary.kind !== "assumption" && primary.kind !== "unknown") || primary.status !== "open") throw new SafetyKernelError("ideaValidation.primaryAssumptionId must reference an open assumption or unknown claim");
  return { schemaVersion: PRODUCT_MEMORY_SCHEMA_VERSION, ...core, ideaValidation: { learningQuestion: text(validation.learningQuestion, "ideaValidation.learningQuestion"), primaryAssumptionId, claims: validatedClaims } };
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
    throw new SafetyKernelError("New product definitions require product memory and SLC schema version 2 with idea validation fields");
  }
  const evidence = memory.ideaValidation.claims.filter((claim) => claim.kind === "founder_evidence" || claim.kind === "observed_feedback");
  if (!evidence.length) throw new SafetyKernelError("Idea validation requires at least one founder evidence or observed feedback claim");
  const unresolvedCriticalAssumptionIds = memory.ideaValidation.claims
    .filter((claim) => (claim.kind === "assumption" || claim.kind === "unknown") && claim.status === "open" && (claim.impact === "high" || claim.impact === "critical"))
    .map((claim) => claim.id);
  return { unresolvedCriticalAssumptionIds };
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
  const fingerprint = createHash("sha256").update(JSON.stringify({ memory, slc })).digest("hex");
  return { memory, slc, fingerprint, paths: { memory: memoryPath.relative, slc: slcPath.relative } };
}
