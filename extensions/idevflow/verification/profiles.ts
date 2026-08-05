import type { Risk, Stage } from "../lifecycle/contracts.ts";

export const VERIFICATION_PROFILES = ["docs", "quick", "slice", "integration", "release"] as const;
export type VerificationProfile = (typeof VERIFICATION_PROFILES)[number];
export type ProofKind = "simulator" | "screenshot" | "accessibility" | "performance";

export interface VerificationProfileContract {
  readonly profile: VerificationProfile;
  readonly xcodeActions: readonly ("build" | "test")[];
  readonly swiftActions: readonly ("build" | "test")[];
  readonly requiredProofs: readonly ProofKind[];
  readonly reusable: boolean;
}

export const PROFILE_CONTRACTS: Readonly<Record<VerificationProfile, VerificationProfileContract>> = {
  docs: { profile: "docs", xcodeActions: [], swiftActions: [], requiredProofs: [], reusable: true },
  quick: { profile: "quick", xcodeActions: ["build"], swiftActions: ["build"], requiredProofs: [], reusable: true },
  slice: { profile: "slice", xcodeActions: ["build"], swiftActions: ["build", "test"], requiredProofs: [], reusable: true },
  integration: { profile: "integration", xcodeActions: ["build", "test"], swiftActions: ["build", "test"], requiredProofs: ["simulator"], reusable: true },
  release: { profile: "release", xcodeActions: ["build", "test"], swiftActions: ["build", "test"], requiredProofs: ["simulator", "screenshot", "accessibility", "performance"], reusable: false },
};

export function missingRequiredProofs(
  profile: VerificationProfile,
  proofs: readonly { readonly kind: ProofKind; readonly metadata: Readonly<Record<string, unknown>> }[],
  requiredScreenshotVariants: readonly string[],
  platform: "ios" | "macos" = "ios",
): ProofKind[] {
  const required = PROFILE_CONTRACTS[profile].requiredProofs.filter((kind) => platform === "ios" || kind !== "simulator");
  const missing = new Set(required.filter((kind) => !proofs.some((proof) => proof.kind === kind)));
  if (profile === "release") {
    const variants = new Set(proofs.filter((proof) => proof.kind === "screenshot").map((proof) => proof.metadata.variant));
    if (requiredScreenshotVariants.some((variant) => !variants.has(variant))) missing.add("screenshot");
  }
  return [...missing];
}

export function assertVerificationProfileSupported(_profile: VerificationProfile, _platform: "ios" | "macos"): void {
  // Platform-specific release gates run at the release boundary, not in xcodebuild verification.
}

export function selectVerificationProfile(input: {
  readonly stage: Stage;
  readonly risk: Risk;
  readonly changedFiles: readonly string[];
}): VerificationProfile {
  // Define, plan, and learn have docs-only claims; product risk never turns them into app verification.
  if (["define", "plan", "learn"].includes(input.stage)) return "docs";
  if (input.changedFiles.length > 0 && input.changedFiles.every((path) => /^(?:docs\/|README|.*\.md$)/i.test(path))) return "docs";
  if (input.stage === "ship" || input.risk === "critical") return "release";
  if (input.risk === "high") return "integration";
  if (input.risk === "low") return "quick";
  return "slice";
}
