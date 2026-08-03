import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { coordinatorBrief } from "../extensions/idevflow/coordinator/prompt.ts";
import { inspectCoordinator, isLikelyiDevFlowIntent, recommendWorkerDelegation } from "../extensions/idevflow/coordinator/service.ts";
import type { WorkSlice } from "../extensions/idevflow/planning/work-graph.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { RuntimeStore } from "../extensions/idevflow/state/runtime-store.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function slice(id: string, risk: WorkSlice["risk"], dependsOn: readonly string[] = []): WorkSlice {
  return { id, title: id, goal: id, paths: [`Sources/${id}.swift`], risk, dependsOn, acceptance: [id], verificationProfile: "slice" };
}

describe("conversational coordinator", () => {
  it("routes from durable lifecycle state without mutating it", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    assert.equal((await inspectCoordinator(repository, "coordinator")) .route, "initialize");

    const store = new RuntimeStore(repository);
    let state = await store.initialize("test");
    assert.equal((await inspectCoordinator(repository, "coordinator")).route, "define");
    state = await store.transition("defined", "defined", "test", state.revision);
    assert.equal((await inspectCoordinator(repository, "coordinator")).route, "plan");
    state = await store.transition("planned", "planned", "test", state.revision);
    assert.equal((await inspectCoordinator(repository, "coordinator")).route, "founder_plan_approval");
    state = await store.transition("plan_approved", "approved", "test", state.revision);
    const snapshot = await inspectCoordinator(repository, "coordinator");
    assert.equal(snapshot.route, "build");
    assert.equal(snapshot.lifecycle, "plan_approved");
  });

  it("prefers existing writer ownership and never exposes its task", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const state = await new RuntimeStore(repository).initialize("test");
    const now = new Date().toISOString();
    const secret = "build token=super-secret-never-display";
    const session: WriterSession = { id: randomUUID(), piSessionId: "other-agent", stage: "build", task: secret, risk: "medium", status: "active", branch: "idev/coordinator-test", worktreePath: fixture.root, baseCommit: repository.head!, claims: ["README.md"], createdAt: now, heartbeatAt: now, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() };
    await new SessionRegistry(repository).start(session, "test");
    const snapshot = await inspectCoordinator(repository, "coordinator");
    assert.equal(snapshot.route, "resume_writer");
    assert.doesNotMatch(JSON.stringify(snapshot), /super-secret-never-display/);
    assert.equal((await new RuntimeStore(repository).status())?.revision, state.revision);
  });

  it("permits only independent low/medium-risk work to be pipeline eligible", () => {
    assert.equal(recommendWorkerDelegation([slice("one", "low"), slice("two", "medium")]).mode, "pipeline_eligible");
    assert.equal(recommendWorkerDelegation([slice("one", "low"), slice("two", "high")]).mode, "pipeline_blocked_by_risk");
    assert.equal(recommendWorkerDelegation([slice("one", "low", ["earlier"]), slice("two", "medium")]).mode, "single_agent");
  });

  it("adds a conversational brief without treating prose as authority", () => {
    const brief = coordinatorBrief({ initialized: true, lifecycle: "planned", revision: 3, route: "founder_plan_approval", reason: "approval required", baselineReady: true, activeWriter: false, activePipeline: false, workerRecommendation: { mode: "pipeline_unavailable", reason: "approval required", eligibleSliceIds: [] } });
    assert.match(brief, /Never advance a lifecycle gate/);
    assert.equal(isLikelyiDevFlowIntent("I want to build an iOS app"), true);
    assert.equal(isLikelyiDevFlowIntent("Explain this generic TypeScript function"), false);
  });
});
