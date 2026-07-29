import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";

export const CONFIG_SCHEMA_VERSION = 2 as const;

export interface XcodeConfig {
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
}

export const DEFAULT_CONFIG: PiIosConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  baseBranch: "main",
  integrationBranch: "pi-ios/integration",
  remote: "origin",
  leaseSeconds: 14_400,
  verificationTimeoutSeconds: 1_800,
  xcode: { configuration: "Debug" },
  simulator: { leaseSeconds: 7_200, keepBooted: true },
  verification: {
    receiptMaxAgeHours: 24,
    artifactRetentionDays: 14,
    requireXcresult: true,
    requiredScreenshotVariants: ["compact-light", "compact-dark", "accessibility-xxxl"],
  },
};

export function configPath(primaryRoot: string): string {
  return join(primaryRoot, ".appforge", "config.json");
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
  return validateConfig({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    baseBranch: raw.baseBranch ?? DEFAULT_CONFIG.baseBranch,
    integrationBranch: raw.integrationBranch ?? DEFAULT_CONFIG.integrationBranch,
    remote: raw.remote ?? DEFAULT_CONFIG.remote,
    leaseSeconds: raw.leaseSeconds ?? DEFAULT_CONFIG.leaseSeconds,
    verificationTimeoutSeconds: raw.verificationTimeoutSeconds ?? DEFAULT_CONFIG.verificationTimeoutSeconds,
    ...(raw.worktreeDirectory ? { worktreeDirectory: raw.worktreeDirectory } : {}),
    xcode: { ...DEFAULT_CONFIG.xcode, ...(typeof raw.xcode === "object" ? raw.xcode : {}) },
    simulator: { ...DEFAULT_CONFIG.simulator, ...(typeof raw.simulator === "object" ? raw.simulator : {}) },
    verification: { ...DEFAULT_CONFIG.verification, ...(typeof raw.verification === "object" ? raw.verification : {}) },
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
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 0 && raw.schemaVersion !== 1) {
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
  await mkdir(join(primaryRoot, ".appforge"), { recursive: true, mode: 0o700 });
  try {
    await access(path);
    return loadConfig(primaryRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFileAtomically(path, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  return DEFAULT_CONFIG;
}
