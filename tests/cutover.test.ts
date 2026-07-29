import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

const RUNTIME_FORBIDDEN = /\bpython(?:3)?\b|\bpip(?:3)?\b|iosflow_runtime|\.py(?:\b|['"`])/i;

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]));
  return nested.flat();
}

describe("stable cutover gates", () => {
  it("ships no Python or AppForge runtime dependency", async () => {
    const root = process.cwd();
    const runtimeFiles = [...await files(join(root, "extensions")), ...await files(join(root, "skills")), join(root, "package.json")];
    for (const path of runtimeFiles) {
      const content = await readFile(path, "utf8");
      assert.doesNotMatch(content, RUNTIME_FORBIDDEN, `forbidden Python runtime reference in ${path}`);
    }
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
    const values = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {}), ...Object.values(manifest.scripts ?? {})].join("\n");
    assert.doesNotMatch(values, RUNTIME_FORBIDDEN);
  });
});
