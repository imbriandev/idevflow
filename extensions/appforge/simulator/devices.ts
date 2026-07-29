import type { CommandProbe } from "../xcode/discovery.ts";
import { systemProbe } from "../xcode/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";
import type { SimulatorDevice } from "./types.ts";

interface SimctlDevice {
  udid?: string;
  name?: string;
  state?: string;
  isAvailable?: boolean;
  deviceTypeIdentifier?: string;
}

function runtimeVersion(identifier: string): string {
  const match = identifier.match(/iOS-(\d+(?:-\d+)*)$/);
  return match ? match[1]!.replace(/-/g, ".") : identifier;
}

function versionParts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export async function discoverSimulatorDevices(cwd: string, probe: CommandProbe = systemProbe): Promise<SimulatorDevice[]> {
  const result = await probe.run("xcrun", ["simctl", "list", "devices", "available", "-j"], cwd);
  if (result.code !== 0) throw new SafetyKernelError(`simctl device discovery failed: ${result.stderr.trim()}`);
  let payload: { devices?: Record<string, SimctlDevice[]> };
  try {
    payload = JSON.parse(result.stdout) as typeof payload;
  } catch (error) {
    throw new SafetyKernelError("simctl returned invalid device JSON", { cause: error });
  }
  const devices: SimulatorDevice[] = [];
  for (const [runtimeIdentifier, entries] of Object.entries(payload.devices ?? {})) {
    if (!runtimeIdentifier.includes("SimRuntime.iOS-")) continue;
    for (const device of entries) {
      if (device.isAvailable === false || !device.udid || !device.name || !device.deviceTypeIdentifier?.includes("iPhone")) continue;
      devices.push({
        udid: device.udid,
        name: device.name,
        state: device.state ?? "Unknown",
        runtimeIdentifier,
        runtimeVersion: runtimeVersion(runtimeIdentifier),
      });
    }
  }
  return devices.sort((left, right) => compareVersions(left.runtimeVersion, right.runtimeVersion) || left.name.localeCompare(right.name));
}

export function selectSimulator(
  devices: readonly SimulatorDevice[],
  leasedUdids: ReadonlySet<string>,
  preferredName?: string,
  preferredUdid?: string,
): SimulatorDevice {
  const available = devices.filter((device) => !leasedUdids.has(device.udid));
  const preferred = preferredUdid
    ? available.find((device) => device.udid === preferredUdid)
    : preferredName ? available.find((device) => device.name === preferredName) : undefined;
  const selected = preferred ?? (preferredName || preferredUdid ? undefined : available[0]);
  if (!selected) throw new SafetyKernelError(preferredUdid ? `No unleased simulator ${preferredUdid} is available` : preferredName ? `No unleased simulator named ${preferredName} is available` : "No unleased iPhone simulator is available");
  return selected;
}
