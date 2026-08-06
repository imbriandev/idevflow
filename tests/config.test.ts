import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyConfigMigration, CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG, discoverConfigMigration, initializeConfig, loadConfig, validateConfig } from "../extensions/idevflow/config/config.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("configuration", () => {
  it("initializes and reloads a versioned config atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    assert.deepEqual(await loadConfig(root), DEFAULT_CONFIG);
    assert.deepEqual(await initializeConfig(root), DEFAULT_CONFIG);
    assert.deepEqual(JSON.parse(await readFile(join(root, ".idevflow", "config.json"), "utf8")), DEFAULT_CONFIG);
  });

  it("defaults to one founder run and minimal internal-beta evidence", () => {
    assert.equal(DEFAULT_CONFIG.release.evidence, "internal");
    assert.equal(DEFAULT_CONFIG.quality.requireXCTestEvidence, false);
    assert.deepEqual(DEFAULT_CONFIG.verification.requiredScreenshotVariants, []);
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, release: { ...DEFAULT_CONFIG.release, evidence: "full" } }), /Full release evidence/);
  });

  it("atomically adopts legacy runtime state and fails closed on conflicting roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    await mkdir(join(root, ".pi-ios"));
    await writeFile(join(root, ".pi-ios", "config.json"), JSON.stringify(DEFAULT_CONFIG));
    assert.deepEqual(await loadConfig(root), DEFAULT_CONFIG);
    await assert.rejects(readFile(join(root, ".pi-ios", "config.json")), /ENOENT/);
    await mkdir(join(root, ".pi-ios"));
    await assert.rejects(loadConfig(root), /legacy iDevFlow runtime and \.idevflow both exist/);
  });

  it("migrates the previous Canopy runtime directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    await mkdir(join(root, ".canopy"));
    await writeFile(join(root, ".canopy", "config.json"), JSON.stringify(DEFAULT_CONFIG));
    assert.deepEqual(await loadConfig(root), DEFAULT_CONFIG);
    await assert.rejects(readFile(join(root, ".canopy", "config.json")), /ENOENT/);
    assert.deepEqual(JSON.parse(await readFile(join(root, ".idevflow", "config.json"), "utf8")), DEFAULT_CONFIG);
  });

  it("backs up and migrates a schema-zero config", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    await initializeConfig(root);
    const path = join(root, ".idevflow", "config.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 0, baseBranch: "trunk", leaseSeconds: 600 }), "utf8");
    assert.equal((await discoverConfigMigration(root)).needed, true);
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.baseBranch, "trunk");
    assert.equal(migrated.schemaVersion, CONFIG_SCHEMA_VERSION);
    assert.equal(JSON.parse(await readFile(`${path}.v0.backup`, "utf8")).schemaVersion, 0);
  });

  it("migrates the milestone-3 schema with verification defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    await initializeConfig(root);
    const path = join(root, ".idevflow", "config.json");
    await writeFile(path, JSON.stringify({
      schemaVersion: 1,
      baseBranch: "main",
      integrationBranch: "idev/integration",
      remote: "origin",
      leaseSeconds: 14_400,
      verificationTimeoutSeconds: 1_800,
    }), "utf8");
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.schemaVersion, CONFIG_SCHEMA_VERSION);
    assert.deepEqual(migrated.verification.requiredScreenshotVariants, ["compact-light", "compact-dark", "accessibility-xxxl"]);
    assert.equal(migrated.release.evidence, "full");
  });

  it("migrates the milestone-4 schema with lifecycle defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    const path = join(root, ".idevflow", "config.json");
    await initializeConfig(root);
    const legacy = { ...DEFAULT_CONFIG, schemaVersion: 2 } as Record<string, unknown>;
    delete legacy.documents;
    delete legacy.release;
    await writeFile(path, JSON.stringify(legacy), "utf8");
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.schemaVersion, CONFIG_SCHEMA_VERSION);
    assert.equal(migrated.documents.workGraph, "docs/idevflow/work-graph.json");
    assert.equal(migrated.release.defaultTarget, "testflight-internal");
  });

  it("migrates the specialist-knowledge schema with XCTest quality defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    const path = join(root, ".idevflow", "config.json");
    await initializeConfig(root);
    const legacy = { ...DEFAULT_CONFIG, schemaVersion: 4 } as Record<string, unknown>;
    delete legacy.quality;
    await writeFile(path, JSON.stringify(legacy), "utf8");
    const migrated = await applyConfigMigration(root);
    assert.equal(migrated.schemaVersion, CONFIG_SCHEMA_VERSION);
    assert.equal(migrated.quality.requireXCTestEvidence, true);
  });

  it("migrates schema 5 with iOS platform defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    const path = join(root, ".idevflow", "config.json");
    await initializeConfig(root);
    await writeFile(path, JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 5, xcode: { configuration: "Debug" } }), "utf8");
    assert.deepEqual((await applyConfigMigration(root)).xcode, { platform: "ios", requiredPlatforms: ["ios"], configuration: "Debug" });
  });

  it("removes retired pipeline settings during schema-8 migration", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    const path = join(root, ".idevflow", "config.json");
    await initializeConfig(root);
    await writeFile(path, JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 8, pipeline: { enabled: true } }), "utf8");
    const migrated = await applyConfigMigration(root) as unknown as Record<string, unknown>;
    assert.equal(migrated.pipeline, undefined);
  });

  it("migrates schema 6 with a single required platform", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-config-"));
    roots.push(root);
    const path = join(root, ".idevflow", "config.json");
    await initializeConfig(root);
    await writeFile(path, JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 6, xcode: { platform: "macos", configuration: "Debug" } }), "utf8");
    assert.deepEqual((await applyConfigMigration(root)).xcode.requiredPlatforms, ["macos"]);
  });

  it("rejects unknown schemas, platforms, and unsafe lease values", () => {
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, schemaVersion: 99 }));
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, xcode: { ...DEFAULT_CONFIG.xcode, platform: "watchos" } }));
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, xcode: { ...DEFAULT_CONFIG.xcode, requiredPlatforms: ["macos"] } }));
    assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, leaseSeconds: 1 }));
  });
});
