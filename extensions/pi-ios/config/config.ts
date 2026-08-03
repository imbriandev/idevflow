import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";

export const CONFIG_SCHEMA_VERSION = 7 as const;

export type ApplePlatform = "ios" | "macos";

export interface XcodeConfig {
  readonly platform: ApplePlatform;
  readonly requiredPlatforms: readonly ApplePlatform[];
  readonly container?: string;
  readonly scheme?: string;
  readonly destination?: string;
  readonly configuration: string;
}

export interface SimulatorConfig {
  readonly preferredName?: string;
  readonly leaseSeconds: number;
  readonly keepBooted: boolean;
}

export interface VerificationConfig {
  readonly receiptMaxAgeHours: number;
  readonly artifactRetentionDays: number;
  readonly requireXcresult: boolean;
  readonly requiredScreenshotVariants: readonly string[];
}

export interface QualityConfig {
  readonly requireXCTestEvidence: boolean;
  readonly performanceBudgets: Readonly<Record<string, number>>;
}

export interface DocumentConfig {
  readonly productMemory: string;
  readonly slcSpec: string;
  readonly workGraph: string;
  readonly privacyReview: string;
  readonly monetization: string;
  readonly releaseManifest: string;
}

export interface ReleaseConfig {
  readonly approvalTtlSeconds: number;
  readonly defaultTarget: "testflight-internal" | "testflight-external";
}

export interface PipelineConfig {
  readonly enabled: boolean;
  readonly maxSlices: number;
  readonly maxConcurrency: number;
  readonly maxBatchesPerRun: number;
  readonly maxRepairCycles: number;
  readonly maxWorkerAttempts: number;
  readonly workerTimeoutSeconds: number;
  readonly workerLeaseSeconds: number;
  readonly coordinatorLeaseSeconds: number;
  readonly candidateWorktreeDirectory?: string;
}

export interface PiIosConfig {
  readonly schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  readonly baseBranch: string;
  readonly integrationBranch: string;
  readonly remote: string;
  readonly leaseSeconds: number;
  readonly worktreeDirectory?: string;
  readonly verificationTimeoutSeconds: number;
  readonly xcode: XcodeConfig;
  readonly simulator: SimulatorConfig;
  readonly verification: VerificationConfig;
  readonly quality: QualityConfig;
  readonly documents: DocumentConfig;
  readonly release: ReleaseConfig;
  readonly pipeline: PipelineConfig;
}

export const DEFAULT_CONFIG: PiIosConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  baseBranch: "main",
  integrationBranch: "pi-ios/integration",
  remote: "origin",
  leaseSeconds: 14_400,
  verificationTimeoutSeconds: 1_800,
  xcode: { platform: "ios", requiredPlatforms: ["ios"], configuration: "Debug" },
  simulator: { leaseSeconds: 7_200, keepBooted: true },
  verification: {
    receiptMaxAgeHours: 24,
    artifactRetentionDays: 14,
    requireXcresult: true,
    requiredScreenshotVariants: ["compact-light", "compact-dark", "accessibility-xxxl"],
  },
  quality: { requireXCTestEvidence: true, performanceBudgets: {} },
  documents: {
    productMemory: "docs/pi-ios/product-memory.json",
    slcSpec: "docs/pi-ios/slc.json",
    workGraph: "docs/pi-ios/work-graph.json",
    privacyReview: "docs/pi-ios/privacy-review.json",
    monetization: "docs/pi-ios/monetization.json",
    releaseManifest: "docs/pi-ios/release.json",
  },
  release: { approvalTtlSeconds: 1_800, defaultTarget: "testflight-internal" },
  pipeline: {
    enabled: true,
    maxSlices: 12,
    maxConcurrency: 2,
    maxBatchesPerRun: 4,
    maxRepairCycles: 2,
    maxWorkerAttempts: 2,
    workerTimeoutSeconds: 3_600,
    workerLeaseSeconds: 300,
    coordinatorLeaseSeconds: 600,
  },
};

export function configPath(primaryRoot: string): string {
  return join(primaryRoot, ".pi-ios", "config.json");
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new SafetyKernelError(`Pi iOS config ${name} must be a non-empty string when set`);
  return value;
}

function positiveInteger(value: unknown, name: string, minimum = 1): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new SafetyKernelError(`Pi iOS config ${name} must be an integer of at least ${minimum}`);
  }
  return value as number;
}

export function validateConfig(value: unknown): PiIosConfig {
  if (!value || typeof value !== "object") throw new SafetyKernelError("Pi iOS config must be a JSON object");
  const config = value as Partial<PiIosConfig>;
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new SafetyKernelError(`Unsupported Pi iOS config schema: ${String(config.schemaVersion)}`);
  }
  for (const key of ["baseBranch", "integrationBranch", "remote"] as const) {
    optionalString(config[key], key);
  }
  positiveInteger(config.leaseSeconds, "leaseSeconds", 60);
  const verificationTimeoutSeconds = positiveInteger(config.verificationTimeoutSeconds, "verificationTimeoutSeconds");
  optionalString(config.worktreeDirectory, "worktreeDirectory");

  if (!config.xcode || typeof config.xcode !== "object") throw new SafetyKernelError("Pi iOS config xcode must be an object");
  if (config.xcode.platform !== "ios" && config.xcode.platform !== "macos") throw new SafetyKernelError("Pi iOS config xcode.platform must be ios or macos");
  if (!Array.isArray(config.xcode.requiredPlatforms) || config.xcode.requiredPlatforms.length === 0 || config.xcode.requiredPlatforms.some((platform) => platform !== "ios" && platform !== "macos") || new Set(config.xcode.requiredPlatforms).size !== config.xcode.requiredPlatforms.length || !config.xcode.requiredPlatforms.includes(config.xcode.platform)) throw new SafetyKernelError("Pi iOS config xcode.requiredPlatforms must contain unique ios/macos values including xcode.platform");
  optionalString(config.xcode.container, "xcode.container");
  optionalString(config.xcode.scheme, "xcode.scheme");
  optionalString(config.xcode.destination, "xcode.destination");
  optionalString(config.xcode.configuration, "xcode.configuration");

  if (!config.simulator || typeof config.simulator !== "object") throw new SafetyKernelError("Pi iOS config simulator must be an object");
  optionalString(config.simulator.preferredName, "simulator.preferredName");
  const simulatorLeaseSeconds = positiveInteger(config.simulator.leaseSeconds, "simulator.leaseSeconds", 60);
  if (typeof config.simulator.keepBooted !== "boolean") throw new SafetyKernelError("Pi iOS config simulator.keepBooted must be boolean");
  if (simulatorLeaseSeconds < verificationTimeoutSeconds * 2 + 300) {
    throw new SafetyKernelError("Pi iOS simulator lease must cover two verification actions plus a 300-second safety margin");
  }

  if (!config.verification || typeof config.verification !== "object") throw new SafetyKernelError("Pi iOS config verification must be an object");
  positiveInteger(config.verification.receiptMaxAgeHours, "verification.receiptMaxAgeHours");
  positiveInteger(config.verification.artifactRetentionDays, "verification.artifactRetentionDays");
  if (typeof config.verification.requireXcresult !== "boolean") throw new SafetyKernelError("Pi iOS config verification.requireXcresult must be boolean");
  if (!Array.isArray(config.verification.requiredScreenshotVariants) || config.verification.requiredScreenshotVariants.length === 0 || config.verification.requiredScreenshotVariants.some((variant) => typeof variant !== "string" || !variant)) {
    throw new SafetyKernelError("Pi iOS config verification.requiredScreenshotVariants must be a non-empty string array");
  }

  if (!config.quality || typeof config.quality !== "object") throw new SafetyKernelError("Pi iOS config quality must be an object");
  if (typeof config.quality.requireXCTestEvidence !== "boolean") throw new SafetyKernelError("Pi iOS config quality.requireXCTestEvidence must be boolean");
  if (!config.quality.performanceBudgets || typeof config.quality.performanceBudgets !== "object" || Array.isArray(config.quality.performanceBudgets)) throw new SafetyKernelError("Pi iOS config quality.performanceBudgets must be an object");
  for (const [metric, budget] of Object.entries(config.quality.performanceBudgets)) {
    if (!metric.trim() || !Number.isFinite(budget) || budget <= 0) throw new SafetyKernelError("Pi iOS config quality.performanceBudgets requires non-empty metric names and positive finite budgets");
  }

  if (!config.documents || typeof config.documents !== "object") throw new SafetyKernelError("Pi iOS config documents must be an object");
  for (const key of ["productMemory", "slcSpec", "workGraph", "privacyReview", "monetization", "releaseManifest"] as const) {
    const path = optionalString(config.documents[key], `documents.${key}`)!;
    if (path.startsWith("/") || path.split(/[\\/]/).includes("..")) throw new SafetyKernelError(`Pi iOS config documents.${key} must stay project-relative`);
  }
  if (!config.release || typeof config.release !== "object") throw new SafetyKernelError("Pi iOS config release must be an object");
  positiveInteger(config.release.approvalTtlSeconds, "release.approvalTtlSeconds", 60);
  if (config.release.defaultTarget !== "testflight-internal" && config.release.defaultTarget !== "testflight-external") {
    throw new SafetyKernelError("Pi iOS config release.defaultTarget is invalid");
  }
  if (!config.pipeline || typeof config.pipeline !== "object") throw new SafetyKernelError("Pi iOS config pipeline must be an object");
  if (typeof config.pipeline.enabled !== "boolean") throw new SafetyKernelError("Pi iOS config pipeline.enabled must be boolean");
  const maxSlices = positiveInteger(config.pipeline.maxSlices, "pipeline.maxSlices");
  const maxConcurrency = positiveInteger(config.pipeline.maxConcurrency, "pipeline.maxConcurrency");
  if (maxConcurrency > maxSlices || maxConcurrency > 8) throw new SafetyKernelError("pipeline.maxConcurrency must not exceed maxSlices or 8");
  positiveInteger(config.pipeline.maxBatchesPerRun, "pipeline.maxBatchesPerRun");
  positiveInteger(config.pipeline.maxRepairCycles, "pipeline.maxRepairCycles");
  positiveInteger(config.pipeline.maxWorkerAttempts, "pipeline.maxWorkerAttempts");
  positiveInteger(config.pipeline.workerTimeoutSeconds, "pipeline.workerTimeoutSeconds", 60);
  positiveInteger(config.pipeline.workerLeaseSeconds, "pipeline.workerLeaseSeconds", 60);
  positiveInteger(config.pipeline.coordinatorLeaseSeconds, "pipeline.coordinatorLeaseSeconds", 60);
  optionalString(config.pipeline.candidateWorktreeDirectory, "pipeline.candidateWorktreeDirectory");
  return config as PiIosConfig;
}

export async function loadConfig(primaryRoot: string): Promise<PiIosConfig> {
  const path = configPath(primaryRoot);
  try {
    return validateConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_CONFIG;
    if (error instanceof SyntaxError) throw new SafetyKernelError(`Invalid JSON in ${path}`, { cause: error });
    throw error;
  }
}

export interface ConfigMigrationPlan {
  readonly needed: boolean;
  readonly fromVersion: number;
  readonly toVersion: typeof CONFIG_SCHEMA_VERSION;
  readonly config?: PiIosConfig;
}

function migrateLegacy(raw: Record<string, unknown>): PiIosConfig {
  const legacyXcode = typeof raw.xcode === "object" && raw.xcode ? raw.xcode as Record<string, unknown> : {};
  const platform = legacyXcode.platform === "macos" ? "macos" : "ios";
  return validateConfig({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    baseBranch: raw.baseBranch ?? DEFAULT_CONFIG.baseBranch,
    integrationBranch: raw.integrationBranch ?? DEFAULT_CONFIG.integrationBranch,
    remote: raw.remote ?? DEFAULT_CONFIG.remote,
    leaseSeconds: raw.leaseSeconds ?? DEFAULT_CONFIG.leaseSeconds,
    verificationTimeoutSeconds: raw.verificationTimeoutSeconds ?? DEFAULT_CONFIG.verificationTimeoutSeconds,
    ...(raw.worktreeDirectory ? { worktreeDirectory: raw.worktreeDirectory } : {}),
    xcode: { ...DEFAULT_CONFIG.xcode, ...legacyXcode, requiredPlatforms: legacyXcode.requiredPlatforms ?? [platform] },
    simulator: { ...DEFAULT_CONFIG.simulator, ...(typeof raw.simulator === "object" ? raw.simulator : {}) },
    verification: { ...DEFAULT_CONFIG.verification, ...(typeof raw.verification === "object" ? raw.verification : {}) },
    quality: { ...DEFAULT_CONFIG.quality, ...(typeof raw.quality === "object" ? raw.quality : {}) },
    documents: { ...DEFAULT_CONFIG.documents, ...(typeof raw.documents === "object" ? raw.documents : {}) },
    release: { ...DEFAULT_CONFIG.release, ...(typeof raw.release === "object" ? raw.release : {}) },
    pipeline: { ...DEFAULT_CONFIG.pipeline, ...(typeof raw.pipeline === "object" ? raw.pipeline : {}) },
  });
}

export async function discoverConfigMigration(primaryRoot: string): Promise<ConfigMigrationPlan> {
  const path = configPath(primaryRoot);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { needed: false, fromVersion: CONFIG_SCHEMA_VERSION, toVersion: CONFIG_SCHEMA_VERSION };
    throw error;
  }
  if (raw.schemaVersion === CONFIG_SCHEMA_VERSION) {
    validateConfig(raw);
    return { needed: false, fromVersion: CONFIG_SCHEMA_VERSION, toVersion: CONFIG_SCHEMA_VERSION };
  }
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 0 && raw.schemaVersion !== 1 && raw.schemaVersion !== 2 && raw.schemaVersion !== 3 && raw.schemaVersion !== 4 && raw.schemaVersion !== 5 && raw.schemaVersion !== 6) {
    throw new SafetyKernelError(`No migration path from config schema ${String(raw.schemaVersion)}`);
  }
  return {
    needed: true,
    fromVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0,
    toVersion: CONFIG_SCHEMA_VERSION,
    config: migrateLegacy(raw),
  };
}

export async function applyConfigMigration(primaryRoot: string): Promise<PiIosConfig> {
  const plan = await discoverConfigMigration(primaryRoot);
  if (!plan.needed || !plan.config) return loadConfig(primaryRoot);
  const path = configPath(primaryRoot);
  await copyFile(path, `${path}.v${plan.fromVersion}.backup`);
  await writeFileAtomically(path, `${JSON.stringify(plan.config, null, 2)}\n`);
  return plan.config;
}

export async function initializeConfig(primaryRoot: string): Promise<PiIosConfig> {
  const path = configPath(primaryRoot);
  await mkdir(join(primaryRoot, ".pi-ios"), { recursive: true, mode: 0o700 });
  try {
    await access(path);
    return loadConfig(primaryRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFileAtomically(path, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  return DEFAULT_CONFIG;
}
