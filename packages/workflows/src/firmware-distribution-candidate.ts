import { currentArtifactManifestTrustStatus } from "@elrs-easy/domain";

import type { SyntheticFirmwareAcquisitionResult } from "./firmware-acquisition.js";
import type { SyntheticFirmwareCatalogCandidateEvidenceResult } from "./firmware-catalog-candidate.js";
import type { SyntheticFirmwareDistributionManifestRootVerificationResult } from "./firmware-root-metadata.js";
import {
  syntheticDistributionManifestRootVerificationRecords,
  syntheticFirmwareAcquisitionRecords,
  syntheticFirmwareCatalogCandidateRecords,
  syntheticFirmwareDistributionCandidateRecords,
  type SyntheticDistributionObjectRecord,
  type SyntheticFirmwareAcquisitionRecord,
} from "./firmware-trust-internals.js";
import { readOwnDataProperty } from "./sensitive-operation-helpers.js";

export const syntheticFirmwareDistributionCandidateBlockReasons = [
  "SYNTHETIC_CATALOG_CANDIDATE_NOT_PROVEN",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
  "SYNTHETIC_DISTRIBUTION_ROOT_MISMATCH",
  "SYNTHETIC_DISTRIBUTION_ARTIFACT_MISMATCH",
  "SYNTHETIC_FIRMWARE_ACQUISITION_NOT_PROVEN",
  "SYNTHETIC_CORRESPONDING_SOURCE_ACQUISITION_NOT_PROVEN",
  "SYNTHETIC_NOTICES_ACQUISITION_NOT_PROVEN",
  "SYNTHETIC_DISTRIBUTION_ACQUISITION_MISMATCH",
] as const;

export type SyntheticFirmwareDistributionCandidateBlockReason =
  (typeof syntheticFirmwareDistributionCandidateBlockReasons)[number];

export type SyntheticFirmwareDistributionCandidateEvidenceResult =
  | Readonly<{
      status: "SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE";
      validationLevel: "SYNTHETIC_ONLY";
      distributionManifestStatus: "VERIFIED_DISTRIBUTION_AGAINST_UNTRUSTED_ROOT";
      acquisitionStatus: "VERIFIED_SYNTHETIC_ACQUISITION";
      correspondingSourceDisposition: "EXACT_BYTES_VERIFIED_CONTENTS_UNINSPECTED";
      noticesDisposition: "EXACT_BYTES_VERIFIED_CONTENTS_UNINSPECTED";
      trustStatus: typeof currentArtifactManifestTrustStatus;
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC";
      byteDisposition: "HASHED_AND_DISCARDED";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
      targetIdentifier: string;
      rootVersion: number;
      releaseSequence: number;
      artifactName: string;
      artifactSizeBytes: number;
      artifactSha256: string;
      correspondingSourceName: string;
      correspondingSourceSizeBytes: number;
      correspondingSourceSha256: string;
      noticesName: string;
      noticesSizeBytes: number;
      noticesSha256: string;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareDistributionCandidateBlockReason;
    }>;

function blocked(
  reason: SyntheticFirmwareDistributionCandidateBlockReason,
): SyntheticFirmwareDistributionCandidateEvidenceResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

function acquisitionRecord(
  value: unknown,
): SyntheticFirmwareAcquisitionRecord | undefined {
  return typeof value === "object" && value !== null
    ? syntheticFirmwareAcquisitionRecords.get(value)
    : undefined;
}

function matchesObject(
  acquisition: SyntheticFirmwareAcquisitionRecord,
  expected: SyntheticDistributionObjectRecord,
  distributionRootVerification: object,
): boolean {
  return (
    acquisition.distributionRootVerification === distributionRootVerification &&
    acquisition.objectRole === expected.objectRole &&
    acquisition.name === expected.name &&
    acquisition.url === expected.url &&
    acquisition.mediaType === expected.mediaType &&
    acquisition.sizeBytes === expected.sizeBytes &&
    acquisition.sha256 === expected.sha256
  );
}

/**
 * Joins acquisition/source evidence with the existing non-admitted catalog
 * candidate. It creates no catalog record and exposes no acquired bytes.
 */
export function createSyntheticFirmwareDistributionCandidateEvidence(input: {
  readonly catalogCandidate: SyntheticFirmwareCatalogCandidateEvidenceResult;
  readonly distributionRootVerification: SyntheticFirmwareDistributionManifestRootVerificationResult;
  readonly firmwareAcquisition: SyntheticFirmwareAcquisitionResult;
  readonly correspondingSourceAcquisition: SyntheticFirmwareAcquisitionResult;
  readonly noticesAcquisition: SyntheticFirmwareAcquisitionResult;
}): SyntheticFirmwareDistributionCandidateEvidenceResult {
  const catalogCandidate = readOwnDataProperty(input, "catalogCandidate");
  const catalogRecord =
    typeof catalogCandidate === "object" && catalogCandidate !== null
      ? syntheticFirmwareCatalogCandidateRecords.get(catalogCandidate)
      : undefined;
  if (catalogRecord === undefined) {
    return blocked("SYNTHETIC_CATALOG_CANDIDATE_NOT_PROVEN");
  }

  const distributionRootVerification = readOwnDataProperty(
    input,
    "distributionRootVerification",
  );
  const distributionRecord =
    typeof distributionRootVerification === "object" &&
    distributionRootVerification !== null
      ? syntheticDistributionManifestRootVerificationRecords.get(
          distributionRootVerification,
        )
      : undefined;
  if (distributionRecord === undefined) {
    return blocked(
      "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    );
  }
  if (
    catalogRecord.parsedRoot !== distributionRecord.parsedRoot ||
    catalogRecord.rootVersion !== distributionRecord.rootVersion
  ) {
    return blocked("SYNTHETIC_DISTRIBUTION_ROOT_MISMATCH");
  }
  if (
    catalogRecord.targetIdentifier !== distributionRecord.targetIdentifier ||
    catalogRecord.releaseSequence !== distributionRecord.releaseSequence ||
    catalogRecord.artifactName !== distributionRecord.artifact.name ||
    catalogRecord.compressedSizeBytes !==
      distributionRecord.artifact.sizeBytes ||
    catalogRecord.compressedSha256 !== distributionRecord.artifact.sha256
  ) {
    return blocked("SYNTHETIC_DISTRIBUTION_ARTIFACT_MISMATCH");
  }

  const firmwareAcquisition = acquisitionRecord(
    readOwnDataProperty(input, "firmwareAcquisition"),
  );
  if (firmwareAcquisition === undefined) {
    return blocked("SYNTHETIC_FIRMWARE_ACQUISITION_NOT_PROVEN");
  }
  const correspondingSourceAcquisition = acquisitionRecord(
    readOwnDataProperty(input, "correspondingSourceAcquisition"),
  );
  if (correspondingSourceAcquisition === undefined) {
    return blocked("SYNTHETIC_CORRESPONDING_SOURCE_ACQUISITION_NOT_PROVEN");
  }
  const noticesAcquisition = acquisitionRecord(
    readOwnDataProperty(input, "noticesAcquisition"),
  );
  if (noticesAcquisition === undefined) {
    return blocked("SYNTHETIC_NOTICES_ACQUISITION_NOT_PROVEN");
  }

  if (
    !matchesObject(
      firmwareAcquisition,
      distributionRecord.artifact,
      distributionRootVerification as object,
    ) ||
    !matchesObject(
      correspondingSourceAcquisition,
      distributionRecord.correspondingSource,
      distributionRootVerification as object,
    ) ||
    !matchesObject(
      noticesAcquisition,
      distributionRecord.notices,
      distributionRootVerification as object,
    )
  ) {
    return blocked("SYNTHETIC_DISTRIBUTION_ACQUISITION_MISMATCH");
  }

  const result: SyntheticFirmwareDistributionCandidateEvidenceResult =
    Object.freeze({
      status: "SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE",
      validationLevel: "SYNTHETIC_ONLY",
      distributionManifestStatus:
        "VERIFIED_DISTRIBUTION_AGAINST_UNTRUSTED_ROOT",
      acquisitionStatus: "VERIFIED_SYNTHETIC_ACQUISITION",
      correspondingSourceDisposition:
        "EXACT_BYTES_VERIFIED_CONTENTS_UNINSPECTED",
      noticesDisposition: "EXACT_BYTES_VERIFIED_CONTENTS_UNINSPECTED",
      trustStatus: currentArtifactManifestTrustStatus,
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
      byteDisposition: "HASHED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: distributionRecord.targetIdentifier,
      rootVersion: distributionRecord.rootVersion,
      releaseSequence: distributionRecord.releaseSequence,
      artifactName: distributionRecord.artifact.name,
      artifactSizeBytes: distributionRecord.artifact.sizeBytes,
      artifactSha256: distributionRecord.artifact.sha256,
      correspondingSourceName: distributionRecord.correspondingSource.name,
      correspondingSourceSizeBytes:
        distributionRecord.correspondingSource.sizeBytes,
      correspondingSourceSha256: distributionRecord.correspondingSource.sha256,
      noticesName: distributionRecord.notices.name,
      noticesSizeBytes: distributionRecord.notices.sizeBytes,
      noticesSha256: distributionRecord.notices.sha256,
    });
  syntheticFirmwareDistributionCandidateRecords.set(result, {
    distributionRootVerification: distributionRootVerification as object,
    targetIdentifier: distributionRecord.targetIdentifier,
    rootVersion: distributionRecord.rootVersion,
    releaseSequence: distributionRecord.releaseSequence,
    artifactSha256: distributionRecord.artifact.sha256,
    correspondingSourceSha256: distributionRecord.correspondingSource.sha256,
    noticesSha256: distributionRecord.notices.sha256,
  });
  return result;
}
