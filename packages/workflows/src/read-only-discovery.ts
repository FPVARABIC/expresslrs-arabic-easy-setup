import type { TargetCatalog } from "@elrs-easy/compatibility";
import {
  rebuildDiscoveryCapabilities,
  rebuildDiscoveryDescriptors,
  rebuildDiscoveryEvidence,
  rebuildProviderId,
  resolveDeviceIdentity,
  type DeviceSessionManager,
  type DiscoveryProvider,
  type IdentityEvidenceTrustPolicy,
} from "@elrs-easy/device";
import {
  type CancellationSignal,
  type DeviceIdentityResolution,
  type DeviceSnapshot,
  type OperationRecord,
} from "@elrs-easy/domain";

import {
  isAbortError,
  readProviderDataProperty,
  safeOperationError,
} from "./sensitive-operation-helpers.js";
import {
  VerifiedOperationMachine,
  type OperationObserver,
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

/**
 * Provider support is not sufficient: every provider is untrusted and may
 * ignore cancellation. Check at the workflow boundary before and after each
 * asynchronous provider call so stale results cannot be promoted to SUCCESS.
 */
function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    const error = new Error("The discovery operation was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

/** Connect → identify → resolve → display facts. This workflow cannot write. */
export async function runReadOnlyDiscovery(input: {
  readonly operationId: string;
  readonly provider: DiscoveryProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly evidencePolicy?: IdentityEvidenceTrustPolicy;
  readonly clock?: WorkflowClock;
  readonly observer?: OperationObserver<ReadOnlyDiscoveryResult>;
  readonly signal?: CancellationSignal;
}): Promise<OperationRecord<ReadOnlyDiscoveryResult>> {
  // Capture the invocation boundary before the machine constructor notifies an
  // observer and before any provider await. A caller mutating the input object
  // must not be able to swap safety-critical collaborators mid-operation.
  const operationId = input.operationId;
  const provider = input.provider;
  const sessions = input.sessions;
  const catalog = input.catalog;
  const evidencePolicy = input.evidencePolicy;
  const clock = input.clock;
  const observer = input.observer;
  const signal = input.signal;

  const machine = new VerifiedOperationMachine<ReadOnlyDiscoveryResult>({
    id: operationId,
    type: "READ_ONLY_DISCOVERY",
    ...(clock === undefined ? {} : { clock }),
    ...(observer === undefined ? {} : { observer }),
  });

  try {
    assertNotAborted(signal);
    machine.transition("PREPARING");
    assertNotAborted(signal);
    // Read and validate the provider's public id once after PREPARING so a
    // malformed adapter produces a structured FAILED operation.
    const providerId = rebuildProviderId(
      readProviderDataProperty(provider, "id"),
    );
    assertNotAborted(signal);
    machine.transition("DISCOVERING");
    assertNotAborted(signal);
    const reportedDescriptors = await provider.discover(signal);
    assertNotAborted(signal);
    // Rebuild before entering IDENTIFYING. Duplicate ids, invalid shapes and
    // non-connected descriptors therefore cannot open a device session.
    const descriptors = rebuildDiscoveryDescriptors(reportedDescriptors);
    if (descriptors.length === 0) {
      return machine.fail({
        code: "DEVICE_NOT_FOUND",
        reason: "DISCOVERY_RETURNED_NO_DEVICES",
        details: { providerId },
        retryable: true,
      });
    }

    machine.transition("IDENTIFYING");
    const devices: DiscoveredDevice[] = [];

    for (const descriptor of descriptors) {
      assertNotAborted(signal);
      const session = sessions.acquire({
        deviceId: descriptor.id,
        owner: { id: operationId, kind: "WORKFLOW" },
      });
      try {
        sessions.assertHeld(session);
        assertNotAborted(signal);
        const reportedEvidence = await provider.readIdentity(session, signal);
        assertNotAborted(signal);
        sessions.assertHeld(session);
        const rebuiltEvidence = rebuildDiscoveryEvidence({
          value: reportedEvidence,
          provider,
          providerId,
          ...(evidencePolicy === undefined ? {} : { policy: evidencePolicy }),
        });
        const reportedCapabilities = await provider.readCapabilities(
          session,
          signal,
        );
        assertNotAborted(signal);
        sessions.assertHeld(session);
        const capabilities = rebuildDiscoveryCapabilities({
          value: reportedCapabilities,
          safeIdByReportedId: rebuiltEvidence.safeIdByReportedId,
        });
        const evidence = rebuiltEvidence.evidence;
        const candidates = catalog.match(evidence);
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
        if (sessions.isHeld(session)) {
          sessions.release(session);
        }
      }
    }

    assertNotAborted(signal);
    machine.transition("VERIFYING", {
      messageCode: "DISCOVERY_FACTS_COLLECTED",
    });
    assertNotAborted(signal);
    return machine.verificationSucceeded(
      Object.freeze({
        providerId,
        devices: Object.freeze(devices),
      }),
    );
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return machine.transition("CANCELLED", {
        messageCode: "OPERATION_CANCELLED",
      });
    }
    return machine.fail(safeOperationError(error, "DISCOVERY_PROVIDER_FAILED"));
  }
}
