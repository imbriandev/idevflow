import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CanopyConfig } from "../config/config.ts";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import type { CommandProbe } from "../xcode/discovery.ts";
import { systemProbe } from "../xcode/discovery.ts";
import { discoverSimulatorDevices } from "./devices.ts";
import { SimulatorLeaseStore } from "./leases.ts";
import type { SimulatorLease } from "./types.ts";
import { SafetyKernelError } from "../state/errors.ts";

export async function acquireSimulatorLease(
  repository: RepositoryDescriptor,
  config: CanopyConfig,
  sessionId: string,
  boot: boolean,
  probe: CommandProbe = systemProbe,
): Promise<SimulatorLease> {
  const devices = await discoverSimulatorDevices(repository.primaryRoot, probe);
  const store = new SimulatorLeaseStore(repository);
  const destinationName = config.xcode.destination?.match(/(?:^|,)name=([^,]+)/)?.[1];
  const destinationUdid = config.xcode.destination?.match(/(?:^|,)id=([^,]+)/)?.[1];
  const lease = await store.acquire(
    devices,
    sessionId,
    config.simulator.leaseSeconds,
    destinationName ?? config.simulator.preferredName,
    destinationUdid,
  );
  if (boot && !lease.wasBooted) {
    const bootResult = await probe.run("xcrun", ["simctl", "boot", lease.udid], repository.primaryRoot);
    if (bootResult.code !== 0 && !/current state: Booted|Unable to boot device in current state/i.test(bootResult.stderr)) {
      await store.release(sessionId);
      throw new SafetyKernelError(`Failed to boot simulator ${lease.name}: ${bootResult.stderr.trim()}`);
    }
    const ready = await probe.run("xcrun", ["simctl", "bootstatus", lease.udid, "-b"], repository.primaryRoot);
    if (ready.code !== 0) {
      await store.release(sessionId);
      throw new SafetyKernelError(`Simulator ${lease.name} did not become ready: ${ready.stderr.trim()}`);
    }
  }
  return lease;
}

export async function captureSimulatorScreenshot(
  repository: RepositoryDescriptor,
  config: CanopyConfig,
  sessionId: string,
  variant: string,
  sourceFingerprint: string,
  probe: CommandProbe = systemProbe,
): Promise<{ path: string; metadataPath: string; lease: SimulatorLease }> {
  if (!variant.trim()) throw new SafetyKernelError("Screenshot variant cannot be empty");
  const lease = await acquireSimulatorLease(repository, config, sessionId, true, probe);
  const directory = join(repository.primaryRoot, ".canopy", "evidence", sessionId, "screenshots");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const safeVariant = variant.replace(/[^a-z0-9-]+/gi, "-");
  const path = join(directory, `${safeVariant}.png`);
  const result = await probe.run("xcrun", ["simctl", "io", lease.udid, "screenshot", path], repository.primaryRoot);
  if (result.code !== 0) throw new SafetyKernelError(`Simulator screenshot failed: ${result.stderr.trim()}`);
  if ((await stat(path)).size === 0) throw new SafetyKernelError("Simulator screenshot is empty");
  const metadataPath = join(directory, `${safeVariant}.metadata.json`);
  await writeFile(metadataPath, `${JSON.stringify({ variant, sourceFingerprint, udid: lease.udid, simulator: lease.name, runtimeVersion: lease.runtimeVersion, capturedAt: new Date().toISOString() }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { path, metadataPath, lease };
}

export async function releaseSimulatorLease(
  repository: RepositoryDescriptor,
  config: CanopyConfig,
  sessionId: string,
  probe: CommandProbe = systemProbe,
): Promise<SimulatorLease | undefined> {
  const lease = await new SimulatorLeaseStore(repository).release(sessionId);
  if (lease && !config.simulator.keepBooted && !lease.wasBooted) {
    await probe.run("xcrun", ["simctl", "shutdown", lease.udid], repository.primaryRoot);
  }
  return lease;
}
