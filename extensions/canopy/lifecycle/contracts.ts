export const STAGES = ["define", "plan", "build", "test", "review", "ship", "learn"] as const;

export type Stage = (typeof STAGES)[number];
export const RISKS = ["low", "medium", "high", "critical"] as const;
export type Risk = (typeof RISKS)[number];

export interface StageContract {
  readonly stage: Stage;
  readonly command: `canopy:${Stage}`;
  readonly purpose: string;
  readonly writeCapable: boolean;
  readonly requiredEvidence: readonly string[];
  readonly forbidden: readonly string[];
  readonly defaultNext: string;
}

export const STAGE_CONTRACTS: Readonly<Record<Stage, StageContract>> = {
  define: {
    stage: "define",
    command: "canopy:define",
    purpose: "Turn product uncertainty into a falsifiable SLC commitment.",
    writeCapable: true,
    requiredEvidence: ["target user, problem, and promise", "SLC path and non-goals", "spec path or no-spec reason"],
    forbidden: ["production code", "release configuration changes"],
    defaultNext: "/canopy:plan",
  },
  plan: {
    stage: "plan",
    command: "canopy:plan",
    purpose: "Create architecture decisions, vertical slices, and verification strategy.",
    writeCapable: true,
    requiredEvidence: ["architecture decisions", "slice graph", "risk, dependencies, and verification commands"],
    forbidden: ["production implementation", "opportunistic refactoring"],
    defaultNext: "founder plan approval, then /canopy:build",
  },
  build: {
    stage: "build",
    command: "canopy:build",
    purpose: "Implement one approved vertical slice in an authorized worktree.",
    writeCapable: true,
    requiredEvidence: ["session and claimed paths", "changed files", "commit-bound verification", "documentation sync"],
    forbidden: ["scope expansion", "writes outside claims", "completion without postflight"],
    defaultNext: "/canopy:test or /canopy:review",
  },
  test: {
    stage: "test",
    command: "canopy:test",
    purpose: "Reproduce uncertainty, repair the smallest verified cause, and prove behavior.",
    writeCapable: true,
    requiredEvidence: ["reproduction or explicit no-repro", "regression result", "retest evidence"],
    forbidden: ["guessing before reproduction", "treating no-repro as pass"],
    defaultNext: "/canopy:review",
  },
  review: {
    stage: "review",
    command: "canopy:review",
    purpose: "Produce an evidence-linked product and engineering quality verdict.",
    writeCapable: false,
    requiredEvidence: ["findings by severity", "review surfaces", "machine-readable verdict", "recommended route"],
    forbidden: ["silent repo-wide expansion", "code changes without entering a write stage"],
    defaultNext: "candidate verification or /canopy:build",
  },
  ship: {
    stage: "ship",
    command: "canopy:ship",
    purpose: "Verify an exact candidate and prepare a deliberate TestFlight handoff.",
    writeCapable: false,
    requiredEvidence: ["candidate commit", "privacy status", "known issues", "fresh release verification", "Go/No-Go"],
    forbidden: ["unapproved promotion", "implicit push, upload, or distribution"],
    defaultNext: "/canopy:learn",
  },
  learn: {
    stage: "learn",
    command: "canopy:learn",
    purpose: "Turn feedback and delivery evidence into a focused next decision.",
    writeCapable: true,
    requiredEvidence: ["feedback themes", "now/later/not-do decisions", "next focus"],
    forbidden: ["treating every request as a requirement", "unapproved SLC expansion"],
    defaultNext: "/canopy:define or /canopy:plan",
  },
};

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}
