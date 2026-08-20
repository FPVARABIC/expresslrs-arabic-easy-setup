export const recoveryDispositions = [
  "NONE",
  "SAFE_TO_RETRY",
  "RECONNECT_AND_VERIFY",
  "RECOVERY_REQUIRED",
  "UNKNOWN",
] as const;

/** A standalone decision; workflows attach it without changing OperationRecord. */
export type RecoveryDisposition = (typeof recoveryDispositions)[number];

/**
 * Canonical update mechanisms understood by Core. Platform providers map
 * browser/native/upstream names onto these values; the UI never needs to ask
 * an Easy Mode user to choose one.
 */
export const firmwareUpdateMethods = [
  "WIFI_OTA",
  "UART",
  "BETAFLIGHT_PASSTHROUGH",
  "EDGETX_PASSTHROUGH",
  "XMODEM",
  "STLINK",
  "DFU",
  "EXTERNAL_TOOL",
] as const;

export type FirmwareUpdateMethod = (typeof firmwareUpdateMethods)[number];

const firmwareUpdateMethodSet = new Set<unknown>(firmwareUpdateMethods);

export function isFirmwareUpdateMethod(
  value: unknown,
): value is FirmwareUpdateMethod {
  return firmwareUpdateMethodSet.has(value);
}

/** Minimum internal provenance envelope; this is not a signature format. */
export const artifactProvenanceSchemaVersion = "1" as const;

export const artifactProvenanceValidationLevels = ["COHERENCE_ONLY"] as const;
export type ArtifactProvenanceValidationLevel =
  (typeof artifactProvenanceValidationLevels)[number];

export interface ArtifactProvenance {
  readonly schemaVersion: typeof artifactProvenanceSchemaVersion;
  readonly applicationVersion: string;
  readonly coreVersion: string;
  readonly upstreamRepository: string;
  readonly upstreamVersion: string;
  readonly upstreamCommitSha: string;
  readonly patchSetVersion: string;
  readonly targetId: string;
  readonly buildConfigurationDigest: string;
  readonly toolchainIdentity: string;
  readonly builtAt: string;
  readonly artifactSizeBytes: number;
  readonly artifactSha256: string;
}

export const verificationFacts = [
  "DEVICE_RECONNECTED",
  "DEVICE_IDENTITY_MATCHES",
  "TARGET_MATCHES",
  "FIRMWARE_VERSION_MATCHES",
  "CONFIGURATION_MATCHES",
  "LINK_ESTABLISHED",
] as const;

export type KnownVerificationFact = (typeof verificationFacts)[number];
export type VerificationFact = KnownVerificationFact | (string & {});
export type VerificationExpectedValue = string | number | boolean;

export interface VerificationRequirement {
  readonly id: string;
  readonly fact: VerificationFact;
  readonly expectedValue: VerificationExpectedValue;
  readonly required: boolean;
}

/**
 * Declarative postcondition plan. A provider finishing its command does not
 * satisfy this plan; required facts must be observed independently afterward.
 */
export interface VerificationPlan {
  readonly id: string;
  readonly operationType: string;
  /** Opaque session-local device id; never a hardware serial. */
  readonly expectedDeviceId: string;
  readonly requirements: readonly VerificationRequirement[];
}
