import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertArtifactContainsNoSecrets } from "../extensions/idevflow/artifacts/security.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("artifact secret scanning", () => {
  it("fails closed when a nested artifact contains a credential", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-artifact-"));
    roots.push(root);
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "log.txt"), "api_key=do-not-persist\n");
    await assert.rejects(assertArtifactContainsNoSecrets(root), /Sensitive value/);
  });

  it("accepts ordinary build evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-artifact-"));
    roots.push(root);
    await writeFile(join(root, "log.txt"), "BUILD SUCCEEDED\n");
    await assertArtifactContainsNoSecrets(root);
    assert.ok(true);
  });
});
