import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { coordinatorBrief } from "../extensions/idevflow/coordinator/prompt.ts";
import { founderStatus, inspectCoordinator, isLikelyiDevFlowIntent, stageForRoute } from "../extensions/idevflow/coordinator/service.ts";
import { formatCoordinatorDashboard } from "../extensions/idevflow/ui/status.ts";
import type { WorkSlice } from "../extensions/idevflow/planning/work-graph.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { SessionRegistry } from "../extensions/idevflow/sessions/registry.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import { RuntimeStore } from "../extensions/idevflow/state/runtime-store.ts";
import { adoptExistingProject, chooseExistingProjectContinuation, inspectExistingProject } from "../extensions/idevflow/recovery/existing-project.ts";
import { startMaintenance } from "../extensions/idevflow/lifecycle/service.ts";
import { createGitFixture } from "./helpers.ts";

const execFileAsync = promisify(execFile);
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

  it("routes an existing Apple project to a read-only audit before definition", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    await mkdir(`${fixture.root}/Sources`);
    await writeFile(`${fixture.root}/Sources/App.swift`, "struct App {}\n", "utf8");
    await execFileAsync("git", ["add", "Sources"], { cwd: fixture.root });
    await execFileAsync("git", ["-c", "user.name=iDevFlow Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "add app sources"], { cwd: fixture.root });
    const repository = await discoverRepository(fixture.root);
    await new RuntimeStore(repository).initialize("test");
    const snapshot = await inspectCoordinator(repository, "coordinator");
    assert.equal(snapshot.route, "existing_audit");
    assert.match(snapshot.reason, /read-only/);
    assert.match(coordinatorBrief(snapshot), /Audit read-only/);
    await adoptExistingProject(repository, "test");
    assert.equal((await inspectCoordinator(repository, "coordinator")).route, "existing_continuation");
    await chooseExistingProjectContinuation(repository, "repair", "Repair the observed subscription purchase failure.", "founder");
    const continuation = await inspectCoordinator(repository, "coordinator");
    assert.equal(continuation.route, "define");
    assert.match(continuation.reason, /subscription purchase failure/);
  });

  it("audits a dirty existing app with failing-test markers before baseline repair", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    await mkdir(`${fixture.root}/Sources`); await mkdir(`${fixture.root}/AppTests`);
    await writeFile(`${fixture.root}/Sources/App.swift`, "struct App {}\n");
    await writeFile(`${fixture.root}/AppTests/AppTests.swift`, "// known failing test: purchase lifecycle\n");
    const repository = await discoverRepository(fixture.root);
    await new RuntimeStore(repository).initialize("test");
    const snapshot = await inspectCoordinator(repository, "coordinator");
    assert.equal(snapshot.route, "existing_audit");
    assert.equal(snapshot.baselineReady, false);
    const audit = await inspectExistingProject(repository);
    assert.equal(audit.repository.baseline.clean, false);
    assert.deepEqual(audit.testDirectories, ["AppTests"]);
    assert.doesNotMatch(JSON.stringify(audit), /passed|verified/i);
  });

  it("routes a shipped product to explicit maintenance and requires a reason", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const store = new RuntimeStore(repository);
    let state = await store.initialize("test");
    for (const lifecycle of ["defined", "planned", "plan_approved", "building", "built", "testing", "tested", "reviewing", "review_passed", "candidate_verified", "ready_for_ship_approval", "promoted", "testflight_handoff"] as const) state = await store.transition(lifecycle, lifecycle, "test", state.revision);
    assert.equal((await inspectCoordinator(repository, "coordinator")).route, "maintenance");
    await assert.rejects(() => startMaintenance(repository, "test", ""));
    await startMaintenance(repository, "test", "Crash on launch after updating");
    assert.equal((await new RuntimeStore(repository).status())?.lifecycle, "defined");
  });

  it("reports existing writer ownership without exposing its task or mutating an expired lease", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const state = await new RuntimeStore(repository).initialize("test");
    const now = new Date().toISOString();
    const secret = "build token=super-secret-never-display";
    const session: WriterSession = { id: randomUUID(), piSessionId: "other-agent", stage: "build", task: secret, risk: "medium", status: "active", branch: "idev/coordinator-test", worktreePath: fixture.root, baseCommit: repository.head!, claims: ["README.md"], createdAt: now, heartbeatAt: now, leaseExpiresAt: new Date(Date.now() - 60_000).toISOString() };
    await new SessionRegistry(repository).start(session, "test");
    const snapshot = await inspectCoordinator(repository, "coordinator");
    assert.equal(snapshot.route, "resume_writer");
    assert.equal(snapshot.activeWriterStage, "build");
    assert.equal((await new SessionRegistry(repository).load()).sessions[session.id]?.status, "active");
    assert.doesNotMatch(JSON.stringify(snapshot), /super-secret-never-display/);
    assert.equal((await new RuntimeStore(repository).status())?.revision, state.revision);
  });

  it("routes completed sessions to founder integration without exposing their task", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    await new RuntimeStore(repository).initialize("test");
    const now = new Date().toISOString();
    await new SessionRegistry(repository).start({ id: randomUUID(), piSessionId: "completed-agent", stage: "define", task: "private product request", risk: "medium", status: "ready_for_integration", branch: "idev/complete", worktreePath: fixture.root, baseCommit: repository.head!, claims: ["docs"], createdAt: now, heartbeatAt: now, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() }, "test");
    const snapshot = await inspectCoordinator(repository, "coordinator");
    assert.equal(snapshot.route, "integrate_writer");
    assert.equal(snapshot.integrationReadyStage, "define");
    assert.doesNotMatch(JSON.stringify(snapshot), /private product request/);
    const brief = coordinatorBrief(snapshot);
    assert.match(brief, /Show the definition and ask for acceptance/);
    assert.doesNotMatch(brief, /private product request/);
  });

  it("shows founders a decision card without internal workflow nouns", () => {
    const snapshot = { initialized: true, lifecycle: "planned", revision: 3, route: "founder_plan_approval" as const, reason: "approval required", baselineReady: true, activeWriter: false };
    const brief = coordinatorBrief(snapshot);
    assert.match(brief, /idev_flow approve_plan/);
    assert.match(brief, /Kernel tools, not prose, advance gates/);
    assert.match(formatCoordinatorDashboard(snapshot), /Approve the build plan/);
    assert.match(formatCoordinatorDashboard(snapshot), /What this means: The build plan is ready/);
    assert.match(formatCoordinatorDashboard(snapshot), /You can say:/);
    assert.doesNotMatch(formatCoordinatorDashboard(snapshot), /route|receipt|worktree/i);
    assert.equal(founderStatus(snapshot).stage, "Approve the build plan");
    assert.match(founderStatus(snapshot).suggestedRequest, /plain language/);
    assert.equal(stageForRoute("build"), "build");
    assert.equal(stageForRoute("resume_writer"), undefined);
    assert.equal(isLikelyiDevFlowIntent("I want to build an iOS app"), true);
    assert.equal(isLikelyiDevFlowIntent("Explain this generic TypeScript function"), false);
  });
});
