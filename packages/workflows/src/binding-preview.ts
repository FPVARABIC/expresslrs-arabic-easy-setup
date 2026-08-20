import type { TargetCatalog } from "@elrs-easy/compatibility";
import {
  rebuildDiscoveryDescriptors,
  rebuildProviderId,
  type DeviceSessionManager,
} from "@elrs-easy/device";
import type {
  CancellationSignal,
  Capability,
  DeviceDescriptor,
  DeviceIdentityResolution,
  DeviceSession,
} from "@elrs-easy/domain";

import {
  acquireWorkflowSession,
  assertNotAborted,
  inspectHeldDevice,
  readProviderDataProperty,
  releaseIfHeld,
} from "./sensitive-operation-helpers.js";
import type {
  BindingExecutionAuthority,
  BindingProvider,
} from "./sensitive-operation-contracts.js";

export const bindingPreviewBlockerCodes = [
  "HARDWARE_WRITE_DISABLED",
  "DEVICE_NOT_CONNECTED",
  "IDENTITY_NOT_CONFIRMED",
  "CATALOG_NOT_APPROVED",
  "TARGET_NOT_IN_CATALOG",
  "TARGET_DOES_NOT_DECLARE_GUIDED_BIND",
  "RUNTIME_GUIDED_BIND_NOT_AVAILABLE",
  "RUNTIME_GUIDED_BIND_EVIDENCE_MISSING",
] as const;

export type BindingPreviewBlockerCode =
  (typeof bindingPreviewBlockerCodes)[number];

export interface BindingPreviewBlocker {
  readonly code: BindingPreviewBlockerCode;
}

export const bindingPreviewChangeCodes = [
  "BINDING_RELATIONSHIP_WILL_CHANGE",
] as const;

export type BindingPreviewChangeCode =
  (typeof bindingPreviewChangeCodes)[number];

export const bindingVerificationRequirementCodes = [
  "RECONNECT_SAME_DEVICE",
  "REIDENTIFY_SAME_TARGET",
  "LINK_ESTABLISHED",
] as const;

export type BindingVerificationRequirementCode =
  (typeof bindingVerificationRequirementCodes)[number];

export interface EasyBindingPreview {
  readonly schemaVersion: 1;
  readonly previewId: string;
  readonly operationId: string;
  readonly operationType: "EASY_BINDING";
  readonly status: "READY" | "BLOCKED";
  readonly validationLevel: "SIMULATION_ONLY";
  readonly executionAuthority: BindingExecutionAuthority | "NONE";
  readonly providerId: string;
  readonly deviceId: string;
  readonly transport: string;
  readonly targetId: string | null;
  readonly targetDisplayName: string | null;
  readonly catalogSource: string;
  readonly catalogRevision: string;
  readonly catalogSchemaVersion: string;
  readonly catalogContentDigest: string;
  readonly changeCodes: readonly BindingPreviewChangeCode[];
  readonly verificationRequirements: readonly BindingVerificationRequirementCode[];
  readonly blockers: readonly BindingPreviewBlocker[];
}

export interface EasyBindingApproval {
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
}

const canonicalUtcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function machineText(value: string, label: string): string {
  const text = value.trim();
  if (text.length === 0 || text.length > 256) {
    throw new TypeError(`${label} must be a non-empty bounded string`);
  }
  return text;
}

function blocker(code: BindingPreviewBlockerCode): BindingPreviewBlocker {
  return Object.freeze({ code });
}

function runtimeGuidedBindCapability(
  capabilities: readonly Capability[],
): Capability | null {
  return (
    capabilities.find((capability) => capability.id === "guided-bind") ?? null
  );
}

/**
 * Builds a value-only preview from Core-owned identity/capability facts. The
 * preview never contains a Binding Phrase, UID, serial, Wi-Fi credential, raw
 * provider payload, or a claim that hardware execution is available.
 */
export function buildEasyBindingPreview(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly providerId: string;
  readonly executionAuthority: unknown;
  readonly identity: DeviceIdentityResolution;
  readonly capabilities: readonly Capability[];
  readonly catalog: TargetCatalog;
}): EasyBindingPreview {
  const operationId = machineText(input.operationId, "Binding operation id");
  const providerId = rebuildProviderId(input.providerId);
  const descriptor: DeviceDescriptor = Object.freeze({ ...input.descriptor });
  const catalogMetadata = Object.freeze({ ...input.catalog.metadata });
  const blockers: BindingPreviewBlocker[] = [];
  const executionAuthority: BindingExecutionAuthority | "NONE" =
    input.executionAuthority === "SYNTHETIC_ONLY"
      ? "SYNTHETIC_ONLY"
      : "NONE";

  if (executionAuthority !== "SYNTHETIC_ONLY") {
    blockers.push(blocker("HARDWARE_WRITE_DISABLED"));
  }
  if (descriptor.connectionState !== "CONNECTED") {
    blockers.push(blocker("DEVICE_NOT_CONNECTED"));
  }

  const targetId =
    input.identity.confidence === "CONFIRMED"
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
  if (target !== null && !target.capabilities.includes("guided-bind")) {
    blockers.push(blocker("TARGET_DOES_NOT_DECLARE_GUIDED_BIND"));
  }

  const runtimeCapability = runtimeGuidedBindCapability(input.capabilities);
  if (runtimeCapability?.available !== true) {
    blockers.push(blocker("RUNTIME_GUIDED_BIND_NOT_AVAILABLE"));
  } else if (runtimeCapability.sourceEvidenceIds.length === 0) {
    blockers.push(blocker("RUNTIME_GUIDED_BIND_EVIDENCE_MISSING"));
  }

  const approvedTargetDisplayName =
    catalogMetadata.redistributionApproved === true && target !== null
      ? target.displayName
      : null;
  const frozenBlockers = Object.freeze([...blockers]);

  return Object.freeze({
    schemaVersion: 1,
    previewId: `${operationId}:binding-preview:v1`,
    operationId,
    operationType: "EASY_BINDING",
    status: frozenBlockers.length === 0 ? "READY" : "BLOCKED",
    validationLevel: "SIMULATION_ONLY",
    executionAuthority,
    providerId,
    deviceId: descriptor.id,
    transport: descriptor.transport,
    targetId,
    targetDisplayName: approvedTargetDisplayName,
    catalogSource: catalogMetadata.source,
    catalogRevision: catalogMetadata.revision,
    catalogSchemaVersion: catalogMetadata.schemaVersion,
    catalogContentDigest: catalogMetadata.contentDigest,
    changeCodes: Object.freeze([...bindingPreviewChangeCodes]),
    verificationRequirements: Object.freeze([
      ...bindingVerificationRequirementCodes,
    ]),
    blockers: frozenBlockers,
  });
}

/**
 * Performs only identity/capability reads, then releases the session. No
 * prepare/execute/reconnect/verify method is called by this preflight.
 */
export async function prepareEasyBindingPreview(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly provider: BindingProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly signal?: CancellationSignal;
}): Promise<EasyBindingPreview> {
  const operationId = machineText(input.operationId, "Binding operation id");
  const descriptorInput: DeviceDescriptor = Object.freeze({
    ...input.descriptor,
  });
  const [descriptor] = rebuildDiscoveryDescriptors([descriptorInput]);
  if (descriptor === undefined) {
    throw new Error("Core descriptor rebuild returned no value");
  }
  const provider = input.provider;
  const sessions = input.sessions;
  const catalog = input.catalog;
  const signal = input.signal;
  let session: DeviceSession | null = null;

  try {
    assertNotAborted(signal);
    const providerId = rebuildProviderId(
      readProviderDataProperty(provider, "id"),
    );
    const executionAuthority = readProviderDataProperty(
      provider,
      "executionAuthority",
    );
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

    return buildEasyBindingPreview({
      operationId,
      descriptor,
      providerId,
      executionAuthority,
      identity: inspected.identity,
      capabilities: inspected.capabilities,
      catalog,
    });
  } finally {
    releaseIfHeld(sessions, session);
  }
}

export function createEasyBindingApproval(
  preview: EasyBindingPreview,
  approvedAt: string,
): EasyBindingApproval {
  if (preview.status !== "READY") {
    throw new TypeError("A blocked Binding preview cannot be approved");
  }
  if (
    preview.executionAuthority !== "SYNTHETIC_ONLY" ||
    preview.targetId === null
  ) {
    throw new TypeError("Binding preview is missing Synthetic authority");
  }
  if (!canonicalUtcTimestamp.test(approvedAt)) {
    throw new TypeError("Binding approval timestamp must be canonical UTC");
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
  });
}

/** Accessor-backed or stale caller data never satisfies a live preview. */
export function approvalMatchesEasyBindingPreview(
  preview: EasyBindingPreview,
  approval: unknown,
): approval is EasyBindingApproval {
  if (
    preview.status !== "READY" ||
    preview.executionAuthority !== "SYNTHETIC_ONLY" ||
    preview.targetId === null
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
    readProviderDataProperty(approval, "operationId") ===
      preview.operationId &&
    readProviderDataProperty(approval, "providerId") === preview.providerId &&
    readProviderDataProperty(approval, "deviceId") === preview.deviceId &&
    readProviderDataProperty(approval, "targetId") === preview.targetId &&
    readProviderDataProperty(approval, "catalogContentDigest") ===
      preview.catalogContentDigest &&
    readProviderDataProperty(approval, "executionAuthority") ===
      "SYNTHETIC_ONLY"
  );
}
