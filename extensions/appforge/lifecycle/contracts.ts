export const STAGES = ["define", "plan", "build", "test", "review", "ship", "learn"] as const;

export type Stage = (typeof STAGES)[number];
export const RISKS = ["low", "medium", "high", "critical"] as const;
export type Risk = (typeof RISKS)[number];

export interface StageContract {
  readonly stage: Stage;
  readonly command: `ios:${Stage}`;
  readonly purpose: string;
  readonly writeCapable: boolean;
  readonly requiredEvidence: readonly string[];
  readonly forbidden: readonly string[];
  readonly defaultNext: string;
}

export const STAGE_CONTRACTS: Readonly<Record<Stage, StageContract>> = {
  define: {
    stage: "define",
    command: "ios:define",
    purpose: "Turn product uncertainty into a falsifiable SLC commitment.",
    writeCapable: true,
    requiredEvidence: ["target user, problem, and promise", "SLC path and non-goals", "spec path or no-spec reason"],
    forbidden: ["production code", "release configuration changes"],
    defaultNext: "/ios:plan",
  },
  plan: {
    stage: "plan",
    command: "ios:plan",
    purpose: "Create architecture decisions, vertical slices, and verification strategy.",
    writeCapable: true,
    requiredEvidence: ["architecture decisions", "slice graph", "risk, dependencies, and verification commands"],
    forbidden: ["production implementation", "opportunistic refactoring"],
    defaultNext: "founder plan approval, then /ios:build",
  },
  build: {
    stage: "build",
    command: "ios:build",
    purpose: "Implement one approved vertical slice in an authorized worktree.",
    writeCapable: true,
    requiredEvidence: ["session and claimed paths", "changed files", "commit-bound verification", "documentation sync"],
    forbidden: ["scope expansion", "writes outside claims", "completion without postflight"],
    defaultNext: "/ios:test or /ios:review",
  },
  test: {
    stage: "test",
    command: "ios:test",
    purpose: "Reproduce uncertainty, repair the smallest verified cause, and prove behavior.",
    writeCapable: true,
    requiredEvidence: ["reproduction or explicit no-repro", "regression result", "retest evidence"],
    forbidden: ["guessing before reproduction", "treating no-repro as pass"],
    defaultNext: "/ios:review",
  },
  review: {
    stage: "review",
    command: "ios:review",
    purpose: "Produce an evidence-linked product and engineering quality verdict.",
    writeCapable: false,
    requiredEvidence: ["findings by severity", "review surfaces", "machine-readable verdict", "recommended route"],
    forbidden: ["silent repo-wide expansion", "code changes without entering a write stage"],
    defaultNext: "candidate verification or /ios:build",
  },
  ship: {
    stage: "ship",
    command: "ios:ship",
    purpose: "Verify an exact candidate and prepare a deliberate TestFlight handoff.",
    writeCapable: false,
    requiredEvidence: ["candidate commit", "privacy status", "known issues", "fresh release verification", "Go/No-Go"],
    forbidden: ["unapproved promotion", "implicit push, upload, or distribution"],
    defaultNext: "/ios:learn",
  },
  learn: {
    stage: "learn",
    command: "ios:learn",
    purpose: "Turn feedback and delivery evidence into a focused next decision.",
    writeCapable: true,
    requiredEvidence: ["feedback themes", "now/later/not-do decisions", "next focus"],
    forbidden: ["treating every request as a requirement", "unapproved SLC expansion"],
    defaultNext: "/ios:define or /ios:plan",
  },
};

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}
