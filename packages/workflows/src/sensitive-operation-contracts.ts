import type { FirmwareArtifactDescriptor } from "@elrs-easy/compatibility";
import type {
  CancellationSignal,
  Capability,
  DeviceDescriptor,
  DeviceIdentityEvidence,
  DeviceSession,
} from "@elrs-easy/domain";

export interface IdentityReader {
  readIdentity(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly DeviceIdentityEvidence[]>;
  readCapabilities(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly Capability[]>;
}

export interface BindingExecutionReceipt {
  /** Means the command finished, not that a usable link exists. */
  readonly commandCompleted: true;
}

export type BindingVerificationResult =
  | {
      readonly linked: true;
      readonly reason: "LINK_ESTABLISHED";
    }
  | {
      readonly linked: false;
      readonly reason: "LINK_NOT_ESTABLISHED" | "MODEL_MISMATCH";
    };

export interface BindingProvider extends IdentityReader {
  readonly id: string;
  prepareBinding(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<void>;
  executeBinding(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<BindingExecutionReceipt>;
  reconnect(
    expectedDeviceId: string,
    signal?: CancellationSignal,
  ): Promise<DeviceDescriptor | null>;
  verifyBinding(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<BindingVerificationResult>;
}

export interface FirmwareWriteReceipt {
  /** Provider completion is deliberately not equivalent to success. */
  readonly writeCompleted: true;
  readonly bytesWritten?: number;
  readonly totalBytes?: number;
}

export type FirmwareVerificationResult =
  | {
      readonly valid: true;
      readonly observedTargetId: string;
      readonly observedFirmwareVersion: string;
      readonly reason: "EXPECTED_FIRMWARE_OBSERVED";
    }
  | {
      readonly valid: false;
      readonly observedTargetId: string | null;
      readonly observedFirmwareVersion: string | null;
      readonly reason:
        "TARGET_MISMATCH" | "VERSION_MISMATCH" | "ARTIFACT_NOT_VERIFIED";
    };

export interface FirmwareUpdateProvider extends IdentityReader {
  readonly id: string;
  /** Runtime capability that must be observed before this provider may write. */
  readonly updateCapabilityId: string;
  validateArtifact(
    artifact: FirmwareArtifactDescriptor,
    signal?: CancellationSignal,
  ): Promise<boolean>;
  prepareUpdate(
    session: DeviceSession,
    artifact: FirmwareArtifactDescriptor,
    signal?: CancellationSignal,
  ): Promise<void>;
  writeFirmware(
    session: DeviceSession,
    artifact: FirmwareArtifactDescriptor,
    signal?: CancellationSignal,
  ): Promise<FirmwareWriteReceipt>;
  reboot(session: DeviceSession, signal?: CancellationSignal): Promise<void>;
  reconnect(
    expectedDeviceId: string,
    signal?: CancellationSignal,
  ): Promise<DeviceDescriptor | null>;
  verifyFirmware(
    session: DeviceSession,
    artifact: FirmwareArtifactDescriptor,
    signal?: CancellationSignal,
  ): Promise<FirmwareVerificationResult>;
}
