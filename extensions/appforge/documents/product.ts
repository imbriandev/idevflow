import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";

export const PRODUCT_MEMORY_SCHEMA_VERSION = 1 as const;
export const SLC_SPEC_SCHEMA_VERSION = 1 as const;

export interface ProductMemory {
  readonly schemaVersion: typeof PRODUCT_MEMORY_SCHEMA_VERSION;
  readonly product: { readonly name: string; readonly targetUser: string; readonly problem: string; readonly promise: string };
  readonly principles: readonly string[];
  readonly decisions: readonly { readonly id: string; readonly decision: string; readonly rationale: string; readonly status: "active" | "superseded" }[];
}

export interface SlcSpec {
  readonly schemaVersion: typeof SLC_SPEC_SCHEMA_VERSION;
  readonly title: string;
  readonly simple: readonly string[];
  readonly lovable: readonly string[];
  readonly complete: readonly string[];
  readonly nonGoals: readonly string[];
  readonly successSignals: readonly string[];
  readonly risks: readonly string[];
}

export interface DefinedProduct {
  readonly memory: ProductMemory;
  readonly slc: SlcSpec;
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

export function validateProductMemory(value: unknown): ProductMemory {
  const raw = object(value, "product memory");
  if (raw.schemaVersion !== PRODUCT_MEMORY_SCHEMA_VERSION) throw new SafetyKernelError("Unsupported product memory schema");
  const product = object(raw.product, "product memory product");
  const decisions = Array.isArray(raw.decisions) ? raw.decisions.map((item, index) => {
    const decision = object(item, `decisions[${index}]`);
    const status = text(decision.status, `decisions[${index}].status`);
    if (status !== "active" && status !== "superseded") throw new SafetyKernelError(`decisions[${index}].status is invalid`);
    return { id: text(decision.id, `decisions[${index}].id`), decision: text(decision.decision, `decisions[${index}].decision`), rationale: text(decision.rationale, `decisions[${index}].rationale`), status: status as "active" | "superseded" };
  }) : [];
  if (new Set(decisions.map((item) => item.id)).size !== decisions.length) throw new SafetyKernelError("Product decision ids must be unique");
  return {
    schemaVersion: PRODUCT_MEMORY_SCHEMA_VERSION,
    product: { name: text(product.name, "product.name"), targetUser: text(product.targetUser, "product.targetUser"), problem: text(product.problem, "product.problem"), promise: text(product.promise, "product.promise") },
    principles: strings(raw.principles, "principles"),
    decisions,
  };
}

export function validateSlcSpec(value: unknown): SlcSpec {
  const raw = object(value, "SLC spec");
  if (raw.schemaVersion !== SLC_SPEC_SCHEMA_VERSION) throw new SafetyKernelError("Unsupported SLC spec schema");
  return {
    schemaVersion: SLC_SPEC_SCHEMA_VERSION,
    title: text(raw.title, "SLC title"),
    simple: strings(raw.simple, "simple"),
    lovable: strings(raw.lovable, "lovable"),
    complete: strings(raw.complete, "complete"),
    nonGoals: strings(raw.nonGoals, "nonGoals"),
    successSignals: strings(raw.successSignals, "successSignals"),
    risks: strings(raw.risks, "risks"),
  };
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
