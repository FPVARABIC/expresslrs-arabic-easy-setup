import { currentArtifactManifestTrustStatus } from "@elrs-easy/domain";

import type { SyntheticCompressedFirmwareArtifactValidation } from "./firmware-compressed-artifact.js";
import type { SyntheticDualFormFirmwareManifestRootVerificationResult } from "./firmware-root-metadata.js";
import {
  syntheticCompressedArtifactValidationRecords,
  syntheticDualFormManifestRootVerificationRecords,
  syntheticFirmwareCatalogCandidateRecords,
  syntheticReleaseTransitionRecords,
} from "./firmware-trust-internals.js";
import type { SyntheticFirmwareReleaseStateTransitionResult } from "./firmware-trust-state.js";
import { readOwnDataProperty } from "./sensitive-operation-helpers.js";

export const syntheticFirmwareCatalogCandidateBlockReasons = [
  "SYNTHETIC_DUAL_FORM_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
  "SYNTHETIC_COMPRESSED_ARTIFACT_VALIDATION_NOT_PROVEN",
  "SYNTHETIC_RELEASE_ROLLBACK_EVIDENCE_NOT_PROVEN",
  "SYNTHETIC_RELEASE_ROLLBACK_EVIDENCE_MISMATCH",
  "SYNTHETIC_DUAL_FORM_MANIFEST_ARTIFACT_MISMATCH",
] as const;

export type SyntheticFirmwareCatalogCandidateBlockReason =
  (typeof syntheticFirmwareCatalogCandidateBlockReasons)[number];

export type SyntheticFirmwareCatalogCandidateEvidenceResult =
  | Readonly<{
      status: "SYNTHETIC_CATALOG_CANDIDATE_EVIDENCE";
      validationLevel: "SYNTHETIC_ONLY";
      manifestSchema: "2";
      manifestRootStatus: "VERIFIED_DUAL_FORM_AGAINST_UNTRUSTED_ROOT";
      artifactValidationStatus: "VERIFIED_SYNTHETIC_FIXTURE";
      rollbackStatus: "ADVANCED_UNPERSISTED" | "UNCHANGED_UNPERSISTED";
      trustStatus: typeof currentArtifactManifestTrustStatus;
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
      targetIdentifier: string;
      artifactName: string;
      rootVersion: number;
      releaseSequence: number;
      compressedSizeBytes: number;
      compressedSha256: string;
      decompressedSizeBytes: number;
      decompressedSha256: string;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareCatalogCandidateBlockReason;
    }>;

function blocked(
  reason: SyntheticFirmwareCatalogCandidateBlockReason,
): SyntheticFirmwareCatalogCandidateEvidenceResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/**
 * Links three independently branded evidence objects. The result is review
 * evidence only: it is neither a catalog record nor a source of writable bytes.
 */
export function createSyntheticFirmwareCatalogCandidateEvidence(input: {
  readonly manifestRootVerification: SyntheticDualFormFirmwareManifestRootVerificationResult;
  readonly artifactValidation: SyntheticCompressedFirmwareArtifactValidation;
  readonly rollbackEvidence: SyntheticFirmwareReleaseStateTransitionResult;
}): SyntheticFirmwareCatalogCandidateEvidenceResult {
  const manifestRootVerification = readOwnDataProperty(
    input,
    "manifestRootVerification",
  );
  const artifactValidation = readOwnDataProperty(input, "artifactValidation");
  const rollbackEvidence = readOwnDataProperty(input, "rollbackEvidence");
  const rootRecord =
    typeof manifestRootVerification === "object" &&
    manifestRootVerification !== null
      ? syntheticDualFormManifestRootVerificationRecords.get(
          manifestRootVerification,
        )
      : undefined;
  if (rootRecord === undefined) {
    return blocked("SYNTHETIC_DUAL_FORM_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN");
  }

  const artifactRecord =
    typeof artifactValidation === "object" && artifactValidation !== null
      ? syntheticCompressedArtifactValidationRecords.get(artifactValidation)
      : undefined;
  if (artifactRecord === undefined) {
    return blocked("SYNTHETIC_COMPRESSED_ARTIFACT_VALIDATION_NOT_PROVEN");
  }

  const rollbackRecord =
    typeof rollbackEvidence === "object" && rollbackEvidence !== null
      ? syntheticReleaseTransitionRecords.get(rollbackEvidence)
      : undefined;
  if (rollbackRecord === undefined) {
    return blocked("SYNTHETIC_RELEASE_ROLLBACK_EVIDENCE_NOT_PROVEN");
  }
  if (
    rollbackRecord.verification !== manifestRootVerification ||
    rollbackRecord.rootVersion !== rootRecord.rootVersion ||
    rollbackRecord.targetIdentifier !== rootRecord.targetIdentifier ||
    rollbackRecord.releaseSequence !== rootRecord.releaseSequence ||
    rollbackRecord.artifactSha256 !== rootRecord.compressedSha256
  ) {
    return blocked("SYNTHETIC_RELEASE_ROLLBACK_EVIDENCE_MISMATCH");
  }

  if (
    artifactRecord.targetIdentifier !== rootRecord.targetIdentifier ||
    artifactRecord.compressedSizeBytes !== rootRecord.compressedSizeBytes ||
    artifactRecord.compressedSha256 !== rootRecord.compressedSha256 ||
    artifactRecord.decompressedSizeBytes !== rootRecord.decompressedSizeBytes ||
    artifactRecord.decompressedSha256 !== rootRecord.decompressedSha256
  ) {
    return blocked("SYNTHETIC_DUAL_FORM_MANIFEST_ARTIFACT_MISMATCH");
  }

  const result: SyntheticFirmwareCatalogCandidateEvidenceResult = Object.freeze(
    {
      status: "SYNTHETIC_CATALOG_CANDIDATE_EVIDENCE",
      validationLevel: "SYNTHETIC_ONLY",
      manifestSchema: "2",
      manifestRootStatus: "VERIFIED_DUAL_FORM_AGAINST_UNTRUSTED_ROOT",
      artifactValidationStatus: "VERIFIED_SYNTHETIC_FIXTURE",
      rollbackStatus: rollbackRecord.status,
      trustStatus: currentArtifactManifestTrustStatus,
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: rootRecord.targetIdentifier,
      artifactName: rootRecord.artifactName,
      rootVersion: rootRecord.rootVersion,
      releaseSequence: rootRecord.releaseSequence,
      compressedSizeBytes: rootRecord.compressedSizeBytes,
      compressedSha256: rootRecord.compressedSha256,
      decompressedSizeBytes: rootRecord.decompressedSizeBytes,
      decompressedSha256: rootRecord.decompressedSha256,
    },
  );
  syntheticFirmwareCatalogCandidateRecords.set(result, {
    manifestRootVerification,
    parsedRoot: rootRecord.parsedRoot,
    rootVersion: rootRecord.rootVersion,
    targetIdentifier: rootRecord.targetIdentifier,
    releaseSequence: rootRecord.releaseSequence,
    artifactName: rootRecord.artifactName,
    compressedSizeBytes: rootRecord.compressedSizeBytes,
    compressedSha256: rootRecord.compressedSha256,
  });
  return result;
}
