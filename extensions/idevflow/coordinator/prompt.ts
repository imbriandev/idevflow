import { founderStatus, type CoordinatorSnapshot } from "./service.ts";

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
    ? "Call idev_doctor with action=audit for a read-only audit of the existing Apple-platform project. Do not write files, advance lifecycle state, or claim tests/review/release evidence. Report findings, then ask whether the founder wants to acknowledge adoption with idev_runtime action=adopt_existing."
    : snapshot.route === "existing_continuation"
      ? "Ask the founder to select exactly one near-term outcome — repair, release validation, or feature work — and record it with idev_runtime action=choose_continuation. Do not plan or create a writer session yet."
    : snapshot.route === "integrate_writer"
      ? "Present the founder choices: accept the completed work, repair its validation issue, or keep it and start over. Inspect its receipt before acceptance; use idev_lifecycle integrate only after acceptance, idev_session reopen for repair, or idev_session preserve to keep it. Do not start a new writer until the completed work is resolved."
    : snapshot.route === "maintenance"
      ? "Ask whether the founder is recording learning or starting a maintenance change. For a bug or change, require its user-visible impact and call idev_lifecycle action=start_maintenance before planning; do not bypass plan approval."
    : skill
      ? `Read and follow the available ${skill} skill for the founder request.`
      : "Explain the required founder decision or recovery action; do not simulate completion.";
  const dispatch = worker.mode === "pipeline_eligible"
    ? "If the founder explicitly asks to build the approved plan or parallelize work, the existing pipeline may be created and run for its exact approved graph."
    : "Do not create or run a pipeline unless the deterministic pipeline gate later permits it.";
  const founder = founderStatus(snapshot);
  return `[IDEVFLOW COORDINATOR]
Founder status: ${founder.stage}
What this means: ${founder.meaning}
Current checkpoint: ${founder.blocked}
Choices: ${founder.choices.join(" | ")}
Suggested founder wording: ${founder.suggestedRequest}
${action}
${dispatch}
Runtime state, receipts, approved graphs, and kernel tools are authoritative. Never advance a lifecycle gate, approval, integration, promotion, push, upload, or distribution from prose. Explain a checkpoint in product language before asking for a decision. Ask the founder only for the displayed decision; never require a command, session ID, worktree, claim, receipt fingerprint, or other implementation detail.`;
}
