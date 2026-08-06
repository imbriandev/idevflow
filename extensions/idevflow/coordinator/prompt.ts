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
  const worker = snapshot.workerRecommendation;
  const action = snapshot.route === "existing_audit"
    ? "Audit read-only. If the request already names a repair, validation, or feature outcome, then choose_continuation; it records adoption too."
    : snapshot.route === "existing_continuation"
      ? "Record the founder's repair, release-validation, or feature outcome now."
    : snapshot.route === "integrate_writer"
      ? snapshot.integrationReadyStage === "define"
        ? "Show the definition and ask for acceptance of its product risks before integration."
        : "Inspect evidence; integrate valid completed work now. Repair a validation failure; preserve only when the founder asks to start over."
    : snapshot.route === "maintenance"
      ? "With a user-visible impact, start maintenance now, then plan."
    : skill ? `Follow ${skill}.` : "Explain the required decision; do not simulate completion.";
  const dispatch = worker.mode === "pipeline_eligible" ? "Pipeline is available only if the founder asks to parallelize." : "Do not start a pipeline.";
  return `[IDEVFLOW] ${snapshot.route}: ${action}
${dispatch}
Kernel tools, not prose, advance gates. Keep their names and routine maintenance internal; execute clear reversible work now. Ask the founder only for an irreversible or ambiguous decision.`;
}
