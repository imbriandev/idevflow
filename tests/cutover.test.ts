import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

const RETIRED_IDENTIFIERS = [".app" + "forge", "App" + "Forge", "iosflow" + "_runtime"];
const RETIRED_NAMESPACE = new RegExp(["pi" + "-ios", "pi" + "_ios", "Pi " + "iOS"].join("|"), "i");
const RUNTIME_FORBIDDEN = new RegExp(["\\bpython(?:3)?\\b", "\\bpip(?:3)?\\b", "iosflow" + "_runtime", "\\.py(?:\\b|['\"`])"].join("|"), "i");

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]));
  return nested.flat();
}

describe("package identity gates", () => {
  it("ships only the iDevFlow TypeScript runtime and current namespace", async () => {
    const root = process.cwd();
    const publicFiles = [
      ...await files(join(root, "extensions")),
      ...await files(join(root, "skills")),
      ...await files(join(root, "references")),
      ...await files(join(root, "docs")),
      join(root, "README.md"),
      join(root, "package.json"),
      join(root, ".gitignore"),
      join(root, ".npmignore"),
    ];
    const retired = new RegExp(RETIRED_IDENTIFIERS.join("|"), "i");
    for (const path of publicFiles) {
      const content = await readFile(path, "utf8");
      assert.doesNotMatch(content, RUNTIME_FORBIDDEN, `forbidden non-TypeScript runtime reference in ${path}`);
      assert.doesNotMatch(content, retired, `retired identifier in ${path}`);
      if (!path.endsWith(join("config", "config.ts")) && !path.endsWith(join("docs", "installation.md")) && !path.endsWith(".gitignore") && !path.endsWith(".npmignore")) assert.doesNotMatch(content, RETIRED_NAMESPACE, `retired namespace in ${path}`);
    }
    const extensionDirectories = await readdir(join(root, "extensions"));
    assert.equal(extensionDirectories.includes("idevflow"), true);
    assert.equal(extensionDirectories.some((entry) => entry.toLowerCase() === "app" + "forge"), false);
  });
});
