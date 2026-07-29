import type { SimulatorLease } from "../simulator/types.ts";
import type { SupervisedProcessResult } from "../process/supervisor.ts";
import type { XcodeProjectDescriptor } from "../xcode/discovery.ts";
import type { ToolchainDescriptor } from "../xcode/toolchain.ts";
import type { ProofKind, VerificationProfile } from "./profiles.ts";

export interface ArtifactRecord {
  readonly kind: "stdout" | "stderr" | "xcresult" | "proof" | "summary";
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface QualityProof {
  readonly kind: ProofKind;
  readonly artifact: ArtifactRecord;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface VerificationReceipt {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sessionId: string;
  readonly profile: VerificationProfile;
  readonly verificationFingerprint: string;
  readonly sourceFingerprint: string;
  readonly sourceCommit: string;
  readonly configurationFingerprint: string;
  readonly project?: XcodeProjectDescriptor;
  readonly toolchain: ToolchainDescriptor;
  readonly simulator?: SimulatorLease;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly success: boolean;
  readonly reused: boolean;
  readonly commands: readonly SupervisedProcessResult[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly proofs: readonly QualityProof[];
}
