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
import { verifyPlatformMatrix } from "../verification/matrix.ts";
import { readProofMetadata, type ProofInput } from "../verification/proofs.ts";
import { VERIFICATION_PROFILES } from "../verification/profiles.ts";

const ProofSchema = Type.Object({
  kind: StringEnum(["screenshot", "accessibility", "performance"] as const),
  path: Type.String(),
  metadataPath: Type.String(),
  platform: Type.Optional(StringEnum(["ios", "macos"] as const)),
});

function isWithin(root: string, path: string): boolean {
  const value = relative(root, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

export function registerVerificationTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "canopy_verify",
    label: "Canopy Verify",
    description: "Run adaptive, isolated, commit-bound Swift/Xcode verification and return a fingerprinted artifact receipt.",
    promptSnippet: "Run adaptive Xcode verification and produce a source-bound receipt",
    promptGuidelines: [
      "Use canopy_verify before canopy_session postflight for every write-capable Canopy session.",
      "Do not request a profile weaker than the stage, risk, and changed surface require.",
      "Use matrix=true when xcode.requiredPlatforms contains both iOS and macOS; tag platform-specific proofs with platform.",
    ],
    parameters: Type.Object({
      profile: Type.Optional(StringEnum(VERIFICATION_PROFILES)),
      proofs: Type.Optional(Type.Array(ProofSchema)),
      matrix: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (!session || session.status !== "active" || !leaseIsValid(session)) throw new SafetyKernelError("Verification requires an active, unexpired writer session");
      const proofInputs: Array<{ input: ProofInput; platform?: "ios" | "macos" }> = [];
      for (const proof of params.proofs ?? []) {
        const path = isAbsolute(proof.path) ? proof.path : resolve(session.worktreePath, proof.path);
        const metadataPath = isAbsolute(proof.metadataPath) ? proof.metadataPath : resolve(session.worktreePath, proof.metadataPath);
        const runtimeRoot = await realpath(resolve(repository.primaryRoot, ".canopy"));
        const worktreeRoot = await realpath(session.worktreePath);
        const canonicalPath = await realpath(path);
        const canonicalMetadataPath = await realpath(metadataPath);
        if ((!isWithin(worktreeRoot, canonicalPath) && !isWithin(runtimeRoot, canonicalPath)) || (!isWithin(worktreeRoot, canonicalMetadataPath) && !isWithin(runtimeRoot, canonicalMetadataPath))) {
          throw new SafetyKernelError("Proof and metadata paths must stay inside the writer worktree or local .canopy runtime");
        }
        proofInputs.push({ input: { kind: proof.kind, path, metadata: await readProofMetadata(metadataPath) }, ...(proof.platform ? { platform: proof.platform } : {}) });
      }
      const config = await loadConfig(repository.primaryRoot);
      const common = {
        repository, config, session,
        ...(params.profile ? { requestedProfile: params.profile } : {}),
        ...(signal ? { signal } : {}),
        onProgress(message: string) { onUpdate?.({ content: [{ type: "text", text: message }], details: { sessionId: session.id, progress: message } }); },
      };
      const receipt = params.matrix
        ? await verifyPlatformMatrix({ ...common, proofs: Object.fromEntries(config.xcode.requiredPlatforms.map((platform) => [platform, proofInputs.filter((proof) => !proof.platform || proof.platform === platform).map((proof) => proof.input)])) })
        : await verifySession({ ...common, proofs: proofInputs.map((proof) => proof.input) });
      const summary = receipt.success
        ? `${receipt.reused ? "Reused" : "Passed"} ${receipt.profile} verification. Fingerprint ${receipt.verificationFingerprint}.`
        : `Failed ${receipt.profile} verification. Inspect ${receipt.artifacts[0]?.path ?? "receipt artifacts"}.`;
      return { content: [{ type: "text", text: summary }], details: { receipt } };
    },
  });
}
