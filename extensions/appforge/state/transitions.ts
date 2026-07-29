import { InvalidTransitionError } from "./errors.ts";
import type { LifecycleState } from "./runtime-types.ts";

const FORWARD_TRANSITIONS: Readonly<Partial<Record<LifecycleState, readonly LifecycleState[]>>> = {
  idea: ["defined"],
  defined: ["planned"],
  planned: ["plan_approved"],
  plan_approved: ["building"],
  building: ["built", "blocked", "verification_failed", "parked"],
  built: ["building", "testing", "reviewing"],
  testing: ["tested", "fix_required", "blocked", "verification_failed", "parked"],
  tested: ["reviewing"],
  reviewing: ["review_passed", "fix_required", "blocked", "manual_decision_required"],
  review_passed: ["candidate_verified", "stale_candidate"],
  candidate_verified: ["ready_for_ship_approval", "stale_candidate"],
  ready_for_ship_approval: ["promoted", "stale_candidate"],
  promoted: ["testflight_handoff"],
  testflight_handoff: ["defined"],
  fix_required: ["building", "testing"],
  verification_failed: ["building", "testing"],
  stale_candidate: ["candidate_verified"],
  manual_decision_required: ["reviewing"],
  parked: ["building", "testing"],
};

export function assertTransitionAllowed(from: LifecycleState, to: LifecycleState): void {
  if (FORWARD_TRANSITIONS[from]?.includes(to)) return;
  throw new InvalidTransitionError(`Lifecycle transition ${from} -> ${to} is not allowed`);
}
