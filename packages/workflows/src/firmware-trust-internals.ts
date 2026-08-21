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

export const syntheticCompressedArtifactValidationRecords = new WeakMap<
  object,
  SyntheticCompressedArtifactValidationRecord
>();

export const syntheticReleaseTransitionRecords = new WeakMap<
  object,
  SyntheticReleaseTransitionRecord
>();
