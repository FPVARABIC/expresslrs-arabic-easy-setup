import type {
  CancellationSignal,
  Capability,
  DeviceDescriptor,
  DeviceIdentityEvidence,
  DeviceSession,
} from "@elrs-easy/domain";

export interface DiscoveryProvider {
  readonly id: string;
  discover(signal?: CancellationSignal): Promise<readonly DeviceDescriptor[]>;
  readIdentity(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly DeviceIdentityEvidence[]>;
  readCapabilities(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly Capability[]>;
}

export interface DeviceSessionManager {
  acquire(input: {
    readonly deviceId: string;
    readonly owner: DeviceSession["owner"];
  }): DeviceSession;
  release(session: DeviceSession): void;
  assertHeld(session: DeviceSession): void;
  /**
   * Answers only whether this exact opaque lease is still held. It deliberately
   * does not expose the active token for a device to unrelated callers.
   */
  isHeld(session: DeviceSession): boolean;
}
