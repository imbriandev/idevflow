import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyConfigMigration, DEFAULT_CONFIG, discoverConfigMigration, initializeConfig, loadConfig, validateConfig } from "../extensions/pi-ios/config/config.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("configuration", () => {
  it("initializes and reloads a versioned config atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    assert.deepEqual(await loadConfig(root), DEFAULT_CONFIG);
    assert.deepEqual(await initializeConfig(root), DEFAULT_CONFIG);
    assert.deepEqual(JSON.parse(await readFile(join(root, ".pi-ios", "config.json"), "utf8")), DEFAULT_CONFIG);
  });

  it("backs up and migrates a schema-zero config", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    await initializeConfig(root);
    const path = join(root, ".pi-ios", "config.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 0, baseBranch: "trunk", leaseSeconds: 600 }), "utf8");
    assert.equal((await discoverConfigMigration(root)).needed, true);
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.baseBranch, "trunk");
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(JSON.parse(await readFile(`${path}.v0.backup`, "utf8")).schemaVersion, 0);
  });

  it("migrates the milestone-3 schema with verification defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    await initializeConfig(root);
    const path = join(root, ".pi-ios", "config.json");
    await writeFile(path, JSON.stringify({
      schemaVersion: 1,
      baseBranch: "main",
      integrationBranch: "pi-ios/integration",
      remote: "origin",
      leaseSeconds: 14_400,
      verificationTimeoutSeconds: 1_800,
    }), "utf8");
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.schemaVersion, 5);
    assert.deepEqual(migrated.verification.requiredScreenshotVariants, ["compact-light", "compact-dark", "accessibility-xxxl"]);
  });

  it("migrates the milestone-4 schema with lifecycle defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    const path = join(root, ".pi-ios", "config.json");
    await initializeConfig(root);
    const legacy = { ...DEFAULT_CONFIG, schemaVersion: 2 } as Record<string, unknown>;
    delete legacy.documents;
    delete legacy.release;
    await writeFile(path, JSON.stringify(legacy), "utf8");
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(migrated.documents.workGraph, "docs/pi-ios/work-graph.json");
    assert.equal(migrated.release.defaultTarget, "testflight-internal");
  });

  it("migrates the milestone-5 schema with pipeline defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    const path = join(root, ".pi-ios", "config.json");
    await initializeConfig(root);
    const legacy = { ...DEFAULT_CONFIG, schemaVersion: 3 } as Record<string, unknown>;
    delete legacy.pipeline;
    await writeFile(path, JSON.stringify(legacy), "utf8");
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(migrated.pipeline.maxConcurrency, 2);
    assert.equal(migrated.pipeline.maxRepairCycles, 2);
  });

  it("migrates the specialist-knowledge schema with XCTest quality defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-config-"));
    roots.push(root);
    const path = join(root, ".pi-ios", "config.json");
    await initializeConfig(root);
    const legacy = { ...DEFAULT_CONFIG, schemaVersion: 4 } as Record<string, unknown>;
    delete legacy.quality;
    await writeFile(path, JSON.stringify(legacy), "utf8");
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(migrated.quality.requireXCTestEvidence, true);
  });

  it("rejects unknown schemas and unsafe lease values", () => {
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, schemaVersion: 99 }));
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, leaseSeconds: 1 }));
  });
});
