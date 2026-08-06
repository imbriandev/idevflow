import type { CoordinatorSnapshot } from "./service.ts";

const SKILL_BY_ROUTE: Partial<Record<CoordinatorSnapshot["route"], string>> = {
  define: "idev-define",
  plan: "idev-plan",
  build: "idev-build",
  test: "idev-test",
  review: "idev-review",
  ship: "idev-ship",
  learn: "idev-learn",
  repair: "idev-test",
};

export function coordinatorBrief(snapshot: CoordinatorSnapshot): string {
  const skill = SKILL_BY_ROUTE[snapshot.route];
  const action = snapshot.route === "existing_audit"
    ? "Audit read-only. If the request already names a repair, validation, or feature outcome, then choose_continuation; it records adoption too."
    : snapshot.route === "existing_continuation"
      ? "Record the founder's repair, release-validation, or feature outcome now."
    : snapshot.route === "integrate_writer"
      ? snapshot.integrationReadyStage === "define"
        ? "Show the definition and ask for acceptance of its product risks before integration."
        : "Inspect evidence, then call idev_flow continue to integrate valid completed work. Repair a validation failure; preserve only when the founder asks to start over."
    : snapshot.route === "founder_plan_approval"
      ? "Explain the exact plan. Once the founder approves, call idev_flow approve_plan."
    : snapshot.route === "maintenance"
      ? "With a user-visible impact, call idev_flow start_maintenance, then plan."
    : skill ? `Follow ${skill}.` : "Explain the required decision; do not simulate completion.";
  return `[IDEVFLOW] ${snapshot.route}: ${action}
Kernel tools, not prose, advance gates. Keep their names and routine maintenance internal; execute clear reversible work now. Ask the founder only for an irreversible or ambiguous decision.`;
}
