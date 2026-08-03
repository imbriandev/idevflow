import type { CoordinatorSnapshot } from "./service.ts";

const SKILL_BY_ROUTE: Partial<Record<CoordinatorSnapshot["route"], string>> = {
  define: "canopy-define",
  plan: "canopy-plan",
  build: "canopy-build",
  test: "canopy-test",
  review: "canopy-review",
  ship: "canopy-ship",
  learn: "canopy-learn",
  repair: "canopy-test",
};

export function coordinatorBrief(snapshot: CoordinatorSnapshot): string {
  const skill = SKILL_BY_ROUTE[snapshot.route];
  const worker = snapshot.workerRecommendation;
  const action = skill
    ? `Read and follow the available ${skill} skill for the founder request.`
    : "Explain the required founder decision or recovery action; do not simulate completion.";
  const dispatch = worker.mode === "pipeline_eligible"
    ? "If the founder explicitly asks to build the approved plan or parallelize work, the existing pipeline may be created and run for its exact approved graph."
    : "Do not create or run a pipeline unless the deterministic pipeline gate later permits it.";
  return `[CANOPY COORDINATOR]
Lifecycle: ${snapshot.lifecycle ?? "uninitialized"}${snapshot.revision ? ` (runtime r${snapshot.revision})` : ""}
Next safe route: ${snapshot.route}
Reason: ${snapshot.reason}
Required platforms: ${snapshot.requiredPlatforms?.join(", ") ?? "not configured"}
Platform evidence: ${snapshot.platformStatus ? Object.entries(snapshot.platformStatus).map(([platform, status]) => `${platform}=${status}`).join(", ") : "none"}
Worker policy: ${worker.mode}; ${worker.reason}
${action}
${dispatch}
Runtime state, receipts, approved graphs, and kernel tools are authoritative. Never advance a lifecycle gate, approval, integration, promotion, push, upload, or distribution from prose. Do not ask the founder to memorize slash commands; guide the next safe conversational step instead.`;
}
