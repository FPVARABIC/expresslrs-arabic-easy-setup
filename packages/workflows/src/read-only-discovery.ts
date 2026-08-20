import type { TargetCatalog } from "@elrs-easy/compatibility";
import {
  resolveDeviceIdentity,
  type DeviceSessionManager,
  type DiscoveryProvider,
} from "@elrs-easy/device";
import {
  CoreOperationError,
  type DeviceIdentityResolution,
  type DeviceSnapshot,
  type OperationError,
  type OperationRecord,
} from "@elrs-easy/domain";

import {
  VerifiedOperationMachine,
  type WorkflowClock,
} from "./operation-machine.js";

export interface DiscoveredDevice {
  readonly snapshot: DeviceSnapshot;
  readonly identity: DeviceIdentityResolution;
}

export interface ReadOnlyDiscoveryResult {
  readonly providerId: string;
  readonly devices: readonly DiscoveredDevice[];
}

function safeError(error: unknown): OperationError {
  if (error instanceof CoreOperationError) {
    return error.operationError;
  }
  return {
    code: "INTERNAL_ERROR",
    reason: "DISCOVERY_PROVIDER_FAILED",
    details: {},
    retryable: true,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

/** Connect → identify → resolve → display facts. This workflow cannot write. */
export async function runReadOnlyDiscovery(input: {
  readonly operationId: string;
  readonly provider: DiscoveryProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly clock?: WorkflowClock;
  readonly signal?: AbortSignal;
}): Promise<OperationRecord<ReadOnlyDiscoveryResult>> {
  const machine = new VerifiedOperationMachine<ReadOnlyDiscoveryResult>({
    id: input.operationId,
    type: "READ_ONLY_DISCOVERY",
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });

  try {
    machine.transition("PREPARING");
    machine.transition("DISCOVERING");
    const descriptors = await input.provider.discover(input.signal);
    if (descriptors.length === 0) {
      return machine.fail({
        code: "DEVICE_NOT_FOUND",
        reason: "DISCOVERY_RETURNED_NO_DEVICES",
        details: { providerId: input.provider.id },
        retryable: true,
      });
    }

    machine.transition("IDENTIFYING");
    const devices: DiscoveredDevice[] = [];

    for (const descriptor of descriptors) {
      const session = input.sessions.acquire({
        deviceId: descriptor.id,
        owner: { id: input.operationId, kind: "WORKFLOW" },
      });
      try {
        input.sessions.assertHeld(session);
        const evidence = await input.provider.readIdentity(session, input.signal);
        input.sessions.assertHeld(session);
        const capabilities = await input.provider.readCapabilities(
          session,
          input.signal,
        );
        const candidates = input.catalog.match(evidence);
        devices.push(
          Object.freeze({
            snapshot: Object.freeze({
              descriptor,
              evidence: Object.freeze([...evidence]),
              capabilities: Object.freeze([...capabilities]),
            }),
            identity: resolveDeviceIdentity({ evidence, candidates }),
          }),
        );
      } finally {
        input.sessions.release(session);
      }
    }

    machine.transition("VERIFYING", {
      messageCode: "DISCOVERY_FACTS_COLLECTED",
    });
    return machine.verificationSucceeded(
      Object.freeze({
        providerId: input.provider.id,
        devices: Object.freeze(devices),
      }),
    );
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return machine.transition("CANCELLED", {
        messageCode: "OPERATION_CANCELLED",
      });
    }
    return machine.fail(safeError(error));
  }
}
