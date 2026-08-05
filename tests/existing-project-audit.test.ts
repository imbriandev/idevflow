import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { inspectExistingProject } from "../extensions/idevflow/recovery/existing-project.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("existing-project audit", () => {
  it("reports baseline and nested release markers without changing source", async () => {
    const fixture = await createGitFixture(); cleanups.push(fixture.cleanup);
    await mkdir(`${fixture.root}/App/Resources`, { recursive: true });
    await mkdir(`${fixture.root}/AppTests`);
    await writeFile(`${fixture.root}/App/Resources/Products.storekit`, "{}");
    await writeFile(`${fixture.root}/App/PrivacyInfo.xcprivacy`, "{}");
    const audit = await inspectExistingProject(await discoverRepository(fixture.root));
    assert.equal(audit.repository.baseline.ready, false);
    assert.match(audit.repository.baseline.problems.join("\n"), /uncommitted/);
    assert.deepEqual(audit.releaseInputs, ["PrivacyInfo.xcprivacy", "Products.storekit"]);
    assert.deepEqual(audit.testDirectories, ["AppTests"]);
  });
});
