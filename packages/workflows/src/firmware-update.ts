import {
  evaluateFirmwareCompatibility,
  type FirmwareArtifactDescriptor,
  type TargetCatalog,
} from "@elrs-easy/compatibility";
import type { DeviceSessionManager } from "@elrs-easy/device";
import type {
  CancellationSignal,
  DeviceDescriptor,
  DeviceSession,
  OperationRecord,
} from "@elrs-easy/domain";

import {
  acquireWorkflowSession,
  assertNotAborted,
  identityGateError,
  inspectHeldDevice,
  isAbortError,
  releaseIfHeld,
  safeOperationError,
} from "./sensitive-operation-helpers.js";
import type { FirmwareUpdateProvider } from "./sensitive-operation-contracts.js";
import {
  VerifiedOperationMachine,
  type OperationObserver,
  type WorkflowClock,
} from "./operation-machine.js";

export interface FirmwareUpdateResult {
  readonly providerId: string;
  readonly deviceId: string;
  readonly targetId: string;
  readonly firmwareVersion: string;
  readonly artifactSha256: string;
  readonly verification: "EXPECTED_FIRMWARE_OBSERVED";
}

function hasRuntimeArtifactShape(
  artifact: FirmwareArtifactDescriptor,
): boolean {
  const runtimeArtifact = artifact as Partial<
    Record<keyof FirmwareArtifactDescriptor, unknown>
  >;
  return (
    typeof runtimeArtifact.targetId === "string" &&
    runtimeArtifact.targetId.trim().length > 0 &&
    typeof runtimeArtifact.firmwareVersion === "string" &&
    runtimeArtifact.firmwareVersion.length > 0 &&
    typeof runtimeArtifact.sha256 === "string" &&
    runtimeArtifact.sha256.trim().length > 0
  );
}

/**
 * Safe update orchestration contract exercised only by synthetic providers in
 * Milestone 1. Real flash providers are explicitly deferred.
 */
export async function runFirmwareUpdate(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly artifact: FirmwareArtifactDescriptor;
  readonly provider: FirmwareUpdateProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly userConfirmed: boolean;
  readonly clock?: WorkflowClock;
  readonly observer?: OperationObserver<FirmwareUpdateResult>;
  readonly signal?: CancellationSignal;
}): Promise<OperationRecord<FirmwareUpdateResult>> {
  // The operation machine publishes IDLE from its constructor. Snapshot every
  // caller-controlled input before that observer boundary so later mutation of
  // the input object cannot change device intent, artifact identity, provider
  // selection, or confirmation after validation has begun.
  const operationId = input.operationId;
  const descriptor: DeviceDescriptor = Object.freeze({ ...input.descriptor });
  const artifact: FirmwareArtifactDescriptor = Object.freeze({
    ...input.artifact,
  });
  const provider = input.provider;
  const providerId = provider.id;
  const updateCapabilityId = provider.updateCapabilityId;
  const sessions = input.sessions;
  const catalog = input.catalog;
  const userConfirmed = input.userConfirmed;
  const clock = input.clock;
  const observer = input.observer;
  const signal = input.signal;
  const machine = new VerifiedOperationMachine<FirmwareUpdateResult>({
    id: operationId,
    type: "FIRMWARE_UPDATE",
    ...(clock === undefined ? {} : { clock }),
    ...(observer === undefined ? {} : { observer }),
  });
  let session: DeviceSession | null = null;
  let writeStarted = false;
  let writeCompleted = false;

  try {
    assertNotAborted(signal);
    machine.transition("PREPARING");
    assertNotAborted(signal);
    if (!hasRuntimeArtifactShape(artifact)) {
      return machine.fail({
        code: "ARTIFACT_INVALID",
        reason: "FIRMWARE_ARTIFACT_DESCRIPTOR_INVALID",
        details: {},
        retryable: false,
      });
    }
    const artifactValid = await provider.validateArtifact(artifact, signal);
    assertNotAborted(signal);
    if (artifactValid !== true) {
      return machine.fail({
        code: "ARTIFACT_INVALID",
        reason: "ARTIFACT_INTEGRITY_CHECK_FAILED",
        details: { sha256: artifact.sha256 },
        retryable: false,
      });
    }

    machine.transition("IDENTIFYING");
    assertNotAborted(signal);
    session = acquireWorkflowSession({ descriptor, operationId, sessions });
    const initial = await inspectHeldDevice({
      reader: provider,
      session,
      sessions,
      catalog,
      signal,
    });
    const identityError = identityGateError(initial.identity);
    if (identityError !== null) {
      return machine.fail(identityError);
    }
    const expectedTargetId = initial.identity.selectedTargetId!;
    const updateCapability = initial.capabilities.find(
      (capability) =>
        capability.id === updateCapabilityId && capability.available === true,
    );
    if (updateCapability === undefined) {
      return machine.fail({
        code: "PROVIDER_UNSUPPORTED",
        reason: "UPDATE_CAPABILITY_NOT_AVAILABLE",
        details: {
          providerId,
          capabilityId: updateCapabilityId,
        },
        retryable: false,
      });
    }
    const compatibility = evaluateFirmwareCompatibility({
      identity: initial.identity,
      artifact,
      updateProvider: providerId,
      catalog,
    });
    if (compatibility.status !== "COMPATIBLE") {
      return machine.fail({
        code: compatibility.blockingErrorCode ?? "VERSION_INCOMPATIBLE",
        reason: compatibility.reasons[0] ?? "FIRMWARE_NOT_COMPATIBLE",
        details: { targetId: expectedTargetId },
        retryable: false,
      });
    }

    machine.transition("WAITING_FOR_CONFIRMATION");
    assertNotAborted(signal);
    if (!userConfirmed) {
      return machine.transition("CANCELLED", {
        messageCode: "USER_DID_NOT_CONFIRM_UPDATE",
      });
    }

    machine.transition("EXECUTING");
    assertNotAborted(signal);
    sessions.assertHeld(session);
    await provider.prepareUpdate(session, artifact, signal);
    assertNotAborted(signal);
    sessions.assertHeld(session);
    assertNotAborted(signal);
    writeStarted = true;
    const receipt = await provider.writeFirmware(session, artifact, signal);
    writeCompleted =
      (receipt as { readonly writeCompleted?: unknown }).writeCompleted ===
      true;
    assertNotAborted(signal);
    if (!writeCompleted) {
      return machine.endUncertain("UNKNOWN_STATE", {
        code: "VERIFICATION_FAILED",
        reason: "FIRMWARE_WRITE_COMPLETION_NOT_CONFIRMED",
        details: { providerId },
        retryable: true,
      });
    }
    sessions.assertHeld(session);
    machine.transition("WRITE_COMPLETED", {
      messageCode: "PROVIDER_WRITE_COMPLETED",
      ...(receipt.bytesWritten === undefined
        ? {}
        : { bytesWritten: receipt.bytesWritten }),
      ...(receipt.totalBytes === undefined
        ? {}
        : { totalBytes: receipt.totalBytes }),
    });
    assertNotAborted(signal);

    machine.transition("REBOOTING");
    assertNotAborted(signal);
    await provider.reboot(session, signal);
    assertNotAborted(signal);
    releaseIfHeld(sessions, session);
    session = null;

    machine.transition("RECONNECTING");
    assertNotAborted(signal);
    const reconnectedDescriptor = await provider.reconnect(
      descriptor.id,
      signal,
    );
    assertNotAborted(signal);
    if (reconnectedDescriptor === null) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "RECOVERY_REQUIRED",
        reason: "DEVICE_DID_NOT_RETURN_AFTER_FIRMWARE_WRITE",
        details: { expectedDeviceId: descriptor.id },
        retryable: true,
      });
    }
    if (reconnectedDescriptor.id !== descriptor.id) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "VERIFICATION_FAILED",
        reason: "POST_WRITE_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
        details: {
          expectedDeviceId: descriptor.id,
          observedDeviceId: reconnectedDescriptor.id,
        },
        retryable: false,
      });
    }

    session = acquireWorkflowSession({
      descriptor: reconnectedDescriptor,
      operationId,
      sessions,
    });
    const reconnected = await inspectHeldDevice({
      reader: provider,
      session,
      sessions,
      catalog,
      signal,
    });
    if (
      reconnected.identity.confidence !== "CONFIRMED" ||
      reconnected.identity.selectedTargetId !== expectedTargetId
    ) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "TARGET_MISMATCH",
        reason: "POST_WRITE_TARGET_VERIFICATION_FAILED",
        details: {
          expectedTargetId,
          observedTargetId:
            reconnected.identity.selectedTargetId ?? "unresolved",
        },
        retryable: false,
      });
    }

    machine.transition("VERIFYING");
    assertNotAborted(signal);
    const verification = await provider.verifyFirmware(
      session,
      artifact,
      signal,
    );
    assertNotAborted(signal);
    sessions.assertHeld(session);
    const verificationPassed =
      (verification as { readonly valid?: unknown }).valid === true &&
      (verification as { readonly reason?: unknown }).reason ===
        "EXPECTED_FIRMWARE_OBSERVED" &&
      verification.observedTargetId === expectedTargetId &&
      verification.observedFirmwareVersion === artifact.firmwareVersion;
    if (!verificationPassed) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "VERIFICATION_FAILED",
        reason: verification.reason,
        details: {
          expectedTargetId,
          observedTargetId: verification.observedTargetId ?? "unresolved",
          expectedVersion: artifact.firmwareVersion,
          observedVersion: verification.observedFirmwareVersion ?? "unresolved",
        },
        retryable: true,
      });
    }

    return machine.verificationSucceeded(
      Object.freeze({
        providerId,
        deviceId: reconnectedDescriptor.id,
        targetId: expectedTargetId,
        firmwareVersion: artifact.firmwareVersion,
        artifactSha256: artifact.sha256,
        verification: "EXPECTED_FIRMWARE_OBSERVED",
      }),
    );
  } catch (error: unknown) {
    const operationError = safeOperationError(
      error,
      "FIRMWARE_UPDATE_PROVIDER_FAILED_UNEXPECTEDLY",
    );
    if (isAbortError(error) && !writeStarted) {
      return machine.transition("CANCELLED", {
        messageCode: "OPERATION_CANCELLED_BEFORE_WRITE",
      });
    }
    if (writeStarted && !writeCompleted) {
      return machine.endUncertain("UNKNOWN_STATE", {
        ...operationError,
        reason: "FIRMWARE_WRITE_OUTCOME_UNKNOWN",
      });
    }
    if (writeCompleted) {
      return machine.endUncertain("RECOVERY_REQUIRED", operationError);
    }
    return machine.fail(operationError);
  } finally {
    releaseIfHeld(sessions, session);
  }
}
