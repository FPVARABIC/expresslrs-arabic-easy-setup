import type { FirmwareUpdateArtifact } from "@elrs-easy/compatibility";
import type {
  ArtifactManifestTrustStatus,
  CancellationSignal,
  Capability,
  DeviceDescriptor,
  DeviceIdentityEvidence,
  DeviceSession,
  FirmwareArtifactByteVerification,
  FirmwareUpdateMethod,
  FirmwareUpdateProviderAssurance,
} from "@elrs-easy/domain";

export type SensitiveOperationProviderAssurance = "SYNTHETIC_ONLY";

export interface IdentityReader {
  readonly id: string;
  /**
   * Until physical admission exists, sensitive workflows accept only lab
   * providers. A future real provider requires an explicit contract change and
   * review instead of becoming active through structural typing alone.
   */
  readonly assurance: SensitiveOperationProviderAssurance;
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
        | "TARGET_MISMATCH"
        | "VERSION_MISMATCH"
        | "ARTIFACT_NOT_VERIFIED";
    };

/**
 * Exact bytes already copied, size-checked, and digested by Core. Each provider
 * call receives a fresh byte copy; this object does not imply manifest trust.
 */
export interface VerifiedFirmwareUpdateArtifact {
  readonly artifact: FirmwareUpdateArtifact;
  readonly bytes: Uint8Array;
  readonly byteVerification: FirmwareArtifactByteVerification;
  readonly manifestTrust: ArtifactManifestTrustStatus;
}

export interface FirmwareUpdateProvider extends IdentityReader {
  /** The current contract intentionally admits Synthetic providers only. */
  readonly assurance: FirmwareUpdateProviderAssurance;
  /** Canonical mechanism; platform-specific provider identity stays separate. */
  readonly updateMethod: FirmwareUpdateMethod;
  /** Runtime capability that must be observed before this provider may write. */
  readonly updateCapabilityId: string;
  validateArtifact(
    artifact: VerifiedFirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<boolean>;
  prepareUpdate(
    session: DeviceSession,
    artifact: VerifiedFirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<void>;
  writeFirmware(
    session: DeviceSession,
    artifact: VerifiedFirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<FirmwareWriteReceipt>;
  reboot(session: DeviceSession, signal?: CancellationSignal): Promise<void>;
  reconnect(
    expectedDeviceId: string,
    signal?: CancellationSignal,
  ): Promise<DeviceDescriptor | null>;
  verifyFirmware(
    session: DeviceSession,
    artifact: FirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<FirmwareVerificationResult>;
}
