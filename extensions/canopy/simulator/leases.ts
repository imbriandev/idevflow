import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { withFileLock } from "../state/file-lock.ts";
import { selectSimulator } from "./devices.ts";
import {
  SIMULATOR_STATE_SCHEMA_VERSION,
  type SimulatorDevice,
  type SimulatorLease,
  type SimulatorLeaseState,
} from "./types.ts";

function emptyState(): SimulatorLeaseState {
  return { schemaVersion: SIMULATOR_STATE_SCHEMA_VERSION, revision: 0, leases: {} };
}

function validateState(value: unknown): SimulatorLeaseState {
  const state = value as Partial<SimulatorLeaseState> | undefined;
  if (!state || state.schemaVersion !== SIMULATOR_STATE_SCHEMA_VERSION || typeof state.revision !== "number" || !state.leases || typeof state.leases !== "object") {
    throw new SafetyKernelError("Simulator lease state is invalid or unsupported");
  }
  return state as SimulatorLeaseState;
}

export class SimulatorLeaseStore {
  readonly directory: string;
  readonly statePath: string;
  readonly lockPath: string;

  constructor(readonly repository: RepositoryDescriptor) {
    this.directory = join(repository.primaryRoot, ".canopy", "state", "simulators");
    this.statePath = join(this.directory, "leases.json");
    this.lockPath = join(this.directory, "leases.lock");
  }

  async load(): Promise<SimulatorLeaseState> {
    try {
      return validateState(JSON.parse(await readFile(this.statePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
  }

  async acquire(
    devices: readonly SimulatorDevice[],
    sessionId: string,
    leaseSeconds: number,
    preferredName?: string,
    preferredUdid?: string,
  ): Promise<SimulatorLease> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return withFileLock(this.lockPath, async () => {
      const current = await this.load();
      const now = Date.now();
      const leases = Object.fromEntries(Object.entries(current.leases).filter(([, lease]) => Date.parse(lease.expiresAt) >= now));
      const existing = Object.values(leases).find((lease) => lease.sessionId === sessionId);
      if (existing) return existing;
      const device = selectSimulator(devices, new Set(Object.keys(leases)), preferredName, preferredUdid);
      const lease: SimulatorLease = {
        udid: device.udid,
        name: device.name,
        runtimeVersion: device.runtimeVersion,
        sessionId,
        acquiredAt: new Date(now).toISOString(),
        expiresAt: new Date(now + leaseSeconds * 1000).toISOString(),
        wasBooted: device.state === "Booted",
      };
      const next: SimulatorLeaseState = {
        schemaVersion: SIMULATOR_STATE_SCHEMA_VERSION,
        revision: current.revision + 1,
        leases: { ...leases, [lease.udid]: lease },
      };
      await writeFileAtomically(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
      return lease;
    });
  }

  async release(sessionId: string): Promise<SimulatorLease | undefined> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return withFileLock(this.lockPath, async () => {
      const current = await this.load();
      const lease = Object.values(current.leases).find((item) => item.sessionId === sessionId);
      if (!lease) return undefined;
      const leases = { ...current.leases };
      delete leases[lease.udid];
      await writeFileAtomically(this.statePath, `${JSON.stringify({ schemaVersion: SIMULATOR_STATE_SCHEMA_VERSION, revision: current.revision + 1, leases }, null, 2)}\n`);
      return lease;
    });
  }
}
