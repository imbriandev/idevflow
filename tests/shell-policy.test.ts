import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyReadOnlyShell, hardenManagedArgs, hardenReadOnlyShell, validateManagedCommand } from "../extensions/idevflow/policy/shell-policy.ts";

describe("shell policy", () => {
  it("allows bounded read-only inspection", () => {
    assert.equal(classifyReadOnlyShell("git status --short").allowed, true);
    assert.equal(classifyReadOnlyShell("rg 'needle' Sources").allowed, true);
    assert.equal(classifyReadOnlyShell("find Sources -name '*.swift'").allowed, true);
  });

  it("rejects compounds, expansions, and mutating commands", () => {
    for (const command of ["rm -rf .", "git commit -am x", "git diff --output=/tmp/leak", "cat a > b", "rg --pre sh x", "rg x | sh", "echo $(whoami)", "find . -delete"]) {
      assert.equal(classifyReadOnlyShell(command).allowed, false, command);
    }
  });

  it("limits managed build commands", () => {
    assert.doesNotThrow(() => validateManagedCommand("swift", ["test"]));
    assert.doesNotThrow(() => validateManagedCommand("xcodebuild", ["-scheme", "App", "test"]));
    assert.throws(() => validateManagedCommand("xcodebuild", ["archive"]));
    assert.throws(() => validateManagedCommand("git", ["push", "origin", "main"]));
    assert.throws(() => validateManagedCommand("xcrun", ["simctl", "erase", "all"]));
    assert.deepEqual(hardenManagedArgs("git", ["diff", "HEAD"]), ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "HEAD"]);
    assert.match(hardenReadOnlyShell("git diff HEAD"), /--no-ext-diff/);
  });
});
