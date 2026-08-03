import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/idevflow/config/config.ts";
import { discoverXcodeProject, type CommandProbe } from "../extensions/idevflow/xcode/discovery.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const probe: CommandProbe = {
  async run(executable, args) {
    if (executable === "xcodebuild" && args.includes("-list")) {
      return { code: 0, stdout: JSON.stringify({ project: { schemes: ["SampleApp"] } }), stderr: "" };
    }
    if (executable === "xcodebuild" && args.includes("-showBuildSettings")) {
      return { code: 0, stdout: JSON.stringify([{ buildSettings: { PRODUCT_TYPE: "com.apple.product-type.application", IPHONEOS_DEPLOYMENT_TARGET: "26.0", SWIFT_VERSION: "6.0" } }]), stderr: "" };
    }
    if (executable === "swift") return { code: 0, stdout: JSON.stringify({ name: "Library" }), stderr: "" };
    return { code: 1, stdout: "", stderr: "unexpected" };
  },
};

describe("Xcode project discovery", () => {
  it("discovers a unique project and shared scheme", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-xcode-"));
    roots.push(root);
    await mkdir(join(root, "SampleApp.xcodeproj"));
    const descriptor = await discoverXcodeProject(root, DEFAULT_CONFIG, probe);
    assert.equal(descriptor.platform, "ios");
    assert.equal(descriptor.kind, "project");
    assert.equal(descriptor.scheme, "SampleApp");
  });

  it("prefers a workspace and ignores an internal project workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-xcode-"));
    roots.push(root);
    await mkdir(join(root, "SampleApp.xcodeproj", "project.xcworkspace"), { recursive: true });
    await mkdir(join(root, "SampleApp.xcworkspace"));
    const workspaceProbe: CommandProbe = {
      async run(_executable, args) {
        return args.includes("-list")
          ? { code: 0, stdout: JSON.stringify({ workspace: { schemes: ["SampleApp"] } }), stderr: "" }
          : { code: 0, stdout: JSON.stringify([{ buildSettings: { PRODUCT_TYPE: "com.apple.product-type.application", IPHONEOS_DEPLOYMENT_TARGET: "26.0" } }]), stderr: "" };
      },
    };
    assert.equal((await discoverXcodeProject(root, DEFAULT_CONFIG, workspaceProbe)).kind, "workspace");
  });

  it("reads the macOS deployment target for a macOS project", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-xcode-"));
    roots.push(root);
    await mkdir(join(root, "MacApp.xcodeproj"));
    const macProbe: CommandProbe = {
      async run(_executable, args) {
        return args.includes("-list")
          ? { code: 0, stdout: JSON.stringify({ project: { schemes: ["MacApp"] } }), stderr: "" }
          : { code: 0, stdout: JSON.stringify([{ buildSettings: { PRODUCT_TYPE: "com.apple.product-type.application", MACOSX_DEPLOYMENT_TARGET: "26.0" } }]), stderr: "" };
      },
    };
    const descriptor = await discoverXcodeProject(root, { ...DEFAULT_CONFIG, xcode: { ...DEFAULT_CONFIG.xcode, platform: "macos", requiredPlatforms: ["macos"] } }, macProbe);
    assert.equal(descriptor.platform, "macos");
    assert.equal(descriptor.deploymentTarget, "26.0");
  });

  it("discovers a Swift package fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-xcode-"));
    roots.push(root);
    await writeFile(join(root, "Package.swift"), "// swift-tools-version: 6.0\n");
    const descriptor = await discoverXcodeProject(root, DEFAULT_CONFIG, probe);
    assert.equal(descriptor.kind, "swift-package");
    assert.equal(descriptor.scheme, "Library");
  });

  it("fails closed on ambiguous containers", async () => {
    const root = await mkdtemp(join(tmpdir(), "idev-xcode-"));
    roots.push(root);
    await mkdir(join(root, "One.xcodeproj"));
    await mkdir(join(root, "Two.xcodeproj"));
    await assert.rejects(discoverXcodeProject(root, DEFAULT_CONFIG, probe), /Multiple Xcode projects/);
  });
});
