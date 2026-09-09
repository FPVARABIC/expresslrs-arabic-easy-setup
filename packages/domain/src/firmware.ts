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

/**
 * A separate lab-only wire namespace for a compressed object and its exact
 * decompressed form. Version 1 above remains raw-only and is never widened.
 */
export const signedSyntheticDualFormFirmwareManifestSchemaVersion =
  "2" as const;
export const syntheticDualFormFirmwareManifestType =
  "synthetic-dual-form-firmware-manifest" as const;

export interface SyntheticDualFormFirmwareManifestPayloadV2 {
  readonly manifestSchema: typeof signedSyntheticDualFormFirmwareManifestSchemaVersion;
  readonly manifestType: typeof syntheticDualFormFirmwareManifestType;
  readonly channel: "synthetic";
  readonly targetIdentifier: string;
  readonly artifactName: string;
  readonly artifactMediaType: "application/gzip";
  readonly compression: "gzip";
  readonly decompressedByteForm: "SYNTHETIC_EXECUTABLE_FIXTURE";
  readonly executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1";
  readonly compressedSizeBytes: number;
  readonly compressedSha256: string;
  readonly decompressedSizeBytes: number;
  readonly decompressedSha256: string;
  readonly releaseSequence: number;
  readonly signingRole: "synthetic";
  readonly requiredRootMetadataVersion: number;
}

export interface SignedSyntheticDualFormFirmwareManifestEnvelopeV2 {
  readonly schemaVersion: typeof signedSyntheticDualFormFirmwareManifestSchemaVersion;
  readonly canonicalization: typeof signedFirmwareManifestCanonicalization;
  readonly payload: SyntheticDualFormFirmwareManifestPayloadV2;
  readonly signature: SignedFirmwareManifestSignature;
}

/**
 * Lab-only distribution statement. It links the exact v2-named compressed
 * object to separately downloadable corresponding-source and notice bundles.
 * This is intentionally a separate signature namespace so Manifest v2 keeps
 * its fixed byte-identity meaning.
 */
export const signedSyntheticFirmwareDistributionManifestSchemaVersion =
  "1" as const;
export const syntheticFirmwareDistributionManifestType =
  "synthetic-firmware-distribution-manifest" as const;

export const syntheticFirmwareDistributionObjectRoles = [
  "firmware-artifact",
  "corresponding-source",
  "notices",
] as const;
export type SyntheticFirmwareDistributionObjectRole =
  (typeof syntheticFirmwareDistributionObjectRoles)[number];

export interface SyntheticFirmwareDistributionObjectV1 {
  readonly objectRole: SyntheticFirmwareDistributionObjectRole;
  readonly name: string;
  readonly url: string;
  readonly mediaType: "application/gzip" | "application/json";
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface SyntheticFirmwareDistributionManifestPayloadV1 {
  readonly distributionSchema: typeof signedSyntheticFirmwareDistributionManifestSchemaVersion;
  readonly manifestType: typeof syntheticFirmwareDistributionManifestType;
  readonly channel: "synthetic";
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifact: SyntheticFirmwareDistributionObjectV1 & {
    readonly objectRole: "firmware-artifact";
    readonly mediaType: "application/gzip";
  };
  readonly correspondingSource: SyntheticFirmwareDistributionObjectV1 & {
    readonly objectRole: "corresponding-source";
    readonly mediaType: "application/gzip";
  };
  readonly notices: SyntheticFirmwareDistributionObjectV1 & {
    readonly objectRole: "notices";
    readonly mediaType: "application/json";
  };
  readonly signingRole: "synthetic";
  readonly requiredRootMetadataVersion: number;
}

export interface SignedSyntheticFirmwareDistributionManifestEnvelopeV1 {
  readonly schemaVersion: typeof signedSyntheticFirmwareDistributionManifestSchemaVersion;
  readonly canonicalization: typeof signedFirmwareManifestCanonicalization;
  readonly payload: SyntheticFirmwareDistributionManifestPayloadV1;
  readonly signature: SignedFirmwareManifestSignature;
}

/** In-memory Synthetic acquisition limits; no production origin is admitted. */
export const maximumSyntheticFirmwareAcquisitionChunkSizeBytes = 64 * 1024;
export const maximumSyntheticFirmwareAcquisitionChunks = 4096;
export const maximumSyntheticCorrespondingSourceBundleSizeBytes =
  64 * 1024 * 1024;
export const maximumSyntheticNoticeBundleSizeBytes = 4 * 1024 * 1024;

/**
 * Lab-only source-review limits. The archive is still an untrusted Synthetic
 * fixture and these constants do not admit a production source origin.
 */
export const maximumSyntheticSourceArchiveDecompressedSizeBytes =
  64 * 1024 * 1024;
export const maximumSyntheticSourceArchiveEntries = 128;
export const maximumSyntheticSourceInventoryBytes = 64 * 1024;
export const maximumSyntheticNoticeEntries = 128;

export const syntheticCorrespondingSourceInventorySchemaVersion = "1" as const;
export const syntheticCorrespondingSourceInventoryType =
  "synthetic-corresponding-source-inventory" as const;
export const syntheticFirmwareNoticeSchemaVersion = "1" as const;
export const syntheticFirmwareNoticeType =
  "synthetic-firmware-notices" as const;

export const syntheticSourceInventoryEntryRoles = [
  "SOURCE",
  "BUILD_INPUT",
  "LICENSE",
] as const;
export type SyntheticSourceInventoryEntryRole =
  (typeof syntheticSourceInventoryEntryRoles)[number];

/** Exact declaration set required before a Synthetic build-input link exists. */
export const syntheticDeclaredBuildInputIds = [
  "upstream-source",
  "targets-snapshot",
  "patch-set",
  "toolchain",
  "dependency-lock",
  "build-configuration",
] as const;
export type SyntheticDeclaredBuildInputId =
  (typeof syntheticDeclaredBuildInputIds)[number];

export interface SyntheticSourceInventoryEntryV1 {
  readonly path: string;
  readonly role: SyntheticSourceInventoryEntryRole;
  readonly buildInputId: SyntheticDeclaredBuildInputId | null;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface SyntheticCorrespondingSourceInventoryV1 {
  readonly sourceInventorySchema: typeof syntheticCorrespondingSourceInventorySchemaVersion;
  readonly inventoryType: typeof syntheticCorrespondingSourceInventoryType;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
  readonly entries: readonly SyntheticSourceInventoryEntryV1[];
}

export interface SyntheticFirmwareNoticeEntryV1 {
  readonly componentId: string;
  readonly licenseExpression: string;
  readonly noticeSha256: string;
  readonly sourcePath: string;
}

export interface SyntheticFirmwareNoticesV1 {
  readonly noticeSchema: typeof syntheticFirmwareNoticeSchemaVersion;
  readonly noticeType: typeof syntheticFirmwareNoticeType;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
  readonly correspondingSourceSha256: string;
  readonly entries: readonly SyntheticFirmwareNoticeEntryV1[];
}

export interface SyntheticFirmwareObjectAcquisitionRequest {
  readonly schemaVersion: "1";
  readonly objectRole: SyntheticFirmwareDistributionObjectRole;
  readonly name: string;
  readonly url: string;
  readonly mediaType: "application/gzip" | "application/json";
  readonly expectedSizeBytes: number;
}

export interface SyntheticFirmwareObjectAcquisitionReceipt {
  readonly sourceUrl: string;
  readonly finalUrl: string;
  readonly statusCode: 200;
  readonly mediaType: "application/gzip" | "application/json";
  readonly receivedSizeBytes: number;
}

export type SyntheticFirmwareAcquisitionChunkSink = (chunk: Uint8Array) => void;

/**
 * Streaming acquisition primitive. Only a Synthetic provider can currently
 * satisfy this contract; Core independently checks every emitted byte.
 */
export interface SyntheticFirmwareObjectAcquisitionProvider {
  readonly assurance: "SYNTHETIC_ONLY";
  acquireExactObject(
    request: SyntheticFirmwareObjectAcquisitionRequest,
    emitChunk: SyntheticFirmwareAcquisitionChunkSink,
    signal?: CancellationSignal,
  ): Promise<SyntheticFirmwareObjectAcquisitionReceipt>;
}

/**
 * A bounded, lab-only recipe carried by the exact `build-configuration`
 * source-inventory entry. The recipe links the other five declared inputs;
 * its own size and digest are linked separately by Core.
 */
export const syntheticFirmwareBuildRecipeSchemaVersion = "1" as const;
export const syntheticFirmwareBuildRecipeType =
  "synthetic-firmware-build-recipe" as const;
export const maximumSyntheticFirmwareBuildRecipeBytes = 64 * 1024;
export const maximumSyntheticFirmwareBuildOutputChunkSizeBytes = 64 * 1024;
export const maximumSyntheticFirmwareBuildOutputChunks = 4096;

export const syntheticFirmwareBuildRecipeInputIds = [
  "upstream-source",
  "targets-snapshot",
  "patch-set",
  "toolchain",
  "dependency-lock",
] as const satisfies readonly SyntheticDeclaredBuildInputId[];
export type SyntheticFirmwareBuildRecipeInputId =
  (typeof syntheticFirmwareBuildRecipeInputIds)[number];

export interface SyntheticFirmwareBuildRecipeInputV1 {
  readonly buildInputId: SyntheticFirmwareBuildRecipeInputId;
  readonly sourcePath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface SyntheticFirmwareBuildRecipeOutputV1 {
  readonly name: string;
  readonly mediaType: "application/gzip";
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface SyntheticFirmwareBuildRecipeV1 {
  readonly buildRecipeSchema: typeof syntheticFirmwareBuildRecipeSchemaVersion;
  readonly recipeType: typeof syntheticFirmwareBuildRecipeType;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly inputs: readonly SyntheticFirmwareBuildRecipeInputV1[];
  readonly output: SyntheticFirmwareBuildRecipeOutputV1;
}

export interface SyntheticFirmwareFixtureBuildRequest {
  readonly schemaVersion: "1";
  readonly operation: "SYNTHETIC_FIXTURE_OUTPUT_COMPARISON";
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly recipe: Readonly<{
    sourcePath: string;
    sizeBytes: number;
    sha256: string;
  }>;
  readonly inputs: readonly SyntheticFirmwareBuildRecipeInputV1[];
  readonly expectedOutput: SyntheticFirmwareBuildRecipeOutputV1;
}

export const syntheticFirmwareFixtureBuildReceiptType =
  "synthetic-firmware-fixture-build-receipt" as const;

export interface SyntheticFirmwareFixtureBuildReceipt {
  readonly receiptSchema: "1";
  readonly receiptType: typeof syntheticFirmwareFixtureBuildReceiptType;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly recipeSha256: string;
  readonly declaredInputCount: 6;
  readonly outputName: string;
  readonly outputMediaType: "application/gzip";
  readonly outputSizeBytes: number;
  readonly outputSha256: string;
}

export type SyntheticFirmwareBuildOutputChunkSink = (chunk: Uint8Array) => void;

/**
 * Fixture-output boundary only. It cannot invoke or represent a real
 * toolchain, admit Firmware, or authorize any writer. Core independently
 * hashes every emitted byte and compares it with signed Synthetic evidence.
 */
export interface SyntheticFirmwareFixtureBuildOutputProvider {
  readonly assurance: "SYNTHETIC_ONLY";
  produceFixtureBuildOutput(
    request: SyntheticFirmwareFixtureBuildRequest,
    emitChunk: SyntheticFirmwareBuildOutputChunkSink,
    signal?: CancellationSignal,
  ): Promise<SyntheticFirmwareFixtureBuildReceipt>;
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
