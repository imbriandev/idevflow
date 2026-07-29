import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { hashArtifact } from "../artifacts/manifest.ts";
import { SafetyKernelError } from "../state/errors.ts";
import type { ProofKind } from "./profiles.ts";
import type { QualityProof } from "./types.ts";
import { validateXCTestMetadata } from "./xctest-evidence.ts";

export interface ProofInput {
  readonly kind: Exclude<ProofKind, "simulator">;
  readonly path: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

function validateMetadata(kind: ProofInput["kind"], path: string, metadata: Readonly<Record<string, unknown>>): void {
  if (typeof metadata.sourceFingerprint !== "string" || !metadata.sourceFingerprint) {
    throw new SafetyKernelError(`${kind} proof requires a sourceFingerprint metadata value`);
  }
  if (kind === "screenshot") {
    if (extname(path).toLowerCase() !== ".png") throw new SafetyKernelError("Screenshot proof must be PNG");
    if (typeof metadata.variant !== "string" || !metadata.variant) throw new SafetyKernelError("Screenshot proof requires a variant metadata value");
  } else if (kind === "accessibility") {
    if (metadata.passed !== true || !Array.isArray(metadata.tests) || metadata.tests.length === 0 || metadata.tests.some((test) => typeof test !== "string" || !test)) {
      throw new SafetyKernelError("Accessibility proof requires passed=true and non-empty tests metadata");
    }
    validateXCTestMetadata(kind, metadata);
  } else if (kind === "performance") {
    if (metadata.passed !== true || !metadata.metrics || typeof metadata.metrics !== "object" || Object.values(metadata.metrics as Record<string, unknown>).some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new SafetyKernelError("Performance proof requires passed=true and finite numeric metrics metadata");
    }
    validateXCTestMetadata(kind, metadata);
  }
}

export async function collectProof(input: ProofInput, artifactDirectory: string): Promise<QualityProof> {
  validateMetadata(input.kind, input.path, input.metadata);
  const info = await stat(input.path);
  if (!info.isFile() || info.size === 0) throw new SafetyKernelError(`${input.kind} proof artifact must be a non-empty file`);
  if (input.kind === "screenshot") {
    const header = await readFile(input.path);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (header.length < 24 || !header.subarray(0, 8).equals(pngSignature) || header.readUInt32BE(16) < 1 || header.readUInt32BE(20) < 1) {
      throw new SafetyKernelError("Screenshot proof is not a valid non-empty PNG image");
    }
  }
  const directory = join(artifactDirectory, "proofs");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const qualifier = input.kind === "screenshot" ? `-${String(input.metadata.variant).replace(/[^a-z0-9-]+/gi, "-")}` : "";
  const destination = join(directory, `${input.kind}${qualifier}${extname(input.path).toLowerCase() || ".artifact"}`);
  await copyFile(input.path, destination);
  const metadataPath = join(directory, `${input.kind}${qualifier}.metadata.json`);
  await writeFile(metadataPath, `${JSON.stringify(input.metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { kind: input.kind, artifact: await hashArtifact(destination, "proof"), metadata: input.metadata };
}

export async function simulatorProof(
  metadata: Readonly<Record<string, unknown>>,
  artifactDirectory: string,
): Promise<QualityProof> {
  const directory = join(artifactDirectory, "proofs");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "simulator.json");
  await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { kind: "simulator", artifact: await hashArtifact(path, "proof"), metadata };
}

export async function readProofMetadata(path: string): Promise<Readonly<Record<string, unknown>>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SafetyKernelError(`Proof metadata at ${path} must be a JSON object`);
  return value as Readonly<Record<string, unknown>>;
}
