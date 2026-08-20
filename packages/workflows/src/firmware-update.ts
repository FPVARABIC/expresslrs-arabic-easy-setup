import {
  evaluateFirmwareCompatibility,
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
  DeviceDescriptor,
  DeviceSession,
  OperationRecord,
} from "@elrs-easy/domain";

import {
  approvalMatchesFirmwareUpdatePreview,
  buildFirmwareUpdatePreview,
  rebuildArtifactProvenance,
  rebuildFirmwareArtifactDescriptor,
  type FirmwareUpdateApproval,
  type FirmwareUpdatePreview,
} from "./firmware-update-preview.js";
import {
  acquireWorkflowSession,
  assertNotAborted,
  identityGateError,
  inspectHeldDevice,
  isAbortError,
  readProviderDataProperty,
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
  readonly previewId?: string;
  readonly verificationPlanId?: string;
  readonly provenanceArtifactSha256?: string;
}

/**
 * Safe update orchestration contract exercised only by Synthetic providers.
 * The M4 approval path binds artifact provenance and a verification plan to a
 * fresh live preview. Real flash providers remain explicitly disabled.
 */
export async function runFirmwareUpdate(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly artifact: FirmwareArtifactDescriptor;
  readonly provenance?: ArtifactProvenance;
  readonly provider: FirmwareUpdateProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  /** Legacy M1 Synthetic path; new callers should provide provenance/approval. */
  readonly userConfirmed?: boolean;
  readonly approval?: FirmwareUpdateApproval;
  readonly clock?: WorkflowClock;
  readonly observer?: OperationObserver<FirmwareUpdateResult>;
  readonly signal?: CancellationSignal;
}): Promise<OperationRecord<FirmwareUpdateResult>> {
  // Snapshot caller-controlled values before the machine publishes IDLE. The
  // rebuild helpers read only own data properties and reject accessors.
  const operationId = input.operationId;
  const descriptor: DeviceDescriptor = Object.freeze({ ...input.descriptor });
  const artifact = rebuildFirmwareArtifactDescriptor(input.artifact);
  const provenanceInput = input.provenance;
  const provenance =
    provenanceInput === undefined
      ? null
      : rebuildArtifactProvenance(provenanceInput);
  const provider = input.provider;
  const sessions = input.sessions;
  const catalog = input.catalog;
  const userConfirmed = input.userConfirmed;
  const approval = input.approval;
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
  let providerId: string;
  let updateCapabilityId: string;
  let approvedPreview: FirmwareUpdatePreview | null = null;

  try {
    assertNotAborted(signal);
    machine.transition("PREPARING");
    providerId = rebuildProviderId(readProviderDataProperty(provider, "id"));
    updateCapabilityId = rebuildProviderId(
      readProviderDataProperty(provider, "updateCapabilityId"),
    );
    const executionAuthority = readProviderDataProperty(
      provider,
      "executionAuthority",
    );
    if (executionAuthority !== "SYNTHETIC_ONLY") {
      return machine.fail({
        code: "PROVIDER_UNSUPPORTED",
        reason: "FIRMWARE_HARDWARE_WRITE_DISABLED",
        details: {},
        retryable: false,
      });
    }
    if (approval !== undefined && userConfirmed !== undefined) {
      return machine.fail({
        code: "PERMISSION_DENIED",
        reason: "FIRMWARE_CONFIRMATION_MODE_AMBIGUOUS",
        details: {},
        retryable: false,
      });
    }
    if (artifact === null) {
      return machine.fail({
        code: "ARTIFACT_INVALID",
        reason: "FIRMWARE_ARTIFACT_DESCRIPTOR_INVALID",
        details: {},
        retryable: false,
      });
    }
    if (provenanceInput !== undefined && provenance === null) {
      return machine.fail({
        code: "ARTIFACT_INVALID",
        reason: "FIRMWARE_ARTIFACT_PROVENANCE_INVALID",
        details: {},
        retryable: false,
      });
    }
    if (approval !== undefined && provenance === null) {
      return machine.fail({
        code: "PERMISSION_DENIED",
        reason: "FIRMWARE_APPROVAL_REQUIRES_PROVENANCE",
        details: {},
        retryable: false,
      });
    }

    assertNotAborted(signal);
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
    if (
      updateCapability === undefined ||
      updateCapability.sourceEvidenceIds.length === 0
    ) {
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

    let livePreview: FirmwareUpdatePreview | null = null;
    if (provenance !== null) {
      livePreview = buildFirmwareUpdatePreview({
        operationId,
        descriptor,
        providerId,
        updateCapabilityId,
        executionAuthority,
        identity: initial.identity,
        capabilities: initial.capabilities,
        catalog,
        artifact,
        provenance,
        artifactIntegrityValid: artifactValid,
      });
      if (livePreview.status !== "READY") {
        return machine.fail({
          code: "ARTIFACT_INVALID",
          reason: "FIRMWARE_UPDATE_PREVIEW_BLOCKED",
          details: { blockerCount: livePreview.blockers.length },
          retryable: false,
        });
      }
    }

    machine.transition("WAITING_FOR_CONFIRMATION");
    assertNotAborted(signal);
    if (approval !== undefined) {
      if (
        livePreview === null ||
        !approvalMatchesFirmwareUpdatePreview(livePreview, approval)
      ) {
        return machine.fail({
          code: "PERMISSION_DENIED",
          reason: "FIRMWARE_APPROVAL_DID_NOT_MATCH_LIVE_PREVIEW",
          details: {},
          retryable: false,
        });
      }
      approvedPreview = livePreview;
    } else {
      if (provenance !== null && userConfirmed === true) {
        return machine.fail({
          code: "PERMISSION_DENIED",
          reason: "FIRMWARE_PROVENANCE_REQUIRES_PREVIEW_APPROVAL",
          details: {},
          retryable: false,
        });
      }
      if (userConfirmed !== true) {
        return machine.transition("CANCELLED", {
          messageCode: "USER_DID_NOT_CONFIRM_UPDATE",
        });
      }
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
      readProviderDataProperty(receipt, "writeCompleted") === true;
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
    const bytesWritten = readProviderDataProperty(receipt, "bytesWritten");
    const totalBytes = readProviderDataProperty(receipt, "totalBytes");
    machine.transition("WRITE_COMPLETED", {
      messageCode: "PROVIDER_WRITE_COMPLETED",
      ...(bytesWritten === undefined
        ? {}
        : { bytesWritten: bytesWritten as number }),
      ...(totalBytes === undefined ? {} : { totalBytes: totalBytes as number }),
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
    const reportedReconnectedDescriptor = await provider.reconnect(
      descriptor.id,
      signal,
    );
    assertNotAborted(signal);
    if (reportedReconnectedDescriptor === null) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "RECOVERY_REQUIRED",
        reason: "DEVICE_DID_NOT_RETURN_AFTER_FIRMWARE_WRITE",
        details: { expectedDeviceId: descriptor.id },
        retryable: true,
      });
    }
    const [reconnectedDescriptor] = rebuildDiscoveryDescriptors([
      reportedReconnectedDescriptor,
    ]);
    if (reconnectedDescriptor === undefined) {
      throw new Error("Core descriptor rebuild returned no value");
    }
    if (reconnectedDescriptor.id !== descriptor.id) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "VERIFICATION_FAILED",
        reason: "POST_WRITE_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
        details: {},
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
        details: { expectedTargetId },
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
    const verificationValid = readProviderDataProperty(verification, "valid");
    const verificationReason = readProviderDataProperty(verification, "reason");
    const observedTargetId = readProviderDataProperty(
      verification,
      "observedTargetId",
    );
    const observedFirmwareVersion = readProviderDataProperty(
      verification,
      "observedFirmwareVersion",
    );
    const verificationPassed =
      verificationValid === true &&
      verificationReason === "EXPECTED_FIRMWARE_OBSERVED" &&
      observedTargetId === expectedTargetId &&
      observedFirmwareVersion === artifact.firmwareVersion;
    if (!verificationPassed) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "VERIFICATION_FAILED",
        reason: "POST_WRITE_FIRMWARE_VERIFICATION_FAILED",
        details: {
          expectedTargetId,
          expectedVersion: artifact.firmwareVersion,
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
        ...(approvedPreview === null
          ? {}
          : {
              previewId: approvedPreview.previewId,
              verificationPlanId: approvedPreview.verificationPlan!.id,
              provenanceArtifactSha256:
                approvedPreview.provenance!.artifactSha256,
            }),
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
