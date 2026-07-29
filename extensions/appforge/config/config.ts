import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";

export const CONFIG_SCHEMA_VERSION = 1 as const;

export interface PiIosConfig {
  readonly schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  readonly baseBranch: string;
  readonly integrationBranch: string;
  readonly remote: string;
  readonly leaseSeconds: number;
  readonly worktreeDirectory?: string;
  readonly verificationTimeoutSeconds: number;
}

export const DEFAULT_CONFIG: PiIosConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  baseBranch: "main",
  integrationBranch: "pi-ios/integration",
  remote: "origin",
  leaseSeconds: 14_400,
  verificationTimeoutSeconds: 1_800,
};

export function configPath(primaryRoot: string): string {
  return join(primaryRoot, ".appforge", "config.json");
}

export function validateConfig(value: unknown): PiIosConfig {
  if (!value || typeof value !== "object") throw new SafetyKernelError("Pi iOS config must be a JSON object");
  const config = value as Partial<PiIosConfig>;
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new SafetyKernelError(`Unsupported Pi iOS config schema: ${String(config.schemaVersion)}`);
  }
  for (const key of ["baseBranch", "integrationBranch", "remote"] as const) {
    if (typeof config[key] !== "string" || config[key]!.trim().length === 0) {
      throw new SafetyKernelError(`Pi iOS config ${key} must be a non-empty string`);
    }
  }
  if (!Number.isInteger(config.leaseSeconds) || config.leaseSeconds! < 60) {
    throw new SafetyKernelError("Pi iOS config leaseSeconds must be an integer of at least 60");
  }
  if (!Number.isInteger(config.verificationTimeoutSeconds) || config.verificationTimeoutSeconds! < 1) {
    throw new SafetyKernelError("Pi iOS config verificationTimeoutSeconds must be a positive integer");
  }
  if (config.worktreeDirectory !== undefined && (typeof config.worktreeDirectory !== "string" || !config.worktreeDirectory.trim())) {
    throw new SafetyKernelError("Pi iOS config worktreeDirectory must be a non-empty path when set");
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
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 0) {
    throw new SafetyKernelError(`No migration path from config schema ${String(raw.schemaVersion)}`);
  }
  const migrated: PiIosConfig = validateConfig({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    baseBranch: raw.baseBranch ?? DEFAULT_CONFIG.baseBranch,
    integrationBranch: raw.integrationBranch ?? DEFAULT_CONFIG.integrationBranch,
    remote: raw.remote ?? DEFAULT_CONFIG.remote,
    leaseSeconds: raw.leaseSeconds ?? DEFAULT_CONFIG.leaseSeconds,
    verificationTimeoutSeconds: raw.verificationTimeoutSeconds ?? DEFAULT_CONFIG.verificationTimeoutSeconds,
    ...(raw.worktreeDirectory ? { worktreeDirectory: raw.worktreeDirectory } : {}),
  });
  return { needed: true, fromVersion: 0, toVersion: CONFIG_SCHEMA_VERSION, config: migrated };
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
