export interface SyntheticRootRotationRecord {
  readonly currentRoot: object;
  readonly incomingRoot: object;
  readonly currentVersion: number;
  readonly incomingVersion: number;
}

export interface SyntheticManifestRootVerificationRecord {
  readonly parsedRoot: object;
  readonly rootVersion: number;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
}

export interface SyntheticDualFormManifestParseRecord {
  readonly keyId: string;
  readonly signature: Uint8Array;
  readonly signatureInput: Uint8Array;
  readonly requiredRootMetadataVersion: number;
  readonly targetIdentifier: string;
  readonly artifactName: string;
  readonly compressedSizeBytes: number;
  readonly compressedSha256: string;
  readonly decompressedSizeBytes: number;
  readonly decompressedSha256: string;
  readonly releaseSequence: number;
}

export interface SyntheticDualFormManifestRootVerificationRecord extends SyntheticManifestRootVerificationRecord {
  readonly parsedManifest: object;
  readonly artifactName: string;
  readonly compressedSizeBytes: number;
  readonly compressedSha256: string;
  readonly decompressedSizeBytes: number;
  readonly decompressedSha256: string;
}

export interface SyntheticDistributionObjectRecord {
  readonly objectRole: "firmware-artifact" | "corresponding-source" | "notices";
  readonly name: string;
  readonly url: string;
  readonly mediaType: "application/gzip" | "application/json";
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface SyntheticDistributionManifestParseRecord {
  readonly keyId: string;
  readonly signature: Uint8Array;
  readonly signatureInput: Uint8Array;
  readonly requiredRootMetadataVersion: number;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifact: SyntheticDistributionObjectRecord;
  readonly correspondingSource: SyntheticDistributionObjectRecord;
  readonly notices: SyntheticDistributionObjectRecord;
}

export interface SyntheticDistributionManifestRootVerificationRecord {
  readonly parsedRoot: object;
  readonly parsedManifest: object;
  readonly rootVersion: number;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifact: SyntheticDistributionObjectRecord;
  readonly correspondingSource: SyntheticDistributionObjectRecord;
  readonly notices: SyntheticDistributionObjectRecord;
}

export interface SyntheticCompressedArtifactValidationRecord {
  readonly targetIdentifier: string;
  readonly compressedSizeBytes: number;
  readonly compressedSha256: string;
  readonly decompressedSizeBytes: number;
  readonly decompressedSha256: string;
}

export interface SyntheticReleaseTransitionRecord {
  readonly status: "ADVANCED_UNPERSISTED" | "UNCHANGED_UNPERSISTED";
  readonly verification: object;
  readonly stateBefore: object;
  readonly stateAfter: object;
  readonly rootVersion: number;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
}

export interface SyntheticFirmwareCatalogCandidateRecord {
  readonly manifestRootVerification: object;
  readonly parsedRoot: object;
  readonly rootVersion: number;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactName: string;
  readonly compressedSizeBytes: number;
  readonly compressedSha256: string;
}

export interface SyntheticFirmwareAcquisitionRecord extends SyntheticDistributionObjectRecord {
  readonly distributionRootVerification: object;
  readonly acquisitionAssurance: "SYNTHETIC_ONLY";
  readonly digestAssurance: "CRYPTOGRAPHIC" | "SYNTHETIC_ONLY";
}

/** Internal provenance brands; this module is intentionally not re-exported. */
export const syntheticRootRotationRecords = new WeakMap<
  object,
  SyntheticRootRotationRecord
>();

export const syntheticManifestRootVerificationRecords = new WeakMap<
  object,
  SyntheticManifestRootVerificationRecord
>();

export const syntheticDualFormManifestParseRecords = new WeakMap<
  object,
  SyntheticDualFormManifestParseRecord
>();

export const syntheticDualFormManifestRootVerificationRecords = new WeakMap<
  object,
  SyntheticDualFormManifestRootVerificationRecord
>();

export const syntheticDistributionManifestParseRecords = new WeakMap<
  object,
  SyntheticDistributionManifestParseRecord
>();

export const syntheticDistributionManifestRootVerificationRecords = new WeakMap<
  object,
  SyntheticDistributionManifestRootVerificationRecord
>();

export const syntheticCompressedArtifactValidationRecords = new WeakMap<
  object,
  SyntheticCompressedArtifactValidationRecord
>();

export const syntheticReleaseTransitionRecords = new WeakMap<
  object,
  SyntheticReleaseTransitionRecord
>();

export const syntheticFirmwareCatalogCandidateRecords = new WeakMap<
  object,
  SyntheticFirmwareCatalogCandidateRecord
>();

export const syntheticFirmwareAcquisitionRecords = new WeakMap<
  object,
  SyntheticFirmwareAcquisitionRecord
>();
