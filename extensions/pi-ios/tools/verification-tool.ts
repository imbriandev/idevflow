import { realpath } from "node:fs/promises";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { loadConfig } from "../config/config.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { leaseIsValid } from "../sessions/types.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { verifySession } from "../verification/engine.ts";
import { readProofMetadata, type ProofInput } from "../verification/proofs.ts";
import { VERIFICATION_PROFILES } from "../verification/profiles.ts";

const ProofSchema = Type.Object({
  kind: StringEnum(["screenshot", "accessibility", "performance"] as const),
  path: Type.String(),
  metadataPath: Type.String(),
});

function isWithin(root: string, path: string): boolean {
  const value = relative(root, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

export function registerVerificationTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pi_ios_verify",
    label: "Pi iOS Verify",
    description: "Run adaptive, isolated, commit-bound Swift/Xcode verification and return a fingerprinted artifact receipt.",
    promptSnippet: "Run adaptive Xcode verification and produce a source-bound receipt",
    promptGuidelines: [
      "Use pi_ios_verify before pi_ios_session postflight for every write-capable Pi iOS session.",
      "Do not request a profile weaker than the stage, risk, and changed surface require.",
    ],
    parameters: Type.Object({
      profile: Type.Optional(StringEnum(VERIFICATION_PROFILES)),
      proofs: Type.Optional(Type.Array(ProofSchema)),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (!session || session.status !== "active" || !leaseIsValid(session)) throw new SafetyKernelError("Verification requires an active, unexpired writer session");
      const proofInputs: ProofInput[] = [];
      for (const proof of params.proofs ?? []) {
        const path = isAbsolute(proof.path) ? proof.path : resolve(session.worktreePath, proof.path);
        const metadataPath = isAbsolute(proof.metadataPath) ? proof.metadataPath : resolve(session.worktreePath, proof.metadataPath);
        const runtimeRoot = await realpath(resolve(repository.primaryRoot, ".pi-ios"));
        const worktreeRoot = await realpath(session.worktreePath);
        const canonicalPath = await realpath(path);
        const canonicalMetadataPath = await realpath(metadataPath);
        if ((!isWithin(worktreeRoot, canonicalPath) && !isWithin(runtimeRoot, canonicalPath)) || (!isWithin(worktreeRoot, canonicalMetadataPath) && !isWithin(runtimeRoot, canonicalMetadataPath))) {
          throw new SafetyKernelError("Proof and metadata paths must stay inside the writer worktree or local .pi-ios runtime");
        }
        proofInputs.push({ kind: proof.kind, path, metadata: await readProofMetadata(metadataPath) });
      }
      const receipt = await verifySession({
        repository,
        config: await loadConfig(repository.primaryRoot),
        session,
        ...(params.profile ? { requestedProfile: params.profile } : {}),
        proofs: proofInputs,
        ...(signal ? { signal } : {}),
        onProgress(message) {
          onUpdate?.({ content: [{ type: "text", text: message }], details: { sessionId: session.id, progress: message } });
        },
      });
      const summary = receipt.success
        ? `${receipt.reused ? "Reused" : "Passed"} ${receipt.profile} verification. Fingerprint ${receipt.verificationFingerprint}.`
        : `Failed ${receipt.profile} verification. Inspect ${receipt.artifacts[0]?.path ?? "receipt artifacts"}.`;
      return { content: [{ type: "text", text: summary }], details: { receipt } };
    },
  });
}
