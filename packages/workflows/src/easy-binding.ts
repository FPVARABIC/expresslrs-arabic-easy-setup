import type { TargetCatalog } from "@elrs-easy/compatibility";
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
  readonly verification: "LINK_ESTABLISHED";
}

/**
 * Foundation binding workflow. It is provider-agnostic; Milestone 1 supplies
 * synthetic providers only. A completed command never counts as a bound link.
 */
export async function runEasyBinding(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly provider: BindingProvider;
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly userConfirmed: boolean;
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
  const providerId = provider.id;
  const sessions = input.sessions;
  const catalog = input.catalog;
  const userConfirmed = input.userConfirmed;
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

  try {
    assertNotAborted(signal);
    machine.transition("PREPARING");
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
    const expectedTargetId = initial.identity.selectedTargetId!;
    const bindingCapability = initial.capabilities.find(
      (capability) =>
        capability.id === "guided-bind" && capability.available === true,
    );
    if (bindingCapability === undefined) {
      return machine.fail({
        code: "PROVIDER_UNSUPPORTED",
        reason: "BINDING_CAPABILITY_NOT_AVAILABLE",
        details: { providerId },
        retryable: false,
      });
    }

    machine.transition("WAITING_FOR_CONFIRMATION");
    assertNotAborted(signal);
    if (!userConfirmed) {
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
      (receipt as { readonly commandCompleted?: unknown }).commandCompleted ===
      true;
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
    const reconnectedDescriptor = await provider.reconnect(
      descriptor.id,
      signal,
    );
    assertNotAborted(signal);
    if (reconnectedDescriptor === null) {
      return machine.endUncertain("RECOVERY_REQUIRED", {
        code: "RECOVERY_REQUIRED",
        reason: "DEVICE_DID_NOT_RETURN_AFTER_BINDING",
        details: { expectedDeviceId: descriptor.id },
        retryable: true,
      });
    }
    if (reconnectedDescriptor.id !== descriptor.id) {
      return machine.endUncertain("UNKNOWN_STATE", {
        code: "VERIFICATION_FAILED",
        reason: "RECONNECTED_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
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
      return machine.endUncertain("UNKNOWN_STATE", {
        code: "TARGET_MISMATCH",
        reason: "RECONNECTED_DEVICE_IDENTITY_DID_NOT_MATCH",
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
    const verification = await provider.verifyBinding(session, signal);
    assertNotAborted(signal);
    sessions.assertHeld(session);
    const verificationPassed =
      (verification as { readonly linked?: unknown }).linked === true &&
      (verification as { readonly reason?: unknown }).reason ===
        "LINK_ESTABLISHED";
    if (!verificationPassed) {
      return machine.fail({
        code: "VERIFICATION_FAILED",
        reason: verification.reason,
        details: { targetId: expectedTargetId },
        retryable: true,
      });
    }

    return machine.verificationSucceeded(
      Object.freeze({
        providerId,
        deviceId: reconnectedDescriptor.id,
        targetId: expectedTargetId,
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
