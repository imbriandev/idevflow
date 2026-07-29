import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyConfigMigration, DEFAULT_CONFIG, discoverConfigMigration, initializeConfig, loadConfig, validateConfig } from "../extensions/appforge/config/config.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("configuration", () => {
  it("initializes and reloads a versioned config atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    assert.deepEqual(await loadConfig(root), DEFAULT_CONFIG);
    assert.deepEqual(await initializeConfig(root), DEFAULT_CONFIG);
    assert.deepEqual(JSON.parse(await readFile(join(root, ".appforge", "config.json"), "utf8")), DEFAULT_CONFIG);
  });

  it("backs up and migrates a schema-zero config", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    await initializeConfig(root);
    const path = join(root, ".appforge", "config.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 0, baseBranch: "trunk", leaseSeconds: 600 }), "utf8");
    assert.equal((await discoverConfigMigration(root)).needed, true);
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.baseBranch, "trunk");
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(JSON.parse(await readFile(`${path}.v0.backup`, "utf8")).schemaVersion, 0);
  });

  it("rejects unknown schemas and unsafe lease values", () => {
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, schemaVersion: 2 }));
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, leaseSeconds: 1 }));
  });
});
