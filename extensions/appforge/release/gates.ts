import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";

export interface PrivacyGate {
  readonly status: "ready";
  readonly fingerprint: string;
  readonly path: string;
  readonly findings: number;
}

export interface MonetizationGate {
  readonly status: "not_required" | "ready";
  readonly required: boolean;
  readonly reasons: readonly string[];
  readonly fingerprint: string;
  readonly path?: string;
}

export interface ReleaseManifest {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly build: string;
  readonly bundleId: string;
  readonly target: "testflight-internal" | "testflight-external";
  readonly releaseNotes: string;
  readonly knownIssues: readonly string[];
  readonly supportUrl: string;
  readonly privacyUrl: string;
}

function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SafetyKernelError(`${label} must be a JSON object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new SafetyKernelError(`${label} must be a non-empty string`);
  return value.trim();
}
async function json(path: string, label: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { throw new SafetyKernelError(`Cannot read ${label} at ${path}`, { cause: error }); }
}

export async function validatePrivacyGate(root: string, configuredPath: string): Promise<PrivacyGate> {
  const raw = object(await json(resolve(root, configuredPath), "privacy review"), "privacy review");
  if (raw.schemaVersion !== 1 || raw.decision !== "go") throw new SafetyKernelError("Privacy review must use schema 1 and have a go decision");
  if (!Array.isArray(raw.dataPractices) || !Array.isArray(raw.permissions) || !Array.isArray(raw.findings)) throw new SafetyKernelError("Privacy review requires dataPractices, permissions, and findings arrays");
  for (const [index, practice] of raw.dataPractices.entries()) {
    const item = object(practice, `dataPractices[${index}]`);
    for (const key of ["data", "purpose", "storage", "retention", "deletion"] as const) text(item[key], `dataPractices[${index}].${key}`);
  }
  for (const [index, permission] of raw.permissions.entries()) {
    const item = object(permission, `permissions[${index}]`);
    for (const key of ["identifier", "purpose", "usageDescription"] as const) text(item[key], `permissions[${index}].${key}`);
  }
  for (const [index, finding] of raw.findings.entries()) {
    const item = object(finding, `findings[${index}]`);
    const severity = text(item.severity, `findings[${index}].severity`);
    const status = text(item.status, `findings[${index}].status`);
    if (!["critical", "high", "medium", "low"].includes(severity) || !["open", "accepted", "resolved"].includes(status)) throw new SafetyKernelError(`Privacy finding ${index} is invalid`);
    if ((severity === "critical" || severity === "high") && status !== "resolved") throw new SafetyKernelError("Privacy gate has unresolved critical or high findings");
    text(item.evidence, `findings[${index}].evidence`);
  }
  return { status: "ready", fingerprint: fingerprint(raw), path: configuredPath, findings: raw.findings.length };
}

async function swiftFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["DerivedData", "Pods", "Carthage"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".swift")) results.push(path);
    }
  }
  await walk(root);
  return results;
}

export async function validateMonetizationGate(root: string, configuredPath: string): Promise<MonetizationGate> {
  const reasons = new Set<string>();
  for (const path of await swiftFiles(root)) {
    const source = await readFile(path, "utf8");
    if (/\bimport\s+StoreKit\b|Product\.products\s*\(|\.purchase\s*\(/.test(source)) reasons.add("storekit_source");
    if (/\bimport\s+RevenueCat\b|Purchases\.configure\s*\(/.test(source)) reasons.add("revenuecat_source");
  }
  const path = resolve(root, configuredPath);
  let rawValue: unknown;
  try { rawValue = JSON.parse(await readFile(path, "utf8")); reasons.add("manifest_present"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SafetyKernelError("Monetization manifest is invalid", { cause: error });
    if (reasons.size) throw new SafetyKernelError("Monetization behavior was detected but its manifest is missing");
    return { status: "not_required", required: false, reasons: [], fingerprint: fingerprint({ required: false }) };
  }
  const raw = object(rawValue, "monetization manifest");
  if (raw.schemaVersion !== 1) throw new SafetyKernelError("Unsupported monetization manifest schema");
  if (!Array.isArray(raw.products) || raw.products.length === 0) throw new SafetyKernelError("Monetization manifest requires products");
  const productIds = raw.products.map((product, index) => text(object(product, `products[${index}]`).productId, `products[${index}].productId`));
  if (new Set(productIds).size !== productIds.length) throw new SafetyKernelError("Monetization product ids must be unique");
  const entitlement = text(raw.entitlement, "monetization entitlement");
  const paywallRevision = text(raw.paywallRevision, "paywallRevision");
  const appStoreSnapshot = text(raw.appStoreSnapshotFingerprint, "appStoreSnapshotFingerprint");
  const providerSnapshot = text(raw.providerSnapshotFingerprint, "providerSnapshotFingerprint");
  if (!Array.isArray(raw.requiredProofs) || !Array.isArray(raw.providedProofs)) throw new SafetyKernelError("Monetization manifest requires proof arrays");
  const required = raw.requiredProofs.map((item, index) => text(item, `requiredProofs[${index}]`));
  const provided = new Set(raw.providedProofs.map((item, index) => text(item, `providedProofs[${index}]`)));
  const missing = required.filter((proof) => !provided.has(proof));
  if (missing.length) throw new SafetyKernelError(`Monetization gate is missing proof: ${missing.join(", ")}`);
  const normalized = { schemaVersion: 1, entitlement, products: productIds, paywallRevision, appStoreSnapshot, providerSnapshot, requiredProofs: required, providedProofs: [...provided] };
  return { status: "ready", required: true, reasons: [...reasons].sort(), fingerprint: fingerprint(normalized), path: configuredPath };
}

export async function loadReleaseManifest(root: string, configuredPath: string, expectedTarget: string): Promise<{ manifest: ReleaseManifest; fingerprint: string; path: string }> {
  const raw = object(await json(resolve(root, configuredPath), "release manifest"), "release manifest");
  if (raw.schemaVersion !== 1) throw new SafetyKernelError("Unsupported release manifest schema");
  if (raw.target !== "testflight-internal" && raw.target !== "testflight-external") throw new SafetyKernelError("Release target is invalid");
  if (raw.target !== expectedTarget) throw new SafetyKernelError(`Release manifest target ${String(raw.target)} does not match requested target ${expectedTarget}`);
  if (!Array.isArray(raw.knownIssues) || raw.knownIssues.some((item) => typeof item !== "string" || !item.trim())) throw new SafetyKernelError("knownIssues must be a string array");
  for (const key of ["version", "build", "bundleId", "releaseNotes", "supportUrl", "privacyUrl"] as const) text(raw[key], key);
  for (const key of ["supportUrl", "privacyUrl"] as const) {
    try { const url = new URL(String(raw[key])); if (url.protocol !== "https:") throw new Error(); }
    catch { throw new SafetyKernelError(`${key} must be an HTTPS URL`); }
  }
  const manifest: ReleaseManifest = { schemaVersion: 1, version: text(raw.version, "version"), build: text(raw.build, "build"), bundleId: text(raw.bundleId, "bundleId"), target: raw.target, releaseNotes: text(raw.releaseNotes, "releaseNotes"), knownIssues: raw.knownIssues.map((item) => String(item).trim()), supportUrl: text(raw.supportUrl, "supportUrl"), privacyUrl: text(raw.privacyUrl, "privacyUrl") };
  return { manifest, fingerprint: fingerprint(manifest), path: configuredPath };
}
