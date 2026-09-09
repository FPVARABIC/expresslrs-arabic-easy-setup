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

export interface SyntheticFirmwareDistributionCandidateRecord {
  readonly distributionRootVerification: object;
  readonly targetIdentifier: string;
  readonly rootVersion: number;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
  readonly correspondingSourceSha256: string;
  readonly noticesSha256: string;
}

export interface SyntheticSourceInventoryEntryRecord {
  readonly path: string;
  readonly role: "SOURCE" | "BUILD_INPUT" | "LICENSE";
  readonly buildInputId:
    | "upstream-source"
    | "targets-snapshot"
    | "patch-set"
    | "toolchain"
    | "dependency-lock"
    | "build-configuration"
    | null;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface SyntheticSourceInventoryInspectionRecord {
  readonly distributionRootVerification: object;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
  readonly correspondingSourceSha256: string;
  readonly entries: readonly SyntheticSourceInventoryEntryRecord[];
  readonly sourceEntryCount: number;
  readonly buildInputCount: number;
  readonly licenseEntryCount: number;
}

export interface SyntheticNoticeInspectionRecord {
  readonly distributionRootVerification: object;
  readonly sourceInspection: object;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
  readonly correspondingSourceSha256: string;
  readonly noticesSha256: string;
  readonly noticeEntryCount: number;
}

export interface SyntheticFirmwareSourceReviewRecord {
  readonly distributionCandidate: object;
  readonly sourceInspection: object;
  readonly noticesInspection: object;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
  readonly correspondingSourceSha256: string;
  readonly noticesSha256: string;
}

export interface SyntheticFirmwareBuildRecipeInputRecord {
  readonly buildInputId:
    | "upstream-source"
    | "targets-snapshot"
    | "patch-set"
    | "toolchain"
    | "dependency-lock";
  readonly sourcePath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface SyntheticFirmwareBuildRecipeInspectionRecord {
  readonly sourceReviewEvidence: object;
  readonly targetIdentifier: string;
  readonly rootVersion: number;
  readonly releaseSequence: number;
  readonly recipePath: string;
  readonly recipeSizeBytes: number;
  readonly recipeSha256: string;
  readonly inputs: readonly SyntheticFirmwareBuildRecipeInputRecord[];
  readonly output: Readonly<{
    readonly name: string;
    readonly mediaType: "application/gzip";
    readonly sizeBytes: number;
    readonly sha256: string;
  }>;
}

export interface SyntheticFirmwareBuildOutputComparisonRecord {
  readonly sourceReviewEvidence: object;
  readonly recipeInspection: object;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly recipeSha256: string;
  readonly artifactSha256: string;
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

export const syntheticFirmwareDistributionCandidateRecords = new WeakMap<
  object,
  SyntheticFirmwareDistributionCandidateRecord
>();

export const syntheticSourceInventoryInspectionRecords = new WeakMap<
  object,
  SyntheticSourceInventoryInspectionRecord
>();

export const syntheticNoticeInspectionRecords = new WeakMap<
  object,
  SyntheticNoticeInspectionRecord
>();

export const syntheticFirmwareSourceReviewRecords = new WeakMap<
  object,
  SyntheticFirmwareSourceReviewRecord
>();

export const syntheticFirmwareBuildRecipeInspectionRecords = new WeakMap<
  object,
  SyntheticFirmwareBuildRecipeInspectionRecord
>();

export const syntheticFirmwareBuildOutputComparisonRecords = new WeakMap<
  object,
  SyntheticFirmwareBuildOutputComparisonRecord
>();
