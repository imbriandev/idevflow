import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { definitionAcceptancePrompt } from "../extensions/idevflow/lifecycle/service.ts";
import { selectIntegrationSession } from "../extensions/idevflow/tools/lifecycle-tool.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";

function session(id: string, piSessionId: string, status: WriterSession["status"]): WriterSession {
  return { id, piSessionId, stage: "define", task: "private", risk: "medium", status, branch: `idev/${id}`, worktreePath: `/tmp/${id}`, baseCommit: "a".repeat(40), claims: ["docs"], createdAt: `2026-01-01T00:00:0${id}.000Z`, heartbeatAt: "2026-01-01T00:00:00.000Z", leaseExpiresAt: "2026-01-01T01:00:00.000Z" };
}

describe("definition acceptance prompt", () => {
  it("selects the only completed session even when it belongs to an earlier Pi chat", () => {
    assert.equal(selectIntegrationSession([session("1", "old-chat", "ready_for_integration"), session("2", "current-chat", "active")], "current-chat")?.id, "1");
    assert.equal(selectIntegrationSession([session("1", "old-chat", "ready_for_integration"), session("2", "other-chat", "ready_for_integration")], "current-chat"), undefined);
  });

  it("presents critique and all unresolved high-impact assumptions in one confirmation", () => {
    const prompt = definitionAcceptancePrompt(
      { alternative: "Use a checklist", adoptionRisk: "Founders may not switch", invalidatingSignal: "Testers prefer the checklist" },
      ["assumption-1", "assumption-2"],
    );
    assert.equal(prompt.title, "Accept definition and known risks?");
    assert.match(prompt.message, /Use a checklist/);
    assert.match(prompt.message, /assumption-1, assumption-2/);
    assert.match(prompt.message, /exact definition/);
  });
});
