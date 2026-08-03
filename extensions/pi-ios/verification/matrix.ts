import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApplePlatform, PiIosConfig } from "../config/config.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import type { WriterSession } from "../sessions/types.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { sourceFingerprint } from "./fingerprint.ts";
import type { ProofInput } from "./proofs.ts";
import { VerificationReceiptStore } from "./receipts.ts";
import type { VerificationProfile } from "./profiles.ts";
import { verifySession } from "./engine.ts";
import type { VerificationReceipt } from "./types.ts";

export interface PlatformMatrixSummary {
  readonly verificationFingerprint: string;
  readonly sourceCommit: string;
  readonly profile: VerificationProfile;
  readonly success: boolean;
  readonly platforms: Readonly<Partial<Record<ApplePlatform, { readonly success: boolean; readonly verificationFingerprint: string }>>>;
  readonly finishedAt: string;
}

function summaryPath(repository: RepositoryDescriptor): string { return join(repository.primaryRoot, ".pi-ios", "receipts", "platform-matrix", "latest.json"); }

export async function loadLatestPlatformMatrix(repository: RepositoryDescriptor): Promise<PlatformMatrixSummary | undefined> {
  try { return JSON.parse(await readFile(summaryPath(repository), "utf8")) as PlatformMatrixSummary; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function verifyPlatformMatrix(input: {
  readonly repository: RepositoryDescriptor;
  readonly config: PiIosConfig;
  readonly session: WriterSession;
  readonly requestedProfile?: VerificationProfile;
  readonly proofs?: Readonly<Partial<Record<ApplePlatform, readonly ProofInput[]>>>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (message: string) => void;
}): Promise<VerificationReceipt> {
  const platforms = input.config.xcode.requiredPlatforms;
  if (platforms.length < 2) throw new SafetyKernelError("Platform matrix verification requires at least two configured platforms");
  const receipts: Partial<Record<ApplePlatform, VerificationReceipt>> = {};
  for (const platform of platforms) {
    input.onProgress?.(`Verifying ${platform} platform matrix entry`);
    receipts[platform] = await verifySession({
      repository: input.repository,
      config: { ...input.config, xcode: { ...input.config.xcode, platform } },
      session: input.session,
      ...(input.requestedProfile ? { requestedProfile: input.requestedProfile } : {}),
      proofs: input.proofs?.[platform] ?? [],
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    });
  }
  const children = platforms.map((platform) => receipts[platform]!);
  const source = await sourceFingerprint(input.session);
  if (children.some((receipt) => receipt.sourceCommit !== source.commit || receipt.sourceFingerprint !== source.fingerprint)) throw new SafetyKernelError("Platform receipts do not bind the same exact source");
  const profile = children[0]!.profile;
  if (children.some((receipt) => receipt.profile !== profile)) throw new SafetyKernelError("Platform receipts do not use the same verification profile");
  const receiptFingerprints = Object.fromEntries(platforms.map((platform) => [platform, receipts[platform]!.verificationFingerprint])) as Partial<Record<ApplePlatform, string>>;
  const configurationFingerprint = createHash("sha256").update(JSON.stringify(input.config)).digest("hex");
  const verificationFingerprint = createHash("sha256").update(JSON.stringify({ source, configurationFingerprint, profile, platforms, receiptFingerprints })).digest("hex");
  const receipt: VerificationReceipt = {
    schemaVersion: 1,
    id: randomUUID(),
    sessionId: input.session.id,
    profile,
    verificationFingerprint,
    sourceFingerprint: source.fingerprint,
    sourceCommit: source.commit,
    configurationFingerprint,
    toolchain: children[0]!.toolchain,
    platformMatrix: { requiredPlatforms: platforms, receiptFingerprints },
    startedAt: children.map((child) => child.startedAt).sort()[0]!,
    finishedAt: new Date().toISOString(),
    success: children.every((child) => child.success),
    reused: false,
    commands: children.flatMap((child) => child.commands),
    artifacts: children.flatMap((child) => child.artifacts),
    proofs: children.flatMap((child) => child.proofs),
  };
  await new VerificationReceiptStore(input.repository).save(verificationFingerprint, receipt);
  const summary: PlatformMatrixSummary = { verificationFingerprint, sourceCommit: source.commit, profile, success: receipt.success, platforms: Object.fromEntries(platforms.map((platform) => [platform, { success: receipts[platform]!.success, verificationFingerprint: receipts[platform]!.verificationFingerprint }])), finishedAt: receipt.finishedAt };
  await mkdir(join(input.repository.primaryRoot, ".pi-ios", "receipts", "platform-matrix"), { recursive: true, mode: 0o700 });
  await writeFileAtomically(summaryPath(input.repository), `${JSON.stringify(summary, null, 2)}\n`);
  return receipt;
}

export async function validatedPlatformReceipt(
  repository: RepositoryDescriptor,
  config: PiIosConfig,
  fingerprint: string,
  platform: ApplePlatform,
): Promise<VerificationReceipt | undefined> {
  const store = new VerificationReceiptStore(repository);
  const receipt = await store.validated(fingerprint);
  if (!receipt) return undefined;
  if (config.xcode.requiredPlatforms.length > 1) {
    const matrix = receipt.platformMatrix;
    if (!matrix || matrix.requiredPlatforms.length !== config.xcode.requiredPlatforms.length || config.xcode.requiredPlatforms.some((required) => !matrix.requiredPlatforms.includes(required))) return undefined;
    const childFingerprint = matrix.receiptFingerprints[platform];
    const child = childFingerprint ? await store.validated(childFingerprint) : undefined;
    return child && child.sourceCommit === receipt.sourceCommit && child.sourceFingerprint === receipt.sourceFingerprint && child.profile === receipt.profile ? child : undefined;
  }
  return receipt.project?.platform === platform || receipt.profile === "docs" ? receipt : undefined;
}
