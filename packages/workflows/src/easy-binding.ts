import type { TargetCatalog } from "@elrs-easy/compatibility";
import {
  rebuildDiscoveryDescriptors,
  rebuildProviderId,
  type DeviceSessionManager,
} from "@elrs-easy/device";
import type {
  CancellationSignal,
  DeviceDescriptor,
  DeviceSession,
  OperationRecord,
} from "@elrs-easy/domain";

import {
  approvalMatchesEasyBindingPreview,
  buildEasyBindingPreview,
  type EasyBindingApproval,
} from "./binding-preview.js";
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
import type { BindingProvider } from "./sensitive-operation-contracts.js";
import {
  VerifiedOperationMachine,
  type OperationObserver,
  type WorkflowClock,
} from "./operation-machine.js";

export interface EasyBindingResult {
  readonly providerId: string;
  readonly deviceId: string;
  readonly targetId: string;
  readonly previewId: string;
  readonly verification: "LINK_ESTABLISHED";
}

/**
 * Foundation binding workflow. It is provider-agnostic at the orchestration
 * boundary, but the current contract admits Synthetic execution authority
 * only. A completed command never counts as a bound link.
 */
export async function runEasyBinding(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly provider: BindingProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  /** Legacy M1 Synthetic confirmation path; new callers should use approval. */
  readonly userConfirmed?: boolean;
  /** Approval bound to a previously prepared live preview. */
  readonly approval?: EasyBindingApproval;
  readonly clock?: WorkflowClock;
  readonly observer?: OperationObserver<EasyBindingResult>;
  readonly signal?: CancellationSignal;
}): Promise<OperationRecord<EasyBindingResult>> {
  // Capture every caller-controlled input before constructing the machine: its
  // constructor publishes IDLE synchronously, so an observer can run before
  // the first workflow statement. Structured safety inputs are copied and
  // frozen; live service/signal references are captured once and never read
  // again through the mutable input object.
  const operationId = input.operationId;
  const descriptor: DeviceDescriptor = Object.freeze({ ...input.descriptor });
  const provider = input.provider;
  const sessions = input.sessions;
  const catalog = input.catalog;
  const userConfirmed = input.userConfirmed;
  const approval = input.approval;
  const clock = input.clock;
  const observer = input.observer;
  const signal = input.signal;
  const machine = new VerifiedOperationMachine<EasyBindingResult>({
    id: operationId,
    type: "EASY_BINDING",
    ...(clock === undefined ? {} : { clock }),
    ...(observer === undefined ? {} : { observer }),
  });
  let session: DeviceSession | null = null;
  let commandStarted = false;
  let commandCompleted = false;
  let providerId: string;

  try {
    assertNotAborted(signal);
    machine.transition("PREPARING");
    providerId = rebuildProviderId(readProviderDataProperty(provider, "id"));
    assertNotAborted(signal);
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

    const preview = buildEasyBindingPreview({
      operationId,
      descriptor,
      providerId,
      executionAuthority: readProviderDataProperty(
        provider,
        "executionAuthority",
      ),
      identity: initial.identity,
      capabilities: initial.capabilities,
      catalog,
    });
    if (preview.status !== "READY") {
      return machine.fail({
        code: "PROVIDER_UNSUPPORTED",
        reason: "BINDING_PREVIEW_BLOCKED",
        details: { blockerCount: preview.blockers.length },
        retryable: false,
      });
    }
    const expectedTargetId = preview.targetId!;

    machine.transition("WAITING_FOR_CONFIRMATION");
    assertNotAborted(signal);
    if (approval !== undefined && userConfirmed !== undefined) {
      return machine.fail({
        code: "PERMISSION_DENIED",
        reason: "BINDING_CONFIRMATION_MODE_AMBIGUOUS",
        details: {},
        retryable: false,
      });
    }
    if (approval !== undefined) {
      if (!approvalMatchesEasyBindingPreview(preview, approval)) {
        return machine.fail({
          code: "PERMISSION_DENIED",
          reason: "BINDING_APPROVAL_DID_NOT_MATCH_LIVE_PREVIEW",
          details: {},
          retryable: false,
        });
      }
    } else if (userConfirmed !== true) {
      return machine.transition("CANCELLED", {
        messageCode: "USER_DID_NOT_CONFIRM_BINDING",
      });
    }

    machine.transition("EXECUTING");
    assertNotAborted(signal);
    sessions.assertHeld(session);
    await provider.prepareBinding(session, signal);
    assertNotAborted(signal);
    sessions.assertHeld(session);
    assertNotAborted(signal);
    commandStarted = true;
    const receipt = await provider.executeBinding(session, signal);
    commandCompleted =
      readProviderDataProperty(receipt, "commandCompleted") === true;
    assertNotAborted(signal);
    if (!commandCompleted) {
      return machine.endUncertain("UNKNOWN_STATE", {
        code: "VERIFICATION_FAILED",
        reason: "BINDING_COMMAND_COMPLETION_NOT_CONFIRMED",
        details: { providerId },
        retryable: true,
      });
    }
    sessions.assertHeld(session);
    releaseIfHeld(sessions, session);
    session = null;

    machine.transition("RECONNECTING", {
      messageCode: "BINDING_COMMAND_COMPLETED_RECONNECTING",
    });
    assertNotAborted(signal);
    const reportedReconnectedDescriptor = await provider.reconnect(
      descriptor.id,
      signal,
    );
    assertNotAborted(signal);
    if (reportedReconnectedDescriptor === null) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "RECOVERY_REQUIRED",
        reason: "DEVICE_DID_NOT_RETURN_AFTER_BINDING",
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
      return machine.endUncertain("UNKNOWN_STATE", {
        code: "VERIFICATION_FAILED",
        reason: "RECONNECTED_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
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
      return machine.endUncertain("UNKNOWN_STATE", {
        code: "TARGET_MISMATCH",
        reason: "RECONNECTED_DEVICE_IDENTITY_DID_NOT_MATCH",
        details: { expectedTargetId },
        retryable: false,
      });
    }

    machine.transition("VERIFYING");
    assertNotAborted(signal);
    const verification = await provider.verifyBinding(session, signal);
    assertNotAborted(signal);
    sessions.assertHeld(session);
    const verificationPassed =
      readProviderDataProperty(verification, "linked") === true &&
      readProviderDataProperty(verification, "reason") === "LINK_ESTABLISHED";
    if (!verificationPassed) {
      return machine.fail({
        code: "VERIFICATION_FAILED",
        reason: "BINDING_LINK_VERIFICATION_FAILED",
        details: { targetId: expectedTargetId },
        retryable: true,
      });
    }

    return machine.verificationSucceeded(
      Object.freeze({
        providerId,
        deviceId: reconnectedDescriptor.id,
        targetId: expectedTargetId,
        previewId: preview.previewId,
        verification: "LINK_ESTABLISHED",
      }),
    );
  } catch (error: unknown) {
    const operationError = safeOperationError(
      error,
      "BINDING_PROVIDER_FAILED_UNEXPECTEDLY",
    );
    if (isAbortError(error) && !commandStarted) {
      return machine.transition("CANCELLED", {
        messageCode: "OPERATION_CANCELLED",
      });
    }
    if (commandStarted && !commandCompleted) {
      return machine.endUncertain("UNKNOWN_STATE", {
        ...operationError,
        reason: "BINDING_COMMAND_OUTCOME_UNKNOWN",
      });
    }
    if (commandCompleted) {
      return machine.endUncertain("RECOVERY_REQUIRED", operationError);
    }
    return machine.fail(operationError);
  } finally {
    releaseIfHeld(sessions, session);
  }
}
