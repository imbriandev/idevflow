import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { rm } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { initializeConfig } from "../extensions/appforge/config/config.ts";
import { registerToolGate } from "../extensions/appforge/policy/tool-gate.ts";
import { discoverRepository } from "../extensions/appforge/repository/discovery.ts";
import { writePreflight } from "../extensions/appforge/sessions/service.ts";
import { RuntimeStore } from "../extensions/appforge/state/runtime-store.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

type ToolCallHandler = (event: { toolName: string; input: Record<string, unknown> }, ctx: ExtensionContext) => Promise<{ block: true; reason?: string } | undefined>;

function captureGate(): ToolCallHandler {
  let handler: ToolCallHandler | undefined;
  const pi = {
    on(name: string, candidate: ToolCallHandler) {
      if (name === "tool_call") handler = candidate;
    },
  } as unknown as ExtensionAPI;
  registerToolGate(pi, () => ({ schemaVersion: 1, stage: "build" }));
  if (!handler) throw new Error("tool gate was not registered");
  return handler;
}

function context(cwd: string): ExtensionContext {
  return {
    cwd,
    sessionManager: { getSessionId: () => "pi-gate" },
  } as unknown as ExtensionContext;
}

describe("tool gate", () => {
  it("blocks writes before preflight and redirects only claimed writes afterward", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    await new RuntimeStore(repository).initialize("test");
    await initializeConfig(repository.primaryRoot);
    cleanups.push(async () => rm(`${fixture.root}.pi-ios-worktrees`, { recursive: true, force: true }));
    const gate = captureGate();
    const ctx = context(fixture.root);

    const before = await gate({ toolName: "write", input: { path: "README.md" } }, ctx);
    assert.equal(before?.block, true);

    const session = await writePreflight(repository, {
      piSessionId: "pi-gate",
      stage: "build",
      task: "gate",
      risk: "medium",
      paths: ["README.md"],
    });
    const claimedInput: Record<string, unknown> = { path: "README.md" };
    assert.equal(await gate({ toolName: "write", input: claimedInput }, ctx), undefined);
    assert.equal(claimedInput.path, `${session.worktreePath}/README.md`);

    const outside = await gate({ toolName: "edit", input: { path: "Sources/Other.swift" } }, ctx);
    assert.equal(outside?.block, true);
  });

  it("blocks mutating shell and routes read-only shell to the writer worktree", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    await new RuntimeStore(repository).initialize("test");
    await initializeConfig(repository.primaryRoot);
    cleanups.push(async () => rm(`${fixture.root}.pi-ios-worktrees`, { recursive: true, force: true }));
    const session = await writePreflight(repository, {
      piSessionId: "pi-gate",
      stage: "build",
      task: "shell gate",
      risk: "medium",
      paths: ["README.md"],
    });
    const gate = captureGate();
    const ctx = context(fixture.root);
    assert.equal((await gate({ toolName: "bash", input: { command: "rm -rf ." } }, ctx))?.block, true);
    const readInput: Record<string, unknown> = { command: "git status --short" };
    assert.equal(await gate({ toolName: "bash", input: readInput }, ctx), undefined);
    assert.match(String(readInput.command), new RegExp(`^cd .*${session.worktreePath.split("/").pop()}`));
  });
});
