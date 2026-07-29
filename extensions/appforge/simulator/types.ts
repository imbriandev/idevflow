export const SIMULATOR_STATE_SCHEMA_VERSION = 1 as const;

export interface SimulatorDevice {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly runtimeIdentifier: string;
  readonly runtimeVersion: string;
}

export interface SimulatorLease {
  readonly udid: string;
  readonly name: string;
  readonly runtimeVersion: string;
  readonly sessionId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly wasBooted: boolean;
}

export interface SimulatorLeaseState {
  readonly schemaVersion: typeof SIMULATOR_STATE_SCHEMA_VERSION;
  readonly revision: number;
  readonly leases: Readonly<Record<string, SimulatorLease>>;
}
