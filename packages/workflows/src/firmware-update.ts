import {
  evaluateFirmwareCompatibility,
  type FirmwareUpdateArtifact,
  type TargetCatalog,
} from "@elrs-easy/compatibility";
import {
  rebuildDiscoveryDescriptors,
  rebuildProviderId,
  type DeviceSessionManager,
} from "@elrs-easy/device";
import type {
  ArtifactManifestTrustStatus,
  ArtifactProvenance,
  ArtifactProvenanceValidationLevel,
  CancellationSignal,
  DeviceDescriptor,
  DeviceSession,
  FirmwareArtifactByteVerification,
  FirmwareArtifactDigestProvider,
  FirmwareUpdateMethod,
  FirmwareUpdateProviderAssurance,
  OperationRecord,
  VerificationPlan,
} from "@elrs-easy/domain";
import { currentArtifactManifestTrustStatus } from "@elrs-easy/domain";

import { snapshotFirmwareUpdateArtifact } from "./firmware-artifact.js";
import {
  snapshotFirmwareArtifactBytes,
  verifyFirmwareArtifactBytes,
} from "./firmware-artifact-bytes.js";
import { selectFirmwareUpdateProvider } from "./firmware-update-provider-selection.js";
import {
  acquireWorkflowSession,
  assertNotAborted,
  identityGateError,
  inspectHeldDevice,
  isAbortError,
  readOwnDataProperty,
  readProviderDataProperty,
  releaseIfHeld,
  requireDataMethod,
  safeOperationError,
} from "./sensitive-operation-helpers.js";
import type {
  FirmwareUpdateProvider,
  VerifiedFirmwareUpdateArtifact,
} from "./sensitive-operation-contracts.js";
import {
  VerifiedOperationMachine,
  type OperationObserver,
  type WorkflowClock,
} from "./operation-machine.js";
import {
  createFirmwareUpdateVerificationPlan,
  evaluateVerificationPlan,
  type VerificationObservation,
} from "./verification-plan.js";

export interface FirmwareUpdateResult {
  readonly providerId: string;
  readonly providerAssurance: FirmwareUpdateProviderAssurance;
  readonly updateMethod: FirmwareUpdateMethod;
  readonly deviceId: string;
  readonly targetId: string;
  readonly firmwareVersion: string;
  readonly artifactSha256: string;
  readonly artifactProvenance: ArtifactProvenance;
  readonly artifactProvenanceValidation: ArtifactProvenanceValidationLevel;
  readonly artifactByteVerification: FirmwareArtifactByteVerification;
  readonly artifactManifestTrust: ArtifactManifestTrustStatus;
  readonly verificationPlan: VerificationPlan;
  readonly verification: "EXPECTED_FIRMWARE_OBSERVED";
}

const maximumUpdateProviders = 32;

function snapshotProviderRegistry(value: unknown): readonly FirmwareUpdateProvider[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  const length = readOwnDataProperty(value, "length");
  if (
    !Number.isInteger(length) ||
    (length as number) < 0 ||
    (length as number) > maximumUpdateProviders
  ) {
    return Object.freeze([]);
  }
  const providers: FirmwareUpdateProvider[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const provider = readOwnDataProperty(value, index);
    if (typeof provider !== "object" || provider === null) {
      return Object.freeze([]);
    }
    providers.push(provider as FirmwareUpdateProvider);
  }
  return Object.freeze(providers);
}

function safeOptionalCount(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

/**
 * Safe update orchestration contract exercised only by Synthetic providers in
 * the pre-Hardware phase. Real flash providers remain explicitly deferred.
 */
export async function runFirmwareUpdate(input: {
  readonly operationId: string;
  readonly descriptor: DeviceDescriptor;
  readonly artifact: FirmwareUpdateArtifact;
  readonly artifactBytes: Uint8Array;
  readonly artifactDigestProvider: FirmwareArtifactDigestProvider;
  readonly providers: readonly FirmwareUpdateProvider[];
  readonly sessions: DeviceSessionManager;
  readonly catalog: TargetCatalog;
  readonly userConfirmed: boolean;
  readonly clock?: WorkflowClock;
  readonly observer?: OperationObserver<FirmwareUpdateResult>;
  readonly signal?: CancellationSignal;
}): Promise<OperationRecord<FirmwareUpdateResult>> {
  // Snapshot every data envelope before the operation machine publishes IDLE.
  // Accessors/iterators are not used to copy device intent or provider lists.
  const operationId = rebuildProviderId(
    readOwnDataProperty(input, "operationId"),
  );
  const [descriptor] = rebuildDiscoveryDescriptors([
    readOwnDataProperty(input, "descriptor"),
  ]);
  if (descriptor === undefined) {
    throw new TypeError("Firmware descriptor rebuild returned no value");
  }
  const artifactSnapshot = snapshotFirmwareUpdateArtifact(
    readOwnDataProperty(input, "artifact") as FirmwareUpdateArtifact,
  );
  const artifactByteSnapshot = snapshotFirmwareArtifactBytes(
    readOwnDataProperty(input, "artifactBytes"),
  );
  const artifactDigestProvider = readOwnDataProperty(
    input,
    "artifactDigestProvider",
  ) as FirmwareArtifactDigestProvider | undefined;
  const providers = snapshotProviderRegistry(
    readOwnDataProperty(input, "providers"),
  );
  const sessions = readOwnDataProperty(input, "sessions") as
    | DeviceSessionManager
    | undefined;
  const catalog = readOwnDataProperty(input, "catalog") as
    | TargetCatalog
    | undefined;
  const userConfirmed = readOwnDataProperty(input, "userConfirmed");
  const clock = readOwnDataProperty(input, "clock") as WorkflowClock | undefined;
  const observer = readOwnDataProperty(input, "observer") as
    | OperationObserver<FirmwareUpdateResult>
    | undefined;
  const signal = readOwnDataProperty(input, "signal") as
    | CancellationSignal
    | undefined;
  if (
    artifactDigestProvider === undefined ||
    sessions === undefined ||
    catalog === undefined ||
    typeof userConfirmed !== "boolean"
  ) {
    throw new TypeError("Firmware update workflow input is invalid");
  }

  const machine = new VerifiedOperationMachine<FirmwareUpdateResult>({
    id: operationId,
    type: "FIRMWARE_UPDATE",
    ...(clock === undefined ? {} : { clock }),
    ...(observer === undefined ? {} : { observer }),
  });
  let session: DeviceSession | null = null;
  let writeStarted = false;
  let writeCompleted = false;
  let provider: FirmwareUpdateProvider;
  let providerId: string;
  let providerAssurance: FirmwareUpdateProviderAssurance;
  let updateMethod: FirmwareUpdateMethod;
  let updateCapabilityId: string;

  try {
    assertNotAborted(signal);
    machine.transition("PREPARING");
    assertNotAborted(signal);
    if (artifactSnapshot.status === "BLOCKED") {
      return machine.fail({
        code: "ARTIFACT_INVALID",
        reason: artifactSnapshot.reason,
        details: {},
        retryable: false,
      });
    }
    const artifact = artifactSnapshot.artifact;
    const verifiedBytes = await verifyFirmwareArtifactBytes({
      snapshot: artifactByteSnapshot,
      expectedByteLength: artifact.provenance.artifactSizeBytes,
      expectedSha256: artifact.sha256,
      digestProvider: artifactDigestProvider,
      ...(signal === undefined ? {} : { signal }),
    });
    assertNotAborted(signal);
    if (verifiedBytes.status === "BLOCKED") {
      return machine.fail({
        code: "ARTIFACT_INVALID",
        reason: verifiedBytes.reason,
        details: {},
        retryable: false,
      });
    }
    const createProviderArtifact = (): VerifiedFirmwareUpdateArtifact =>
      Object.freeze({
        artifact,
        bytes: verifiedBytes.copyBytes(),
        byteVerification: verifiedBytes.verification,
        manifestTrust: currentArtifactManifestTrustStatus,
      });
    const verificationPlan = createFirmwareUpdateVerificationPlan({
      expectedDeviceId: descriptor.id,
      expectedTargetId: artifact.targetId,
      expectedFirmwareVersion: artifact.firmwareVersion,
    });
    const artifactTarget = catalog.get(artifact.targetId);
    if (artifactTarget === null) {
      return machine.fail({
        code: "TARGET_UNKNOWN",
        reason: "ARTIFACT_TARGET_NOT_IN_CATALOG",
        details: { targetId: artifact.targetId },
        retryable: false,
      });
    }
    const providerSelection = selectFirmwareUpdateProvider({
      target: artifactTarget,
      providers,
    });
    if (providerSelection.status === "BLOCKED") {
      return machine.fail({
        code: "PROVIDER_UNSUPPORTED",
        reason: providerSelection.reason,
        details: { targetId: artifactTarget.targetId },
        retryable: false,
      });
    }
    provider = providerSelection.provider;
    providerId = providerSelection.providerId;
    providerAssurance = providerSelection.providerAssurance;
    updateMethod = providerSelection.updateMethod;
    updateCapabilityId = providerSelection.updateCapabilityId;

    const validateArtifact = requireDataMethod(
      provider,
      "validateArtifact",
      "FIRMWARE_VALIDATE_METHOD_UNAVAILABLE",
    );
    const prepareUpdate = requireDataMethod(
      provider,
      "prepareUpdate",
      "FIRMWARE_PREPARE_METHOD_UNAVAILABLE",
    );
    const writeFirmware = requireDataMethod(
      provider,
      "writeFirmware",
      "FIRMWARE_WRITE_METHOD_UNAVAILABLE",
    );
    const reboot = requireDataMethod(
      provider,
      "reboot",
      "FIRMWARE_REBOOT_METHOD_UNAVAILABLE",
    );
    const reconnect = requireDataMethod(
      provider,
      "reconnect",
      "FIRMWARE_RECONNECT_METHOD_UNAVAILABLE",
    );
    const verifyFirmware = requireDataMethod(
      provider,
      "verifyFirmware",
      "FIRMWARE_VERIFY_METHOD_UNAVAILABLE",
    );

    const artifactValid = await Reflect.apply(validateArtifact, provider, [
      createProviderArtifact(),
      signal,
    ]);
    assertNotAborted(signal);
    if (artifactValid !== true) {
      return machine.fail({
        code: "ARTIFACT_INVALID",
        reason: "ARTIFACT_INTEGRITY_CHECK_FAILED",
        details: { artifactSha256: artifact.sha256 },
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
          updateMethod,
          capabilityId: updateCapabilityId,
        },
        retryable: false,
      });
    }
    const compatibility = evaluateFirmwareCompatibility({
      identity: initial.identity,
      artifact,
      updateMethod,
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
    await Reflect.apply(prepareUpdate, provider, [
      session,
      createProviderArtifact(),
      signal,
    ]);
    assertNotAborted(signal);
    sessions.assertHeld(session);
    assertNotAborted(signal);
    writeStarted = true;
    const receipt = await Reflect.apply(writeFirmware, provider, [
      session,
      createProviderArtifact(),
      signal,
    ]);
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
    const bytesWritten = safeOptionalCount(
      readProviderDataProperty(receipt, "bytesWritten"),
    );
    const totalBytes = safeOptionalCount(
      readProviderDataProperty(receipt, "totalBytes"),
    );
    machine.transition("WRITE_COMPLETED", {
      messageCode: "PROVIDER_WRITE_COMPLETED",
      ...(bytesWritten === undefined ? {} : { bytesWritten }),
      ...(totalBytes === undefined ? {} : { totalBytes }),
    });
    assertNotAborted(signal);

    machine.transition("REBOOTING");
    assertNotAborted(signal);
    await Reflect.apply(reboot, provider, [session, signal]);
    assertNotAborted(signal);
    releaseIfHeld(sessions, session);
    session = null;

    machine.transition("RECONNECTING");
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
    const verification = await Reflect.apply(verifyFirmware, provider, [
      session,
      artifact,
      signal,
    ]);
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
    const observations: VerificationObservation[] = [
      { fact: "DEVICE_RECONNECTED", observedValue: true },
      {
        fact: "DEVICE_IDENTITY_MATCHES",
        observedValue: reconnectedDescriptor.id,
      },
    ];
    if (typeof observedTargetId === "string") {
      observations.push({
        fact: "TARGET_MATCHES",
        observedValue: observedTargetId,
      });
    }
    if (typeof observedFirmwareVersion === "string") {
      observations.push({
        fact: "FIRMWARE_VERSION_MATCHES",
        observedValue: observedFirmwareVersion,
      });
    }
    const planEvaluation = evaluateVerificationPlan({
      plan: verificationPlan,
      observations,
    });
    const verificationPassed =
      verificationValid === true &&
      verificationReason === "EXPECTED_FIRMWARE_OBSERVED" &&
      planEvaluation.status === "PASSED";
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
        providerAssurance,
        updateMethod,
        deviceId: reconnectedDescriptor.id,
        targetId: expectedTargetId,
        firmwareVersion: artifact.firmwareVersion,
        artifactSha256: artifact.sha256,
        artifactProvenance: artifact.provenance,
        artifactProvenanceValidation: artifactSnapshot.provenanceValidation,
        artifactByteVerification: verifiedBytes.verification,
        artifactManifestTrust: currentArtifactManifestTrustStatus,
        verificationPlan,
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
