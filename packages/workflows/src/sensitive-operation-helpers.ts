import type { TargetCatalog } from "@elrs-easy/compatibility";
import {
  rebuildDiscoveryCapabilities,
  rebuildDiscoveryEvidence,
  rebuildProviderId,
  resolveDeviceIdentity,
  type DeviceSessionManager,
  type DiscoveryProvider,
  type IdentityEvidenceTrustPolicy,
} from "@elrs-easy/device";
import {
  CoreOperationError,
  identityClaims,
  operationErrorCodes,
  type CancellationSignal,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityResolution,
  type DeviceSession,
  type EvidenceReliability,
  type EvidenceStrength,
  type IdentityClaim,
  type OperationError,
} from "@elrs-easy/domain";

import type { IdentityReader } from "./sensitive-operation-contracts.js";

export interface InspectedDevice {
  readonly identity: DeviceIdentityResolution;
  readonly capabilities: readonly Capability[];
}

/**
 * Reads only an own data property from untrusted runtime input. Accessor
 * properties are treated as absent so getters cannot execute while a Workflow
 * is validating artifacts, receipts, verification results, or metadata.
 */
export function readOwnDataProperty(value: unknown, key: PropertyKey): unknown {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves an own or prototype data method without invoking an accessor. The
 * walk stops before Object.prototype so prototype pollution cannot supply a
 * sensitive provider method.
 */
export function readDataMethod(
  value: unknown,
  key: PropertyKey,
): ((...arguments_: unknown[]) => unknown) | null {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return null;
  }
  try {
    let current: object | null = value;
    for (
      let depth = 0;
      current !== null && current !== Object.prototype && depth < 8;
      depth += 1
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined) {
        return "value" in descriptor && typeof descriptor.value === "function"
          ? (descriptor.value as (...arguments_: unknown[]) => unknown)
          : null;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return null;
  }
  return null;
}

export function requireDataMethod(
  value: unknown,
  key: PropertyKey,
  reason: string,
): (...arguments_: unknown[]) => unknown {
  const method = readDataMethod(value, key);
  if (method === null) {
    throw new CoreOperationError({
      code: "PROVIDER_UNSUPPORTED",
      reason,
      details: {},
      retryable: false,
    });
  }
  return method;
}

const exactUint8ArrayPrototype = Uint8Array.prototype;

/** Copies only an exact Uint8Array, rejecting subclasses and other views. */
export function copyExactUint8Array(value: unknown): Uint8Array | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    if (Object.getPrototypeOf(value) !== exactUint8ArrayPrototype) {
      return null;
    }
    return Uint8Array.prototype.slice.call(value) as Uint8Array;
  } catch {
    return null;
  }
}

/** Kept as a provider-specific name at existing call sites. */
export const readProviderDataProperty = readOwnDataProperty;

/**
 * CancellationSignal is an explicit control port rather than an untrusted data
 * envelope. Browser/Node AbortSignal exposes `aborted` through its prototype,
 * so this one property is intentionally read through the port contract. A
 * throwing implementation fails closed instead of being treated as active.
 */
export function assertNotAborted(signal?: CancellationSignal): void {
  if (signal === undefined) {
    return;
  }
  let aborted: boolean;
  try {
    aborted = signal.aborted;
  } catch {
    throw new CoreOperationError({
      code: "INTERNAL_ERROR",
      reason: "CANCELLATION_SIGNAL_UNREADABLE",
      details: {},
      retryable: false,
    });
  }
  if (aborted === true) {
    const error = new Error("The sensitive operation was cancelled");
    error.name = "AbortError";
    throw error;
  }
  if (aborted !== false) {
    throw new CoreOperationError({
      code: "INTERNAL_ERROR",
      reason: "CANCELLATION_SIGNAL_INVALID",
      details: {},
      retryable: false,
    });
  }
}

function syntheticEvidenceTrust(input: {
  readonly claim: IdentityClaim;
  readonly reportedSourceKind: string;
}): {
  readonly sourceKind: string;
  readonly sourceInstanceId: string;
  readonly trustDomain: string;
  readonly strength: EvidenceStrength;
  readonly reliability: EvidenceReliability;
} | null {
  if (input.reportedSourceKind === "synthetic-bootloader") {
    return input.claim === identityClaims.target
      ? {
          sourceKind: "synthetic-bootloader",
          sourceInstanceId: "synthetic-bootloader-reader",
          trustDomain: "synthetic-bootloader",
          strength: "TARGET_SPECIFIC",
          reliability: "VALIDATED",
        }
      : null;
  }
  if (input.reportedSourceKind !== "synthetic-runtime-config") {
    return null;
  }
  if (input.claim === identityClaims.target) {
    return {
      sourceKind: "synthetic-runtime-config",
      sourceInstanceId: "synthetic-runtime-reader",
      trustDomain: "synthetic-runtime-firmware",
      strength: "TARGET_SPECIFIC",
      reliability: "VALIDATED",
    };
  }
  return {
    sourceKind: "synthetic-runtime-config",
    sourceInstanceId: "synthetic-runtime-reader",
    trustDomain: "synthetic-runtime-firmware",
    strength: input.claim === identityClaims.mcuFamily ? "GENERIC" : "SUPPORTING",
    reliability: "VALIDATED",
  };
}

const syntheticSensitiveIdentityPolicy: IdentityEvidenceTrustPolicy =
  Object.freeze({
    classify(input: {
      readonly provider: DiscoveryProvider;
      readonly providerId: string;
      readonly claim: IdentityClaim;
      readonly reportedSourceKind: string;
    }) {
      return syntheticEvidenceTrust(input);
    },
  });

export function assertSensitiveProviderAdmitted(reader: unknown): string {
  if (readOwnDataProperty(reader, "assurance") !== "SYNTHETIC_ONLY") {
    throw new CoreOperationError({
      code: "PROVIDER_UNSUPPORTED",
      reason: "SENSITIVE_PROVIDER_ASSURANCE_NOT_ADMITTED",
      details: {},
      retryable: false,
    });
  }
  return rebuildProviderId(readOwnDataProperty(reader, "id"));
}

export async function inspectHeldDevice(input: {
  readonly reader: IdentityReader;
  readonly session: DeviceSession;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly signal?: CancellationSignal;
}): Promise<InspectedDevice> {
  const reader = readOwnDataProperty(input, "reader");
  const session = readOwnDataProperty(input, "session");
  const sessions = readOwnDataProperty(input, "sessions");
  const catalog = readOwnDataProperty(input, "catalog");
  const signal = readOwnDataProperty(input, "signal") as
    | CancellationSignal
    | undefined;
  if (
    typeof reader !== "object" ||
    reader === null ||
    typeof session !== "object" ||
    session === null ||
    typeof sessions !== "object" ||
    sessions === null ||
    typeof catalog !== "object" ||
    catalog === null
  ) {
    throw new CoreOperationError({
      code: "PROVIDER_UNSUPPORTED",
      reason: "SENSITIVE_INSPECTION_INPUT_INVALID",
      details: {},
      retryable: false,
    });
  }

  const providerId = assertSensitiveProviderAdmitted(reader);
  const readIdentity = requireDataMethod(
    reader,
    "readIdentity",
    "SENSITIVE_PROVIDER_READ_IDENTITY_UNAVAILABLE",
  );
  const readCapabilities = requireDataMethod(
    reader,
    "readCapabilities",
    "SENSITIVE_PROVIDER_READ_CAPABILITIES_UNAVAILABLE",
  );

  assertNotAborted(signal);
  (sessions as DeviceSessionManager).assertHeld(session as DeviceSession);
  const rawEvidence = await Reflect.apply(readIdentity, reader, [session, signal]);
  assertNotAborted(signal);
  (sessions as DeviceSessionManager).assertHeld(session as DeviceSession);
  const rebuiltEvidence = rebuildDiscoveryEvidence({
    value: rawEvidence,
    provider: reader as unknown as DiscoveryProvider,
    providerId,
    policy: syntheticSensitiveIdentityPolicy,
  });
  const rawCapabilities = await Reflect.apply(readCapabilities, reader, [
    session,
    signal,
  ]);
  assertNotAborted(signal);
  (sessions as DeviceSessionManager).assertHeld(session as DeviceSession);
  const capabilities = rebuildDiscoveryCapabilities({
    value: rawCapabilities,
    safeIdByReportedId: rebuiltEvidence.safeIdByReportedId,
  });
  const evidence = rebuiltEvidence.evidence;

  return Object.freeze({
    identity: resolveDeviceIdentity({
      evidence,
      candidates: (catalog as TargetCatalog).match(evidence),
    }),
    capabilities,
  });
}

export function acquireWorkflowSession(input: {
  readonly descriptor: DeviceDescriptor;
  readonly operationId: string;
  readonly sessions: DeviceSessionManager;
}): DeviceSession {
  return input.sessions.acquire({
    deviceId: input.descriptor.id,
    owner: { id: input.operationId, kind: "WORKFLOW" },
  });
}

export function releaseIfHeld(
  sessions: DeviceSessionManager,
  session: DeviceSession | null,
): void {
  if (session === null) {
    return;
  }
  if (sessions.isHeld(session)) {
    sessions.release(session);
  }
}

export function identityGateError(
  identity: DeviceIdentityResolution,
): OperationError | null {
  if (
    identity.confidence === "CONFIRMED" &&
    identity.selectedTargetId !== null
  ) {
    return null;
  }
  return {
    code:
      identity.confidence === "AMBIGUOUS"
        ? "IDENTITY_AMBIGUOUS"
        : "IDENTITY_UNKNOWN",
    reason: "SENSITIVE_OPERATION_REQUIRES_CONFIRMED_IDENTITY",
    details: { confidence: identity.confidence },
    retryable: false,
  };
}

export function safeOperationError(
  error: unknown,
  fallbackReason: string,
): OperationError {
  let isCoreOperationError = false;
  try {
    isCoreOperationError = error instanceof CoreOperationError;
  } catch {
    // A Proxy may trap prototype inspection. Treat it as an unclassified error.
  }
  if (isCoreOperationError) {
    const providerOperationError = readProviderDataProperty(
      error,
      "operationError",
    );
    const code = readProviderDataProperty(providerOperationError, "code");
    const retryable = readProviderDataProperty(
      providerOperationError,
      "retryable",
    );
    if (
      typeof code === "string" &&
      operationErrorCodes.includes(
        code as (typeof operationErrorCodes)[number],
      ) &&
      typeof retryable === "boolean"
    ) {
      return Object.freeze({
        code: code as (typeof operationErrorCodes)[number],
        reason: fallbackReason,
        details: Object.freeze({}),
        retryable,
      });
    }
  }
  return Object.freeze({
    code: "INTERNAL_ERROR",
    reason: fallbackReason,
    details: Object.freeze({}),
    retryable: true,
  });
}

export function isAbortError(error: unknown): boolean {
  return readProviderDataProperty(error, "name") === "AbortError";
}
