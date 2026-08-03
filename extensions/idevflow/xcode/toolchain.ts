import { createHash } from "node:crypto";
import type { CommandProbe } from "./discovery.ts";
import { systemProbe } from "./discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";

export interface ToolchainDescriptor {
  readonly xcode: string;
  readonly swift: string;
  readonly developerDirectory: string;
  readonly fingerprint: string;
}

export async function discoverToolchain(cwd: string, probe: CommandProbe = systemProbe): Promise<ToolchainDescriptor> {
  const [xcode, swift, developer] = await Promise.all([
    probe.run("xcodebuild", ["-version"], cwd),
    probe.run("swift", ["--version"], cwd),
    probe.run("xcode-select", ["-p"], cwd),
  ]);
  if (xcode.code || swift.code || developer.code) throw new SafetyKernelError("Unable to resolve the complete Apple toolchain");
  const descriptor = {
    xcode: xcode.stdout.trim(),
    swift: swift.stdout.trim(),
    developerDirectory: developer.stdout.trim(),
  };
  const xcodeVersion = Number.parseFloat(descriptor.xcode.match(/Xcode\s+(\d+(?:\.\d+)?)/)?.[1] ?? "0");
  const swiftVersion = Number.parseFloat(descriptor.swift.match(/Apple Swift version\s+(\d+(?:\.\d+)?)/)?.[1] ?? "0");
  if (xcodeVersion < 26) throw new SafetyKernelError(`iDevFlow requires Xcode 26 or newer, found ${descriptor.xcode}`);
  if (swiftVersion < 6.2) throw new SafetyKernelError(`iDevFlow requires Swift 6.2 or newer, found ${descriptor.swift}`);
  return { ...descriptor, fingerprint: createHash("sha256").update(JSON.stringify(descriptor)).digest("hex") };
}
