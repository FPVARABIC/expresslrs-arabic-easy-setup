import {
  evaluateFirmwareCompatibility,
  type CompatibilityReason,
  type CompatibilityStatus,
  type FirmwareArtifactDescriptor,
  type TargetCatalog,
} from "@elrs-easy/compatibility";
import {
  rebuildDiscoveryDescriptors,
  rebuildProviderId,
  type DeviceSessionManager,
} from "@elrs-easy/device";
import type {
  ArtifactProvenance,
  CancellationSignal,
  Capability,
  DeviceDescriptor,
  DeviceIdentityResolution,
  DeviceSession,
  VerificationPlan,
  VerificationRequirement,
} from "@elrs-easy/domain";

import {
  acquireWorkflowSession,
  assertNotAborted,
  inspectHeldDevice,
  readProviderDataProperty,
  releaseIfHeld,
} from "./sensitive-operation-helpers.js";
import type {
  FirmwareUpdateExecutionAuthority,
  FirmwareUpdateProvider,
} from "./sensitive-operation-contracts.js";

export const firmwareUpdatePreviewBlockerCodes = [
  "HARDWARE_WRITE_DISABLED",
  "DEVICE_NOT_CONNECTED",
  "ARTIFACT_DESCRIPTOR_INVALID",
  "PROVENANCE_INVALID",
  "PROVENANCE_TARGET_MISMATCH",
  "PROVENANCE_ARTIFACT_MISMATCH",
  "ARTIFACT_INTEGRITY_NOT_CONFIRMED",
  "IDENTITY_NOT_CONFIRMED",
  "CATALOG_NOT_APPROVED",
  "TARGET_NOT_IN_CATALOG",
  "UPDATE_CAPABILITY_NOT_AVAILABLE",
  "UPDATE_CAPABILITY_EVIDENCE_MISSING",
  "COMPATIBILITY_NOT_PROVEN",
] as const;

export type FirmwareUpdatePreviewBlockerCode =
  (typeof firmwareUpdatePreviewBlockerCodes)[number];

export interface FirmwareUpdatePreviewBlocker {
  readonly code: FirmwareUpdatePreviewBlockerCode;
}

export const firmwareUpdatePreviewChangeCodes = [
  "FIRMWARE_WILL_BE_REPLACED",
  "DEVICE_WILL_REBOOT",
  "LINK_WILL_BE_INTERRUPTED",
] as const;

export type FirmwareUpdatePreviewChangeCode =
  (typeof firmwareUpdatePreviewChangeCodes)[number];

export interface FirmwareUpdatePreview {
  readonly schemaVersion: 1;
  readonly previewId: string;
  readonly operationId: string;
  readonly operationType: "FIRMWARE_UPDATE";
  readonly status: "READY" | "BLOCKED";
  readonly validationLevel: "SIMULATION_ONLY";
  readonly executionAuthority: FirmwareUpdateExecutionAuthority | "NONE";
  readonly providerId: string;
  readonly updateCapabilityId: string;
  readonly deviceId: string;
  readonly transport: string;
  readonly targetId: string | null;
  readonly targetDisplayName: string | null;
  readonly catalogSource: string;
  readonly catalogRevision: string;
  readonly catalogSchemaVersion: string;
  readonly catalogContentDigest: string;
  readonly artifact: FirmwareArtifactDescriptor | null;
  readonly provenance: ArtifactProvenance | null;
  readonly compatibilityStatus: CompatibilityStatus | "NOT_EVALUATED";
  readonly compatibilityReasons: readonly CompatibilityReason[];
  readonly changeCodes: readonly FirmwareUpdatePreviewChangeCode[];
  readonly verificationPlan: VerificationPlan | null;
  readonly blockers: readonly FirmwareUpdatePreviewBlocker[];
}

export interface FirmwareUpdateApproval {
  readonly schemaVersion: 1;
  readonly approved: true;
  readonly approvedAt: string;
  readonly previewId: string;
  readonly operationId: string;
  readonly providerId: string;
  readonly deviceId: string;
  readonly targetId: string;
  readonly catalogContentDigest: string;
  readonly executionAuthority: "SYNTHETIC_ONLY";
  readonly artifactTargetId: string;
  readonly firmwareVersion: string;
  readonly artifactSha256: string;
  readonly provenanceApplicationVersion: string;
  readonly provenanceCoreVersion: string;
  readonly provenanceUpstreamRepository: string;
  readonly provenanceUpstreamVersion: string;
  readonly provenanceUpstreamCommitSha: string;
  readonly provenancePatchSetVersion: string;
  readonly provenanceTargetId: string;
  readonly provenanceBuildConfigurationDigest: string;
  readonly provenanceToolchainIdentity: string;
  readonly provenanceBuiltAt: string;
  readonly provenanceArtifactSha256: string;
  readonly verificationPlanId: string;
}

const canonicalUtcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const gitShaPattern = /^[0-9a-f]{40}$/u;

function machineText(value: string, label: string): string {
  const text = value.trim();
  if (text.length === 0 || text.length > 256) {
    throw new TypeError(`${label} must be a non-empty bounded string`);
  }
  return text;
}

function dataText(
  input: unknown,
  key: string,
  maximumLength = 256,
): string | null {
  const value = readProviderDataProperty(input, key);
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maximumLength) {
    return null;
  }
  return text;
}

export function rebuildFirmwareArtifactDescriptor(
  input: unknown,
): FirmwareArtifactDescriptor | null {
  const targetId = dataText(input, "targetId");
  const firmwareVersion = dataText(input, "firmwareVersion");
  const sha256 = dataText(input, "sha256", 64);
  if (
    targetId === null ||
    firmwareVersion === null ||
    sha256 === null ||
    !sha256Pattern.test(sha256)
  ) {
    return null;
  }
  return Object.freeze({ targetId, firmwareVersion, sha256 });
}

export function rebuildArtifactProvenance(
  input: unknown,
): ArtifactProvenance | null {
  const applicationVersion = dataText(input, "applicationVersion");
  const coreVersion = dataText(input, "coreVersion");
  const upstreamRepository = dataText(input, "upstreamRepository", 512);
  const upstreamVersion = dataText(input, "upstreamVersion");
  const upstreamCommitSha = dataText(input, "upstreamCommitSha", 40);
  const patchSetVersion = dataText(input, "patchSetVersion");
  const targetId = dataText(input, "targetId");
  const buildConfigurationDigest = dataText(
    input,
    "buildConfigurationDigest",
    64,
  );
  const toolchainIdentity = dataText(input, "toolchainIdentity", 512);
  const builtAt = dataText(input, "builtAt");
  const artifactSha256 = dataText(input, "artifactSha256", 64);

  if (
    applicationVersion === null ||
    coreVersion === null ||
    upstreamRepository === null ||
    upstreamVersion === null ||
    upstreamCommitSha === null ||
    patchSetVersion === null ||
    targetId === null ||
    buildConfigurationDigest === null ||
    toolchainIdentity === null ||
    builtAt === null ||
    artifactSha256 === null ||
    !gitShaPattern.test(upstreamCommitSha) ||
    !sha256Pattern.test(buildConfigurationDigest) ||
    !canonicalUtcTimestamp.test(builtAt) ||
    !sha256Pattern.test(artifactSha256)
  ) {
    return null;
  }

  return Object.freeze({
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
    artifactSha256,
  });
}

function blocker(
  code: FirmwareUpdatePreviewBlockerCode,
): FirmwareUpdatePreviewBlocker {
  return Object.freeze({ code });
}

function createVerificationPlan(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly artifact: FirmwareArtifactDescriptor;
}): VerificationPlan {
  const requirements: readonly VerificationRequirement[] = Object.freeze([
    Object.freeze({
      id: "device-reconnected",
      fact: "DEVICE_RECONNECTED",
      expectedValue: true,
      required: true,
    }),
    Object.freeze({
      id: "device-identity-matches",
      fact: "DEVICE_IDENTITY_MATCHES",
      expectedValue: true,
      required: true,
    }),
    Object.freeze({
      id: "target-matches",
      fact: "TARGET_MATCHES",
      expectedValue: input.artifact.targetId,
      required: true,
    }),
    Object.freeze({
      id: "firmware-version-matches",
      fact: "FIRMWARE_VERSION_MATCHES",
      expectedValue: input.artifact.firmwareVersion,
      required: true,
    }),
  ]);

  return Object.freeze({
    id: `${input.operationId}:firmware-verification:v1`,
    operationType: "FIRMWARE_UPDATE",
    expectedDeviceId: input.descriptor.id,
    requirements,
  });
}

function updateCapability(
  capabilities: readonly Capability[],
  updateCapabilityId: string,
): Capability | null {
  return (
    capabilities.find((capability) => capability.id === updateCapabilityId) ??
    null
  );
}

/** Builds a value-only preview from Core-owned facts and validated inputs. */
export function buildFirmwareUpdatePreview(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly providerId: string;
  readonly updateCapabilityId: string;
  readonly executionAuthority: unknown;
  readonly identity: DeviceIdentityResolution | null;
  readonly capabilities: readonly Capability[];
  readonly catalog: TargetCatalog;
  readonly artifact: unknown;
  readonly provenance: unknown;
  readonly artifactIntegrityValid: unknown;
}): FirmwareUpdatePreview {
  const operationId = machineText(input.operationId, "Update operation id");
  const providerId = rebuildProviderId(input.providerId);
  const updateCapabilityId = rebuildProviderId(input.updateCapabilityId);
  const descriptor: DeviceDescriptor = Object.freeze({ ...input.descriptor });
  const catalogMetadata = Object.freeze({ ...input.catalog.metadata });
  const artifact = rebuildFirmwareArtifactDescriptor(input.artifact);
  const provenance = rebuildArtifactProvenance(input.provenance);
  const executionAuthority: FirmwareUpdateExecutionAuthority | "NONE" =
    input.executionAuthority === "SYNTHETIC_ONLY" ? "SYNTHETIC_ONLY" : "NONE";
  const blockers: FirmwareUpdatePreviewBlocker[] = [];

  if (executionAuthority !== "SYNTHETIC_ONLY") {
    blockers.push(blocker("HARDWARE_WRITE_DISABLED"));
  }
  if (descriptor.connectionState !== "CONNECTED") {
    blockers.push(blocker("DEVICE_NOT_CONNECTED"));
  }
  if (artifact === null) {
    blockers.push(blocker("ARTIFACT_DESCRIPTOR_INVALID"));
  }
  if (provenance === null) {
    blockers.push(blocker("PROVENANCE_INVALID"));
  }
  if (
    artifact !== null &&
    provenance !== null &&
    provenance.targetId !== artifact.targetId
  ) {
    blockers.push(blocker("PROVENANCE_TARGET_MISMATCH"));
  }
  if (
    artifact !== null &&
    provenance !== null &&
    provenance.artifactSha256 !== artifact.sha256
  ) {
    blockers.push(blocker("PROVENANCE_ARTIFACT_MISMATCH"));
  }
  if (input.artifactIntegrityValid !== true) {
    blockers.push(blocker("ARTIFACT_INTEGRITY_NOT_CONFIRMED"));
  }

  const targetId =
    input.identity?.confidence === "CONFIRMED"
      ? input.identity.selectedTargetId
      : null;
  if (targetId === null) {
    blockers.push(blocker("IDENTITY_NOT_CONFIRMED"));
  }
  if (catalogMetadata.redistributionApproved !== true) {
    blockers.push(blocker("CATALOG_NOT_APPROVED"));
  }

  const target = targetId === null ? null : input.catalog.get(targetId);
  if (targetId !== null && target === null) {
    blockers.push(blocker("TARGET_NOT_IN_CATALOG"));
  }

  const capability = updateCapability(
    input.capabilities,
    updateCapabilityId,
  );
  if (capability?.available !== true) {
    blockers.push(blocker("UPDATE_CAPABILITY_NOT_AVAILABLE"));
  } else if (capability.sourceEvidenceIds.length === 0) {
    blockers.push(blocker("UPDATE_CAPABILITY_EVIDENCE_MISSING"));
  }

  let compatibilityStatus: CompatibilityStatus | "NOT_EVALUATED" =
    "NOT_EVALUATED";
  let compatibilityReasons: readonly CompatibilityReason[] = Object.freeze([]);
  if (input.identity !== null && artifact !== null) {
    const compatibility = evaluateFirmwareCompatibility({
      identity: input.identity,
      artifact,
      updateProvider: providerId,
      catalog: input.catalog,
    });
    compatibilityStatus = compatibility.status;
    compatibilityReasons = Object.freeze([...compatibility.reasons]);
    if (compatibility.status !== "COMPATIBLE") {
      blockers.push(blocker("COMPATIBILITY_NOT_PROVEN"));
    }
  } else {
    blockers.push(blocker("COMPATIBILITY_NOT_PROVEN"));
  }

  const verificationPlan =
    artifact !== null &&
    provenance !== null &&
    targetId !== null &&
    provenance.targetId === artifact.targetId &&
    provenance.artifactSha256 === artifact.sha256
      ? createVerificationPlan({ operationId, descriptor, artifact })
      : null;
  const frozenBlockers = Object.freeze([...blockers]);

  return Object.freeze({
    schemaVersion: 1,
    previewId: `${operationId}:firmware-preview:v1`,
    operationId,
    operationType: "FIRMWARE_UPDATE",
    status: frozenBlockers.length === 0 ? "READY" : "BLOCKED",
    validationLevel: "SIMULATION_ONLY",
    executionAuthority,
    providerId,
    updateCapabilityId,
    deviceId: descriptor.id,
    transport: descriptor.transport,
    targetId,
    targetDisplayName:
      catalogMetadata.redistributionApproved === true && target !== null
        ? target.displayName
        : null,
    catalogSource: catalogMetadata.source,
    catalogRevision: catalogMetadata.revision,
    catalogSchemaVersion: catalogMetadata.schemaVersion,
    catalogContentDigest: catalogMetadata.contentDigest,
    artifact,
    provenance,
    compatibilityStatus,
    compatibilityReasons,
    changeCodes: Object.freeze([...firmwareUpdatePreviewChangeCodes]),
    verificationPlan,
    blockers: frozenBlockers,
  });
}

/**
 * Validates the Synthetic artifact locally, then reads identity/capabilities.
 * It never prepares, writes, reboots, reconnects, or verifies Firmware.
 */
export async function prepareFirmwareUpdatePreview(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly artifact: unknown;
  readonly provenance: unknown;
  readonly provider: FirmwareUpdateProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly signal?: CancellationSignal;
}): Promise<FirmwareUpdatePreview> {
  const operationId = machineText(input.operationId, "Update operation id");
  const [descriptor] = rebuildDiscoveryDescriptors([
    Object.freeze({ ...input.descriptor }),
  ]);
  if (descriptor === undefined) {
    throw new Error("Core descriptor rebuild returned no value");
  }
  const provider = input.provider;
  const sessions = input.sessions;
  const catalog = input.catalog;
  const signal = input.signal;
  const providerId = rebuildProviderId(readProviderDataProperty(provider, "id"));
  const updateCapabilityId = rebuildProviderId(
    readProviderDataProperty(provider, "updateCapabilityId"),
  );
  const executionAuthority = readProviderDataProperty(
    provider,
    "executionAuthority",
  );
  const artifact = rebuildFirmwareArtifactDescriptor(input.artifact);
  const provenance = rebuildArtifactProvenance(input.provenance);
  let session: DeviceSession | null = null;

  const earlyBlocked =
    executionAuthority !== "SYNTHETIC_ONLY" ||
    descriptor.connectionState !== "CONNECTED" ||
    artifact === null ||
    provenance === null ||
    provenance.targetId !== artifact.targetId ||
    provenance.artifactSha256 !== artifact.sha256;

  if (earlyBlocked) {
    return buildFirmwareUpdatePreview({
      operationId,
      descriptor,
      providerId,
      updateCapabilityId,
      executionAuthority,
      identity: null,
      capabilities: Object.freeze([]),
      catalog,
      artifact,
      provenance,
      artifactIntegrityValid: false,
    });
  }

  try {
    assertNotAborted(signal);
    const artifactIntegrityValid = await provider.validateArtifact(
      artifact,
      signal,
    );
    assertNotAborted(signal);
    if (artifactIntegrityValid !== true) {
      return buildFirmwareUpdatePreview({
        operationId,
        descriptor,
        providerId,
        updateCapabilityId,
        executionAuthority,
        identity: null,
        capabilities: Object.freeze([]),
        catalog,
        artifact,
        provenance,
        artifactIntegrityValid,
      });
    }

    session = acquireWorkflowSession({
      descriptor,
      operationId: `${operationId}:preview`,
      sessions,
    });
    const inspected = await inspectHeldDevice({
      reader: provider,
      session,
      sessions,
      catalog,
      signal,
    });

    return buildFirmwareUpdatePreview({
      operationId,
      descriptor,
      providerId,
      updateCapabilityId,
      executionAuthority,
      identity: inspected.identity,
      capabilities: inspected.capabilities,
      catalog,
      artifact,
      provenance,
      artifactIntegrityValid,
    });
  } finally {
    releaseIfHeld(sessions, session);
  }
}

export function createFirmwareUpdateApproval(
  preview: FirmwareUpdatePreview,
  approvedAt: string,
): FirmwareUpdateApproval {
  if (
    preview.status !== "READY" ||
    preview.executionAuthority !== "SYNTHETIC_ONLY" ||
    preview.targetId === null ||
    preview.artifact === null ||
    preview.provenance === null ||
    preview.verificationPlan === null
  ) {
    throw new TypeError("A blocked Firmware preview cannot be approved");
  }
  if (!canonicalUtcTimestamp.test(approvedAt)) {
    throw new TypeError("Firmware approval timestamp must be canonical UTC");
  }

  return Object.freeze({
    schemaVersion: 1,
    approved: true,
    approvedAt,
    previewId: preview.previewId,
    operationId: preview.operationId,
    providerId: preview.providerId,
    deviceId: preview.deviceId,
    targetId: preview.targetId,
    catalogContentDigest: preview.catalogContentDigest,
    executionAuthority: "SYNTHETIC_ONLY",
    artifactTargetId: preview.artifact.targetId,
    firmwareVersion: preview.artifact.firmwareVersion,
    artifactSha256: preview.artifact.sha256,
    provenanceApplicationVersion: preview.provenance.applicationVersion,
    provenanceCoreVersion: preview.provenance.coreVersion,
    provenanceUpstreamRepository: preview.provenance.upstreamRepository,
    provenanceUpstreamVersion: preview.provenance.upstreamVersion,
    provenanceUpstreamCommitSha: preview.provenance.upstreamCommitSha,
    provenancePatchSetVersion: preview.provenance.patchSetVersion,
    provenanceTargetId: preview.provenance.targetId,
    provenanceBuildConfigurationDigest:
      preview.provenance.buildConfigurationDigest,
    provenanceToolchainIdentity: preview.provenance.toolchainIdentity,
    provenanceBuiltAt: preview.provenance.builtAt,
    provenanceArtifactSha256: preview.provenance.artifactSha256,
    verificationPlanId: preview.verificationPlan.id,
  });
}

export function approvalMatchesFirmwareUpdatePreview(
  preview: FirmwareUpdatePreview,
  approval: unknown,
): approval is FirmwareUpdateApproval {
  if (
    preview.status !== "READY" ||
    preview.executionAuthority !== "SYNTHETIC_ONLY" ||
    preview.targetId === null ||
    preview.artifact === null ||
    preview.provenance === null ||
    preview.verificationPlan === null
  ) {
    return false;
  }

  return (
    readProviderDataProperty(approval, "schemaVersion") === 1 &&
    readProviderDataProperty(approval, "approved") === true &&
    typeof readProviderDataProperty(approval, "approvedAt") === "string" &&
    canonicalUtcTimestamp.test(
      readProviderDataProperty(approval, "approvedAt") as string,
    ) &&
    readProviderDataProperty(approval, "previewId") === preview.previewId &&
    readProviderDataProperty(approval, "operationId") === preview.operationId &&
    readProviderDataProperty(approval, "providerId") === preview.providerId &&
    readProviderDataProperty(approval, "deviceId") === preview.deviceId &&
    readProviderDataProperty(approval, "targetId") === preview.targetId &&
    readProviderDataProperty(approval, "catalogContentDigest") ===
      preview.catalogContentDigest &&
    readProviderDataProperty(approval, "executionAuthority") ===
      "SYNTHETIC_ONLY" &&
    readProviderDataProperty(approval, "artifactTargetId") ===
      preview.artifact.targetId &&
    readProviderDataProperty(approval, "firmwareVersion") ===
      preview.artifact.firmwareVersion &&
    readProviderDataProperty(approval, "artifactSha256") ===
      preview.artifact.sha256 &&
    readProviderDataProperty(approval, "provenanceApplicationVersion") ===
      preview.provenance.applicationVersion &&
    readProviderDataProperty(approval, "provenanceCoreVersion") ===
      preview.provenance.coreVersion &&
    readProviderDataProperty(approval, "provenanceUpstreamRepository") ===
      preview.provenance.upstreamRepository &&
    readProviderDataProperty(approval, "provenanceUpstreamVersion") ===
      preview.provenance.upstreamVersion &&
    readProviderDataProperty(approval, "provenanceUpstreamCommitSha") ===
      preview.provenance.upstreamCommitSha &&
    readProviderDataProperty(approval, "provenancePatchSetVersion") ===
      preview.provenance.patchSetVersion &&
    readProviderDataProperty(approval, "provenanceTargetId") ===
      preview.provenance.targetId &&
    readProviderDataProperty(
      approval,
      "provenanceBuildConfigurationDigest",
    ) === preview.provenance.buildConfigurationDigest &&
    readProviderDataProperty(approval, "provenanceToolchainIdentity") ===
      preview.provenance.toolchainIdentity &&
    readProviderDataProperty(approval, "provenanceBuiltAt") ===
      preview.provenance.builtAt &&
    readProviderDataProperty(approval, "provenanceArtifactSha256") ===
      preview.provenance.artifactSha256 &&
    readProviderDataProperty(approval, "verificationPlanId") ===
      preview.verificationPlan.id
  );
}
