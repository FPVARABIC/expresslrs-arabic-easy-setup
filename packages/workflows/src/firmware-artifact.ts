import type { FirmwareUpdateArtifact } from "@elrs-easy/compatibility";
import {
  artifactProvenanceSchemaVersion,
  type ArtifactProvenance,
  type ArtifactProvenanceValidationLevel,
} from "@elrs-easy/domain";

import { readOwnDataProperty } from "./sensitive-operation-helpers.js";

export const firmwareArtifactSnapshotBlockReasons = [
  "FIRMWARE_ARTIFACT_DESCRIPTOR_INVALID",
  "ARTIFACT_PROVENANCE_INVALID",
  "ARTIFACT_PROVENANCE_MISMATCH",
] as const;

export type FirmwareArtifactSnapshotBlockReason =
  (typeof firmwareArtifactSnapshotBlockReasons)[number];

export type FirmwareArtifactSnapshot =
  | {
      readonly status: "READY";
      readonly artifact: FirmwareUpdateArtifact;
      readonly provenanceValidation: ArtifactProvenanceValidationLevel;
    }
  | {
      readonly status: "BLOCKED";
      readonly reason: FirmwareArtifactSnapshotBlockReason;
    };

const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const canonicalGitShaPattern = /^[0-9a-f]{40}$/u;
const targetIdPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const buildDigestPattern = /^sha256:[0-9a-f]{64}$/u;

function isBoundedCanonicalString(
  value: unknown,
  maximumLength = 256,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value === value.trim()
  );
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (!isBoundedCanonicalString(value, 32) || !value.endsWith("Z")) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isSafeHttpsRepository(value: unknown): value is string {
  if (!isBoundedCanonicalString(value, 512)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function rebuildProvenance(value: unknown): ArtifactProvenance | null {
  const schemaVersion = readOwnDataProperty(value, "schemaVersion");
  const applicationVersion = readOwnDataProperty(value, "applicationVersion");
  const coreVersion = readOwnDataProperty(value, "coreVersion");
  const upstreamRepository = readOwnDataProperty(value, "upstreamRepository");
  const upstreamVersion = readOwnDataProperty(value, "upstreamVersion");
  const upstreamCommitSha = readOwnDataProperty(value, "upstreamCommitSha");
  const patchSetVersion = readOwnDataProperty(value, "patchSetVersion");
  const targetId = readOwnDataProperty(value, "targetId");
  const buildConfigurationDigest = readOwnDataProperty(
    value,
    "buildConfigurationDigest",
  );
  const toolchainIdentity = readOwnDataProperty(value, "toolchainIdentity");
  const builtAt = readOwnDataProperty(value, "builtAt");
  const artifactSizeBytes = readOwnDataProperty(value, "artifactSizeBytes");
  const artifactSha256 = readOwnDataProperty(value, "artifactSha256");

  if (
    schemaVersion !== artifactProvenanceSchemaVersion ||
    !isBoundedCanonicalString(applicationVersion, 128) ||
    !isBoundedCanonicalString(coreVersion, 128) ||
    !isSafeHttpsRepository(upstreamRepository) ||
    !isBoundedCanonicalString(upstreamVersion, 128) ||
    typeof upstreamCommitSha !== "string" ||
    !canonicalGitShaPattern.test(upstreamCommitSha) ||
    !isBoundedCanonicalString(patchSetVersion, 128) ||
    typeof targetId !== "string" ||
    !targetIdPattern.test(targetId) ||
    typeof buildConfigurationDigest !== "string" ||
    !buildDigestPattern.test(buildConfigurationDigest) ||
    !isBoundedCanonicalString(toolchainIdentity, 256) ||
    !isCanonicalUtcTimestamp(builtAt) ||
    typeof artifactSizeBytes !== "number" ||
    !Number.isSafeInteger(artifactSizeBytes) ||
    artifactSizeBytes <= 0 ||
    typeof artifactSha256 !== "string" ||
    !canonicalSha256Pattern.test(artifactSha256)
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion,
    applicationVersion,
    coreVersion,
    upstreamRepository,
    upstreamVersion,
    upstreamCommitSha,
    patchSetVersion,
    targetId,
    buildConfigurationDigest,
    toolchainIdentity,
    builtAt,
    artifactSizeBytes,
    artifactSha256,
  });
}

/**
 * Rebuilds one execution artifact from fixed own data properties. This proves
 * only safe shape and internal coherence; it does not verify a signature or an
 * official build source.
 */
export function snapshotFirmwareUpdateArtifact(
  value: unknown,
): FirmwareArtifactSnapshot {
  const targetId = readOwnDataProperty(value, "targetId");
  const firmwareVersion = readOwnDataProperty(value, "firmwareVersion");
  const sha256 = readOwnDataProperty(value, "sha256");
  const provenanceValue = readOwnDataProperty(value, "provenance");

  if (
    typeof targetId !== "string" ||
    !targetIdPattern.test(targetId) ||
    !isBoundedCanonicalString(firmwareVersion, 128) ||
    typeof sha256 !== "string" ||
    !canonicalSha256Pattern.test(sha256)
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DESCRIPTOR_INVALID",
    });
  }

  const provenance = rebuildProvenance(provenanceValue);
  if (provenance === null) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "ARTIFACT_PROVENANCE_INVALID",
    });
  }
  if (
    provenance.targetId !== targetId ||
    provenance.artifactSha256 !== sha256
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "ARTIFACT_PROVENANCE_MISMATCH",
    });
  }

  return Object.freeze({
    status: "READY",
    provenanceValidation: "COHERENCE_ONLY",
    artifact: Object.freeze({
      targetId,
      firmwareVersion,
      sha256,
      provenance,
    }),
  });
}
