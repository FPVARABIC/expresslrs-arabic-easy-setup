import type { TargetCatalog } from "@elrs-easy/compatibility";
import {
  resolveDeviceIdentity,
  type DeviceSessionManager,
} from "@elrs-easy/device";
import {
  CoreOperationError,
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
  if (sessions.current(session.deviceId)?.id === session.id) {
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
  if (error instanceof CoreOperationError) {
    return error.operationError;
  }
  return {
    code: "INTERNAL_ERROR",
    reason: fallbackReason,
    details: {},
    retryable: true,
  };
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
