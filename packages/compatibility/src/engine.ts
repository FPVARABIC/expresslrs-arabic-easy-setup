import type {
  DeviceIdentityResolution,
  OperationErrorCode,
} from "@elrs-easy/domain";

import type { TargetCatalog, TargetDefinition } from "./catalog.js";

export const compatibilityStatuses = [
  "COMPATIBLE",
  "BLOCKED",
  "UNKNOWN",
] as const;
export type CompatibilityStatus = (typeof compatibilityStatuses)[number];

export const compatibilityReasons = [
  "IDENTITY_NOT_CONFIRMED",
  "TARGET_NOT_RESOLVED",
  "TARGET_NOT_IN_CATALOG",
  "ARTIFACT_TARGET_MISMATCH",
  "FIRMWARE_MAJOR_UNSUPPORTED",
  "UPDATE_PROVIDER_UNSUPPORTED",
  "COMPATIBLE_BY_PINNED_CATALOG",
] as const;
export type CompatibilityReason = (typeof compatibilityReasons)[number];

export interface FirmwareArtifactDescriptor {
  readonly targetId: string;
  readonly firmwareVersion: string;
  readonly sha256: string;
}

export interface CompatibilityDecision {
  readonly status: CompatibilityStatus;
  readonly reasons: readonly CompatibilityReason[];
  readonly target: TargetDefinition | null;
  readonly blockingErrorCode: OperationErrorCode | null;
}

const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

function parseFirmwareMajor(version: unknown): number | null {
  if (typeof version !== "string") {
    return null;
  }
  const match = semanticVersionPattern.exec(version);
  if (match === null) {
    return null;
  }

  const prerelease = match[4];
  if (
    prerelease
      ?.split(".")
      .some(
        (identifier) =>
          /^\d+$/u.test(identifier) &&
          identifier.length > 1 &&
          identifier.startsWith("0"),
      ) === true
  ) {
    return null;
  }

  const major = Number(match[1]);
  return Number.isSafeInteger(major) ? major : null;
}

export function evaluateFirmwareCompatibility(input: {
  readonly identity: DeviceIdentityResolution;
  readonly artifact: FirmwareArtifactDescriptor;
  readonly updateProvider: string;
  readonly catalog: TargetCatalog;
}): CompatibilityDecision {
  if (input.identity.confidence !== "CONFIRMED") {
    return {
      status: "BLOCKED",
      reasons: ["IDENTITY_NOT_CONFIRMED"],
      target: null,
      blockingErrorCode:
        input.identity.confidence === "AMBIGUOUS"
          ? "IDENTITY_AMBIGUOUS"
          : "IDENTITY_UNKNOWN",
    };
  }

  if (input.identity.selectedTargetId === null) {
    return {
      status: "BLOCKED",
      reasons: ["TARGET_NOT_RESOLVED"],
      target: null,
      blockingErrorCode: "TARGET_UNKNOWN",
    };
  }

  const target = input.catalog.get(input.identity.selectedTargetId);
  if (target === null) {
    return {
      status: "UNKNOWN",
      reasons: ["TARGET_NOT_IN_CATALOG"],
      target: null,
      blockingErrorCode: "TARGET_UNKNOWN",
    };
  }

  if (
    input.artifact.targetId.trim().toLocaleLowerCase("en-US") !==
    target.targetId.trim().toLocaleLowerCase("en-US")
  ) {
    return {
      status: "BLOCKED",
      reasons: ["ARTIFACT_TARGET_MISMATCH"],
      target,
      blockingErrorCode: "TARGET_MISMATCH",
    };
  }

  const major = parseFirmwareMajor(input.artifact.firmwareVersion);
  if (major === null || !target.supportedFirmwareMajors.includes(major)) {
    return {
      status: "BLOCKED",
      reasons: ["FIRMWARE_MAJOR_UNSUPPORTED"],
      target,
      blockingErrorCode: "VERSION_INCOMPATIBLE",
    };
  }

  if (!target.updateProviders.includes(input.updateProvider)) {
    return {
      status: "BLOCKED",
      reasons: ["UPDATE_PROVIDER_UNSUPPORTED"],
      target,
      blockingErrorCode: "PROVIDER_UNSUPPORTED",
    };
  }

  return {
    status: "COMPATIBLE",
    reasons: ["COMPATIBLE_BY_PINNED_CATALOG"],
    target,
    blockingErrorCode: null,
  };
}
