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
  acquireWorkflowSession,
  assertNotAborted,
  assertSensitiveProviderAdmitted,
  identityGateError,
  inspectHeldDevice,
  isAbortError,
  readOwnDataProperty,
  readProviderDataProperty,
  releaseIfHeld,
  requireDataMethod,
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
 * Foundation binding workflow. It is provider-agnostic; the pre-Hardware gate
 * currently admits Synthetic providers only. A completed command never counts
 * as a bound link.
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
  // the first workflow statement. Data envelopes are rebuilt without accessors;
  // live services/control ports are captured once from own data properties.
  const operationId = rebuildProviderId(
    readOwnDataProperty(input, "operationId"),
  );
  const [descriptor] = rebuildDiscoveryDescriptors([
    readOwnDataProperty(input, "descriptor"),
  ]);
  if (descriptor === undefined) {
    throw new TypeError("Binding descriptor rebuild returned no value");
  }
  const provider = readOwnDataProperty(input, "provider") as
    | BindingProvider
    | undefined;
  const sessions = readOwnDataProperty(input, "sessions") as
    | DeviceSessionManager
    | undefined;
  const catalog = readOwnDataProperty(input, "catalog") as
    | TargetCatalog
    | undefined;
  const userConfirmed = readOwnDataProperty(input, "userConfirmed");
  const clock = readOwnDataProperty(input, "clock") as WorkflowClock | undefined;
  const observer = readOwnDataProperty(input, "observer") as
    | OperationObserver<EasyBindingResult>
    | undefined;
  const signal = readOwnDataProperty(input, "signal") as
    | CancellationSignal
    | undefined;
  if (
    provider === undefined ||
    sessions === undefined ||
    catalog === undefined ||
    typeof userConfirmed !== "boolean"
  ) {
    throw new TypeError("Binding workflow input is invalid");
  }
  const providerId = assertSensitiveProviderAdmitted(provider);
  const prepareBinding = requireDataMethod(
    provider,
    "prepareBinding",
    "BINDING_PREPARE_METHOD_UNAVAILABLE",
  );
  const executeBinding = requireDataMethod(
    provider,
    "executeBinding",
    "BINDING_EXECUTE_METHOD_UNAVAILABLE",
  );
  const reconnect = requireDataMethod(
    provider,
    "reconnect",
    "BINDING_RECONNECT_METHOD_UNAVAILABLE",
  );
  const verifyBinding = requireDataMethod(
    provider,
    "verifyBinding",
    "BINDING_VERIFY_METHOD_UNAVAILABLE",
  );
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
    // Revalidate the immutable provider id after machine construction so later
    // operation evidence uses the same captured identity.
    if (rebuildProviderId(readProviderDataProperty(provider, "id")) !== providerId) {
      return machine.fail({
        code: "PROVIDER_UNSUPPORTED",
        reason: "BINDING_PROVIDER_ID_CHANGED",
        details: {},
        retryable: false,
      });
    }
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
    await Reflect.apply(prepareBinding, provider, [session, signal]);
    assertNotAborted(signal);
    sessions.assertHeld(session);
    assertNotAborted(signal);
    commandStarted = true;
    const receipt = await Reflect.apply(executeBinding, provider, [
      session,
      signal,
    ]);
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
    const reportedReconnectedDescriptor = (await Reflect.apply(
      reconnect,
      provider,
      [descriptor.id, signal],
    )) as DeviceDescriptor | null;
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
    const verification = await Reflect.apply(verifyBinding, provider, [
      session,
      signal,
    ]);
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
