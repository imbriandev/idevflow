import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { rm } from "node:fs/promises";
import { selectKnowledge } from "../extensions/appforge/context/knowledge.ts";
import { recordContextReceipt, requireContextReceipt } from "../extensions/appforge/context/receipts.ts";
import { initializeConfig } from "../extensions/appforge/config/config.ts";
import { discoverRepository } from "../extensions/appforge/repository/discovery.ts";
import { SessionRegistry } from "../extensions/appforge/sessions/registry.ts";
import type { WriterSession } from "../extensions/appforge/sessions/types.ts";
import { RuntimeStore } from "../extensions/appforge/state/runtime-store.ts";
import { verifySession } from "../extensions/appforge/verification/engine.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function highRiskSession() {
  const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
  const repository = await discoverRepository(fixture.root); const config = await initializeConfig(fixture.root); await new RuntimeStore(repository).initialize("test");
  const now = new Date().toISOString(); const session: WriterSession = { id: randomUUID(), piSessionId: "context", stage: "build", task: "Migrate sensitive SwiftData records", risk: "high", status: "active", branch: "main", worktreePath: fixture.root, baseCommit: repository.head!, claims: ["README.md"], createdAt: now, heartbeatAt: now, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() };
  await new SessionRegistry(repository).start(session, "test");
  return { fixture, repository, config, session };
}

describe("specialist context receipts", () => {
  it("fails high-risk verification before toolchain work until matching context is recorded", async () => {
    const { repository, config, session } = await highRiskSession();
    await assert.rejects(verifySession({ repository, config, session }), /specialist context receipt is required/);
    const selection = selectKnowledge({ stage: "build", risk: "high", task: session.task });
    const receipt = await recordContextReceipt(repository, { session, stage: "build", risk: "high", task: session.task, selection });
    assert.equal((await requireContextReceipt(repository, { session, stage: "build", risk: "high" }))?.id, receipt.id);
  });

  it("requires a separate critical ship receipt for release verification", async () => {
    const { repository, session } = await highRiskSession();
    await recordContextReceipt(repository, { session, stage: "build", risk: "high", task: session.task, selection: selectKnowledge({ stage: "build", risk: "high", task: session.task }) });
    await assert.rejects(requireContextReceipt(repository, { session, stage: "build", risk: "high", profile: "release" }), /ship specialist context receipt/);
    await recordContextReceipt(repository, { session, stage: "ship", risk: "critical", task: "Release privacy and accessibility decision", selection: selectKnowledge({ stage: "ship", risk: "critical", task: "Release privacy and accessibility decision" }) });
    assert.equal((await requireContextReceipt(repository, { session, stage: "build", risk: "high", profile: "release" }))?.stage, "ship");
  });
});
