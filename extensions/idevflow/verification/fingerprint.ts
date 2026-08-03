import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { relative } from "node:path";
import { promisify } from "node:util";
import type { iDevFlowConfig } from "../config/config.ts";
import { changedFiles, fingerprintChanges } from "../git/changes.ts";
import type { WriterSession } from "../sessions/types.ts";
import type { SimulatorLease } from "../simulator/types.ts";
import type { ToolchainDescriptor } from "../xcode/toolchain.ts";
import type { XcodeProjectDescriptor } from "../xcode/discovery.ts";
import type { VerificationProfile } from "./profiles.ts";

const execFileAsync = promisify(execFile);

export async function sourceFingerprint(session: WriterSession): Promise<{ commit: string; fingerprint: string }> {
  const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: session.worktreePath, encoding: "utf8" })).stdout.trim();
  const files = await changedFiles(session.worktreePath);
  const dirty = await fingerprintChanges(session.worktreePath, files);
  return { commit: head, fingerprint: createHash("sha256").update(JSON.stringify({ head, files, dirty })).digest("hex") };
}

export function verificationFingerprint(input: {
  readonly source: string;
  readonly config: iDevFlowConfig;
  readonly project?: XcodeProjectDescriptor;
  readonly toolchain: ToolchainDescriptor;
  readonly simulator?: SimulatorLease;
  readonly profile: VerificationProfile;
  readonly proofFingerprint?: string;
  readonly contextReceiptFingerprint?: string;
}): { fingerprint: string; configFingerprint: string } {
  const configFingerprint = createHash("sha256").update(JSON.stringify(input.config)).digest("hex");
  const value = {
    source: input.source,
    configFingerprint,
    project: input.project ? { kind: input.project.kind, container: relative(input.project.root, input.project.container), scheme: input.project.scheme } : null,
    toolchain: input.toolchain.fingerprint,
    destination: input.simulator ? `${input.simulator.udid}:${input.simulator.runtimeVersion}` : "host",
    profile: input.profile,
    proofFingerprint: input.proofFingerprint ?? null,
    contextReceiptFingerprint: input.contextReceiptFingerprint ?? null,
  };
  return { fingerprint: createHash("sha256").update(JSON.stringify(value)).digest("hex"), configFingerprint };
}
