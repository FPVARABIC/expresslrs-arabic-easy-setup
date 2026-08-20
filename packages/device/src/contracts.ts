import type {
  Capability,
  DeviceDescriptor,
  DeviceIdentityEvidence,
  DeviceSession,
} from "@elrs-easy/domain";

export interface DiscoveryProvider {
  readonly id: string;
  discover(signal?: AbortSignal): Promise<readonly DeviceDescriptor[]>;
  readIdentity(
    session: DeviceSession,
    signal?: AbortSignal,
  ): Promise<readonly DeviceIdentityEvidence[]>;
  readCapabilities(
    session: DeviceSession,
    signal?: AbortSignal,
  ): Promise<readonly Capability[]>;
}

export interface DeviceSessionManager {
  acquire(input: {
    readonly deviceId: string;
    readonly owner: DeviceSession["owner"];
  }): DeviceSession;
  release(session: DeviceSession): void;
  assertHeld(session: DeviceSession): void;
  current(deviceId: string): DeviceSession | null;
}
