import type { CancellationSignal } from "./cancellation.js";

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

/**
 * Conservative Core-wide ceiling for one in-memory Firmware artifact. Target
 * and provider policies may impose a smaller limit later.
 */
export const maximumFirmwareArtifactSizeBytes = 64 * 1024 * 1024;

export const firmwareArtifactDigestAssurances = [
  "CRYPTOGRAPHIC",
  "SYNTHETIC_ONLY",
] as const;

export type FirmwareArtifactDigestAssurance =
  (typeof firmwareArtifactDigestAssurances)[number];

/** Platform service used by Core after it has copied the caller's bytes. */
export interface FirmwareArtifactDigestProvider {
  readonly assurance: FirmwareArtifactDigestAssurance;
  digestSha256(bytes: Uint8Array, signal?: CancellationSignal): Promise<string>;
}

export interface FirmwareArtifactByteVerification {
  readonly status: "VERIFIED";
  readonly algorithm: "SHA-256";
  readonly assurance: FirmwareArtifactDigestAssurance;
  readonly byteLength: number;
  readonly sha256: string;
}

/**
 * No signing root is admitted yet. This literal is carried in operation
 * evidence so metadata or byte coherence cannot be mistaken for authenticity.
 */
export const currentArtifactManifestTrustStatus =
  "UNVERIFIED_NO_TRUST_ROOT" as const;

export type ArtifactManifestTrustStatus =
  typeof currentArtifactManifestTrustStatus;

/** Signed-manifest wire design only; accepting one still requires a trust root. */
export const signedFirmwareManifestSchemaVersion = "1" as const;
export const signedFirmwareManifestCanonicalization = "RFC8785" as const;
export const signedFirmwareManifestSignatureAlgorithm = "Ed25519" as const;

export interface SignedFirmwareManifestSignature {
  readonly algorithm: typeof signedFirmwareManifestSignatureAlgorithm;
  readonly keyId: string;
  readonly signatureBase64Url: string;
}

export interface SignedFirmwareManifestEnvelope<TPayload> {
  readonly schemaVersion: typeof signedFirmwareManifestSchemaVersion;
  readonly canonicalization: typeof signedFirmwareManifestCanonicalization;
  readonly payload: TPayload;
  readonly signature: SignedFirmwareManifestSignature;
}

/** No real writer can satisfy the current provider contract. */
export const firmwareUpdateProviderAssurances = ["SYNTHETIC_ONLY"] as const;
export type FirmwareUpdateProviderAssurance =
  (typeof firmwareUpdateProviderAssurances)[number];

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
