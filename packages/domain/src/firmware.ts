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

/** Immutable named digest used inside the version-1 provenance payload. */
export interface FirmwareManifestNamedDigest {
  readonly id: string;
  readonly sha256: string;
}

/** Immutable build-platform identity used inside the version-1 payload. */
export interface FirmwareManifestPlatformVersion {
  readonly name: string;
  readonly version: string;
}

/** Public build option; the current parser admits only Synthetic names. */
export interface FirmwareManifestBuildOption {
  readonly name: string;
  readonly value: string;
}

/** Immutable identity for a separately downloadable notice bundle. */
export interface FirmwareManifestNoticeBundle {
  readonly url: string;
  readonly sha256: string;
}

/** Fixed version-1 field set; channel-specific policy is applied separately. */
export interface FirmwareManifestPayloadV1 {
  readonly manifestSchema: typeof signedFirmwareManifestSchemaVersion;
  readonly applicationVersion: string;
  readonly coreVersion: string;
  readonly channel: string;
  readonly upstreamRepository: string;
  readonly upstreamTag: string;
  readonly upstreamFullSha: string;
  readonly upstreamSourceArchiveSha256: string;
  readonly targetsRepository: string;
  readonly targetsFullSha: string;
  readonly targetsSnapshotSha256: string;
  readonly patchSetId: string;
  readonly patches: readonly FirmwareManifestNamedDigest[];
  readonly dirtyTree: boolean;
  readonly toolchainOrContainerDigest: string;
  readonly platformioVersion: string;
  readonly platformVersions: readonly FirmwareManifestPlatformVersion[];
  readonly dependencyLockDigest: string;
  readonly targetIdentifier: string;
  readonly productIdentifier: string;
  readonly mcu: string;
  readonly radio: string;
  readonly band: string;
  readonly regulatoryDomain: string;
  readonly nonSecretBuildOptions: readonly FirmwareManifestBuildOption[];
  readonly artifactName: string;
  readonly artifactMediaType: string;
  readonly artifactCompression: string;
  readonly artifactByteForm: string;
  readonly artifactSizeBytes: number;
  readonly artifactSha256: string;
  readonly buildSourceEpoch: number;
  readonly testsAndValidationLevel: readonly string[];
  readonly correspondingSourceUrl: string;
  readonly noticeBundle: FirmwareManifestNoticeBundle;
  readonly releaseSequence: number;
  readonly publishedAt: string;
  readonly minimumApplicationVersion: string;
  readonly minimumCoreVersion: string;
  readonly signingRole: string;
  readonly requiredRootMetadataVersion: number;
}

/**
 * Only this narrower payload can currently leave the bounded Workflow parser.
 * Stable/Beta roles and compressed forms require later trust and byte gates.
 */
export interface SyntheticFirmwareManifestPayloadV1 extends FirmwareManifestPayloadV1 {
  readonly channel: "synthetic";
  readonly artifactMediaType: "application/octet-stream";
  readonly artifactCompression: "none";
  readonly artifactByteForm: "RAW_TO_WRITE";
  readonly signingRole: "synthetic";
}

export interface SignedFirmwareManifestEnvelope<TPayload> {
  readonly schemaVersion: typeof signedFirmwareManifestSchemaVersion;
  readonly canonicalization: typeof signedFirmwareManifestCanonicalization;
  readonly payload: TPayload;
  readonly signature: SignedFirmwareManifestSignature;
}

export const firmwareManifestSignatureVerifierAssurances = [
  "CRYPTOGRAPHIC",
  "SYNTHETIC_ONLY",
] as const;

export type FirmwareManifestSignatureVerifierAssurance =
  (typeof firmwareManifestSignatureVerifierAssurances)[number];

/**
 * Platform cryptography only. A valid mathematical signature says nothing
 * about trust unless a separately admitted root resolves and authorizes it.
 */
export interface FirmwareManifestSignatureVerifier {
  readonly assurance: FirmwareManifestSignatureVerifierAssurance;
  verifyEd25519(
    signatureInput: Uint8Array,
    signature: Uint8Array,
    rawPublicKey: Uint8Array,
    signal?: CancellationSignal,
  ): Promise<boolean>;
}

export interface FirmwareManifestSignatureVerification {
  readonly status: "VALID_UNTRUSTED";
  readonly algorithm: typeof signedFirmwareManifestSignatureAlgorithm;
  readonly assurance: FirmwareManifestSignatureVerifierAssurance;
  readonly keyAssurance: "SYNTHETIC_ONLY";
  readonly keyId: string;
  readonly trustStatus: ArtifactManifestTrustStatus;
}

/**
 * Version-1 root-metadata wire constants. The only currently admitted wire
 * namespace is Synthetic; these constants do not create a trust anchor.
 */
export const firmwareRootMetadataSchemaVersion = "1" as const;
export const firmwareRootMetadataCanonicalization = "RFC8785" as const;
export const firmwareRootMetadataSignatureAlgorithm = "Ed25519" as const;
export const syntheticFirmwareRootMetadataType = "synthetic-root" as const;
export const syntheticFirmwareRootRoles = ["root", "synthetic"] as const;

export type SyntheticFirmwareRootRole =
  (typeof syntheticFirmwareRootRoles)[number];

export interface SyntheticFirmwareRootPublicKeyV1 {
  readonly keyId: string;
  readonly keyType: "ed25519";
  readonly algorithm: typeof firmwareRootMetadataSignatureAlgorithm;
  readonly publicKeyBase64Url: string;
}

export interface SyntheticFirmwareRootRoleV1 {
  readonly name: SyntheticFirmwareRootRole;
  readonly channel: "synthetic";
  readonly keyIds: readonly string[];
  readonly threshold: number;
}

export interface SyntheticFirmwareRootMetadataPayloadV1 {
  readonly rootSchema: typeof firmwareRootMetadataSchemaVersion;
  readonly metadataType: typeof syntheticFirmwareRootMetadataType;
  readonly version: number;
  readonly notBefore: string;
  readonly expiresAt: string;
  readonly keys: readonly SyntheticFirmwareRootPublicKeyV1[];
  readonly roles: readonly SyntheticFirmwareRootRoleV1[];
}

export interface SignedFirmwareRootMetadataEnvelopeV1 {
  readonly schemaVersion: typeof firmwareRootMetadataSchemaVersion;
  readonly canonicalization: typeof firmwareRootMetadataCanonicalization;
  readonly payload: SyntheticFirmwareRootMetadataPayloadV1;
  readonly signatures: readonly SignedFirmwareManifestSignature[];
}

/** No production clock assurance is admitted while no trust root exists. */
export const firmwareTrustClockAssurances = ["SYNTHETIC_ONLY"] as const;
export type FirmwareTrustClockAssurance =
  (typeof firmwareTrustClockAssurances)[number];

export interface FirmwareTrustClock {
  readonly assurance: FirmwareTrustClockAssurance;
  readUtcNow(signal?: CancellationSignal): Promise<string>;
}

export const syntheticFirmwareTrustStateSchemaVersion = "1" as const;
export const syntheticFirmwareTrustStateType =
  "synthetic-firmware-trust-state" as const;

export interface SyntheticFirmwareReleaseFloorV1 {
  readonly channel: "synthetic";
  readonly targetIdentifier: string;
  readonly highestReleaseSequence: number;
  readonly artifactSha256: string;
  readonly acceptedRootMetadataVersion: number;
}

/**
 * Serializable monotonic-state proposal. It is public operational data, not a
 * trusted-root container, and no Browser storage adapter currently exists.
 */
export interface SyntheticFirmwareTrustStateV1 {
  readonly schemaVersion: typeof syntheticFirmwareTrustStateSchemaVersion;
  readonly stateType: typeof syntheticFirmwareTrustStateType;
  readonly highestRootMetadataVersion: number;
  readonly releaseFloors: readonly SyntheticFirmwareReleaseFloorV1[];
}

/**
 * Synthetic compressed-artifact lab constants. The smaller input ceiling and
 * bounded chunk contract keep decompression separate from the 64 MiB raw
 * Firmware ceiling while the format is not connected to an admitted Manifest.
 */
export const maximumCompressedFirmwareArtifactSizeBytes = 16 * 1024 * 1024;
export const maximumFirmwareArtifactDecompressionChunkSizeBytes = 64 * 1024;
export const maximumFirmwareArtifactDecompressionChunks = 4096;

export const firmwareArtifactDecompressionAssurances = [
  "SYNTHETIC_ONLY",
] as const;
export type FirmwareArtifactDecompressionAssurance =
  (typeof firmwareArtifactDecompressionAssurances)[number];

export type FirmwareArtifactDecompressionChunkSink = (
  chunk: Uint8Array,
) => void;

/**
 * Streaming platform primitive only. Core owns all size, chunk, digest, and
 * identity decisions and currently admits this boundary for Synthetic
 * fixtures only.
 */
export interface FirmwareArtifactDecompressionProvider {
  readonly assurance: FirmwareArtifactDecompressionAssurance;
  decompressGzip(
    compressedBytes: Uint8Array,
    emitChunk: FirmwareArtifactDecompressionChunkSink,
    signal?: CancellationSignal,
  ): Promise<void>;
}

export const syntheticCompressedFirmwareArtifactSchemaVersion = "1" as const;
export const syntheticCompressedFirmwareArtifactType =
  "synthetic-compressed-firmware-artifact" as const;
export const syntheticFirmwareExecutableFormat =
  "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1" as const;
export const syntheticFirmwareExecutableByteForm =
  "SYNTHETIC_EXECUTABLE_FIXTURE" as const;

/**
 * Lab-only descriptor naming both downloaded and decompressed byte forms.
 * Signed Manifest v1 deliberately remains raw/uncompressed.
 */
export interface SyntheticCompressedFirmwareArtifactDescriptorV1 {
  readonly schemaVersion: typeof syntheticCompressedFirmwareArtifactSchemaVersion;
  readonly artifactType: typeof syntheticCompressedFirmwareArtifactType;
  readonly compression: "gzip";
  readonly decompressedByteForm: typeof syntheticFirmwareExecutableByteForm;
  readonly executableFormat: typeof syntheticFirmwareExecutableFormat;
  readonly targetIdentifier: string;
  readonly compressedSizeBytes: number;
  readonly compressedSha256: string;
  readonly decompressedSizeBytes: number;
  readonly decompressedSha256: string;
}

export interface SyntheticFirmwareExecutableIdentityV1 {
  readonly format: typeof syntheticFirmwareExecutableFormat;
  readonly schemaVersion: "1";
  readonly targetIdentifier: string;
  readonly containerSizeBytes: number;
  readonly executablePayloadSizeBytes: number;
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
