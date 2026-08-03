import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";
import type { XcodeProjectDescriptor } from "../xcode/discovery.ts";

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

export type MacDistributionTarget = "mac-app-store" | "notarized";

export interface MacDistributionManifest {
  readonly schemaVersion: 1;
  readonly platform: "macos";
  readonly version: string;
  readonly build: string;
  readonly bundleId: string;
  readonly target: MacDistributionTarget;
  readonly releaseNotes: string;
  readonly knownIssues: readonly string[];
  readonly supportUrl: string;
  readonly privacyUrl: string;
  readonly security: {
    readonly entitlementsPath: string;
    readonly sandbox: true;
    readonly hardenedRuntime: true;
    readonly signingIdentity: string;
    readonly teamId: string;
    readonly notarizationProfile?: string;
  };
}

export interface MacSecurityGate {
  readonly status: "ready";
  readonly fingerprint: string;
  readonly entitlementsPath: string;
  readonly sandbox: true;
  readonly hardenedRuntime: true;
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

function https(value: unknown, label: string): string {
  const url = text(value, label);
  try { if (new URL(url).protocol !== "https:") throw new Error(); } catch { throw new SafetyKernelError(`${label} must be an HTTPS URL`); }
  return url;
}

function projectRelative(root: string, path: string, label: string): string {
  const absolute = resolve(root, path);
  const relativePath = resolve(root, absolute).slice(resolve(root).length + 1);
  if (!path || path.startsWith("/") || path.split(/[\\/]/).includes("..") || !relativePath) throw new SafetyKernelError(`${label} must be project-relative`);
  return path;
}

export async function loadMacDistributionManifest(root: string, configuredPath: string, expectedTarget: MacDistributionTarget): Promise<{ manifest: MacDistributionManifest; fingerprint: string; path: string }> {
  const raw = object(await json(resolve(root, configuredPath), "macOS release manifest"), "macOS release manifest");
  if (raw.schemaVersion !== 1 || raw.platform !== "macos") throw new SafetyKernelError("macOS release manifest must use schema 1 and platform macos");
  if (raw.target !== expectedTarget) throw new SafetyKernelError(`macOS release target ${String(raw.target)} does not match requested target ${expectedTarget}`);
  if (raw.target !== "mac-app-store" && raw.target !== "notarized") throw new SafetyKernelError("macOS release target is invalid");
  if (!Array.isArray(raw.knownIssues) || raw.knownIssues.some((item) => typeof item !== "string" || !item.trim())) throw new SafetyKernelError("knownIssues must be a string array");
  const security = object(raw.security, "macOS security manifest");
  const manifest: MacDistributionManifest = {
    schemaVersion: 1, platform: "macos", version: text(raw.version, "version"), build: text(raw.build, "build"), bundleId: text(raw.bundleId, "bundleId"), target: raw.target,
    releaseNotes: text(raw.releaseNotes, "releaseNotes"), knownIssues: raw.knownIssues.map((item) => String(item).trim()), supportUrl: https(raw.supportUrl, "supportUrl"), privacyUrl: https(raw.privacyUrl, "privacyUrl"),
    security: {
      entitlementsPath: projectRelative(root, text(security.entitlementsPath, "security.entitlementsPath"), "security.entitlementsPath"),
      sandbox: security.sandbox === true ? true : (() => { throw new SafetyKernelError("macOS security.sandbox must be true"); })(),
      hardenedRuntime: security.hardenedRuntime === true ? true : (() => { throw new SafetyKernelError("macOS security.hardenedRuntime must be true"); })(),
      signingIdentity: text(security.signingIdentity, "security.signingIdentity"), teamId: text(security.teamId, "security.teamId"),
      ...(security.notarizationProfile !== undefined ? { notarizationProfile: text(security.notarizationProfile, "security.notarizationProfile") } : {}),
    },
  };
  if (manifest.target === "notarized" && !manifest.security.notarizationProfile) throw new SafetyKernelError("Notarized macOS handoff requires a notarization profile name");
  return { manifest, fingerprint: fingerprint(manifest), path: configuredPath };
}

export async function validateMacSecurityGate(root: string, manifest: MacDistributionManifest, project: XcodeProjectDescriptor): Promise<MacSecurityGate> {
  if (project.platform !== "macos") throw new SafetyKernelError("macOS security gate requires a macOS Xcode project");
  if (project.entitlementsPath !== manifest.security.entitlementsPath) throw new SafetyKernelError("Mac entitlements path does not match the release manifest");
  if (project.hardenedRuntime !== true) throw new SafetyKernelError("macOS project must enable Hardened Runtime");
  const path = resolve(root, manifest.security.entitlementsPath);
  const source = await readFile(path, "utf8").catch((error) => { throw new SafetyKernelError(`Cannot read macOS entitlements at ${manifest.security.entitlementsPath}`, { cause: error }); });
  if (!/<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\s*\/>/s.test(source)) throw new SafetyKernelError("macOS entitlements must enable App Sandbox");
  return { status: "ready", fingerprint: fingerprint({ manifest: manifest.security, project: { container: project.container, scheme: project.scheme, hardenedRuntime: project.hardenedRuntime }, entitlements: source }), entitlementsPath: manifest.security.entitlementsPath, sandbox: true, hardenedRuntime: true };
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
