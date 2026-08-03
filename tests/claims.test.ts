import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertNoClaimConflicts, claimsOverlap, normalizeClaim, pathIsClaimed, resolveSafeWritePath } from "../extensions/canopy/git/claims.ts";

describe("path claims", () => {
  it("normalizes repository-relative claims and rejects escapes", () => {
    assert.equal(normalizeClaim("Sources/Feature", "/repo/worktree"), "Sources/Feature");
    assert.throws(() => normalizeClaim("../secret", "/repo/worktree"));
    assert.throws(() => normalizeClaim(".", "/repo/worktree"));
    assert.throws(() => normalizeClaim(".canopy/state", "/repo/worktree"), /protected control state/);
  });

  it("blocks write paths that cross symbolic links", async () => {
    const root = await mkdtemp(join(tmpdir(), "canopy-claims-"));
    const outside = await mkdtemp(join(tmpdir(), "canopy-outside-"));
    try {
      await mkdir(join(root, "Sources"));
      await symlink(outside, join(root, "Sources", "Linked"));
      await assert.rejects(resolveSafeWritePath("Sources/Linked/file.swift", root), /symbolic link/);
      assert.equal((await resolveSafeWritePath("Sources/New/file.swift", root)).projectPath, "Sources/New/file.swift");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("detects segment-aware overlap", () => {
    assert.equal(claimsOverlap("Sources/App", "Sources/App/File.swift"), true);
    assert.equal(claimsOverlap("Sources/App", "Sources/Application"), false);
    assert.equal(pathIsClaimed("Sources/App/File.swift", ["Sources/App"]), true);
  });

  it("rejects claims held by another owning session", () => {
    assert.throws(() => assertNoClaimConflicts(
      ["Sources/App/File.swift"],
      [{ id: "other", status: "active", claims: ["Sources/App"] }],
      "current",
    ));
  });
});
