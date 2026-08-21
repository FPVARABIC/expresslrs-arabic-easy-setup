import type { TargetCatalog } from "@elrs-easy/compatibility";
import {
  resolveDeviceIdentity,
  type DeviceSessionManager,
} from "@elrs-easy/device";
import {
  CoreOperationError,
  operationErrorCodes,
  type CancellationSignal,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityResolution,
  type DeviceSession,
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

/** Providers are untrusted and may ignore cancellation on their own. */
export function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    const error = new Error("The sensitive operation was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

export async function inspectHeldDevice(input: {
  readonly reader: IdentityReader;
  readonly session: DeviceSession;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly signal?: CancellationSignal;
}): Promise<InspectedDevice> {
  assertNotAborted(input.signal);
  input.sessions.assertHeld(input.session);
  const evidence = await input.reader.readIdentity(input.session, input.signal);
  assertNotAborted(input.signal);
  input.sessions.assertHeld(input.session);
  const capabilities = await input.reader.readCapabilities(
    input.session,
    input.signal,
  );
  assertNotAborted(input.signal);
  input.sessions.assertHeld(input.session);

  return Object.freeze({
    identity: resolveDeviceIdentity({
      evidence,
      candidates: input.catalog.match(evidence),
    }),
    capabilities: Object.freeze([...capabilities]),
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
        // Never forward a provider-controlled reason or detail value. Even an
        // allowlisted-looking token can contain a Binding Phrase or credential.
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
