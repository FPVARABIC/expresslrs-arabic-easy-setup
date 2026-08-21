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

/** Internal provenance brands; this module is intentionally not re-exported. */
export const syntheticRootRotationRecords = new WeakMap<
  object,
  SyntheticRootRotationRecord
>();

export const syntheticManifestRootVerificationRecords = new WeakMap<
  object,
  SyntheticManifestRootVerificationRecord
>();
