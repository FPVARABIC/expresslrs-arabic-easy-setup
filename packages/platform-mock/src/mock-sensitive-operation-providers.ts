import type { FirmwareUpdateArtifact } from "@elrs-easy/compatibility";
import {
  CoreOperationError,
  type CancellationSignal,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityEvidence,
  type DeviceSession,
  type FirmwareUpdateMethod,
  type OperationErrorCode,
} from "@elrs-easy/domain";
import type {
  BindingExecutionReceipt,
  BindingProvider,
  BindingVerificationResult,
  FirmwareUpdateProvider,
  FirmwareVerificationResult,
  FirmwareWriteReceipt,
  VerifiedFirmwareUpdateArtifact,
} from "@elrs-easy/workflows";

import type { SyntheticDeviceFixture } from "./fixtures.js";

export type BindingMockStage =
  | "READ_IDENTITY_INITIAL"
  | "READ_CAPABILITIES_INITIAL"
  | "PREPARE_BINDING"
  | "EXECUTE_BINDING"
  | "RECONNECT_BINDING"
  | "READ_IDENTITY_RECONNECTED"
  | "READ_CAPABILITIES_RECONNECTED"
  | "VERIFY_BINDING";

export type UpdateMockStage =
  | "VALIDATE_ARTIFACT"
  | "READ_IDENTITY_INITIAL"
  | "READ_CAPABILITIES_INITIAL"
  | "PREPARE_UPDATE"
  | "WRITE_FIRMWARE"
  | "REBOOT"
  | "RECONNECT_UPDATE"
  | "READ_IDENTITY_RECONNECTED"
  | "READ_CAPABILITIES_RECONNECTED"
  | "VERIFY_FIRMWARE";

export interface MockFault<TStage extends string> {
  readonly stage: TStage;
  readonly code?: OperationErrorCode;
}

export interface MockProviderCall {
  readonly stage: BindingMockStage | UpdateMockStage;
  readonly deviceId: string | null;
}

function throwIfFault<TStage extends string>(
  fault: MockFault<TStage> | null,
  stage: TStage,
): void {
  if (fault?.stage !== stage) {
    return;
  }
  throw new CoreOperationError({
    code: fault.code ?? "CONNECTION_LOST",
    reason: `SYNTHETIC_FAILURE_${stage}`,
    details: { stage },
    retryable: fault.code !== "PERMISSION_DENIED",
  });
}

function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    const error = new Error("The synthetic operation was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

function fixtureForSession(
  session: DeviceSession,
  initial: SyntheticDeviceFixture,
  reconnected: SyntheticDeviceFixture,
  identityReadCount: number,
): SyntheticDeviceFixture {
  const fixture = identityReadCount === 0 ? initial : reconnected;
  if (session.deviceId !== fixture.descriptor.id) {
    throw new CoreOperationError({
      code: "DEVICE_NOT_FOUND",
      reason: "SYNTHETIC_SESSION_DEVICE_MISMATCH",
      details: { deviceId: session.deviceId },
      retryable: false,
    });
  }
  return fixture;
}

export class ScriptedBindingProvider implements BindingProvider {
  public readonly id = "mock-binding";
  public readonly assurance = "SYNTHETIC_ONLY" as const;
  readonly #initial: SyntheticDeviceFixture;
  readonly #reconnected: SyntheticDeviceFixture;
  readonly #reconnects: boolean;
  readonly #verification: BindingVerificationResult;
  readonly #executionReceipt: BindingExecutionReceipt;
  readonly #fault: MockFault<BindingMockStage> | null;
  readonly #calls: MockProviderCall[] = [];
  readonly #identityReadsByOwner = new Map<string, number>();
  readonly #capabilityReadsByOwner = new Map<string, number>();

  public constructor(input: {
    readonly initial: SyntheticDeviceFixture;
    readonly reconnected?: SyntheticDeviceFixture;
    readonly reconnects?: boolean;
    readonly executionReceipt?: BindingExecutionReceipt;
    readonly verification?: BindingVerificationResult;
    readonly fault?: MockFault<BindingMockStage>;
  }) {
    this.#initial = input.initial;
    this.#reconnected = input.reconnected ?? input.initial;
    this.#reconnects = input.reconnects ?? true;
    this.#executionReceipt = input.executionReceipt ?? {
      commandCompleted: true,
    };
    this.#verification = input.verification ?? {
      linked: true,
      reason: "LINK_ESTABLISHED",
    };
    this.#fault = input.fault ?? null;
  }

  public get calls(): readonly MockProviderCall[] {
    return Object.freeze([...this.#calls]);
  }

  public async readIdentity(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly DeviceIdentityEvidence[]> {
    assertNotAborted(signal);
    const identityReads = this.#identityReadsByOwner.get(session.owner.id) ?? 0;
    const stage: BindingMockStage =
      identityReads === 0
        ? "READ_IDENTITY_INITIAL"
        : "READ_IDENTITY_RECONNECTED";
    this.#calls.push({ stage, deviceId: session.deviceId });
    throwIfFault(this.#fault, stage);
    const fixture = fixtureForSession(
      session,
      this.#initial,
      this.#reconnected,
      identityReads,
    );
    this.#identityReadsByOwner.set(session.owner.id, identityReads + 1);
    return fixture.evidence;
  }

  public async readCapabilities(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly Capability[]> {
    assertNotAborted(signal);
    const capabilityReads =
      this.#capabilityReadsByOwner.get(session.owner.id) ?? 0;
    const stage: BindingMockStage =
      capabilityReads === 0
        ? "READ_CAPABILITIES_INITIAL"
        : "READ_CAPABILITIES_RECONNECTED";
    this.#calls.push({ stage, deviceId: session.deviceId });
    throwIfFault(this.#fault, stage);
    const fixture = capabilityReads === 0 ? this.#initial : this.#reconnected;
    this.#capabilityReadsByOwner.set(session.owner.id, capabilityReads + 1);
    return fixture.capabilities;
  }

  public async prepareBinding(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<void> {
    assertNotAborted(signal);
    this.#calls.push({ stage: "PREPARE_BINDING", deviceId: session.deviceId });
    throwIfFault(this.#fault, "PREPARE_BINDING");
  }

  public async executeBinding(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<BindingExecutionReceipt> {
    assertNotAborted(signal);
    this.#calls.push({ stage: "EXECUTE_BINDING", deviceId: session.deviceId });
    throwIfFault(this.#fault, "EXECUTE_BINDING");
    return this.#executionReceipt;
  }

  public async reconnect(
    expectedDeviceId: string,
    signal?: CancellationSignal,
  ): Promise<DeviceDescriptor | null> {
    assertNotAborted(signal);
    this.#calls.push({
      stage: "RECONNECT_BINDING",
      deviceId: expectedDeviceId,
    });
    throwIfFault(this.#fault, "RECONNECT_BINDING");
    return this.#reconnects ? this.#reconnected.descriptor : null;
  }

  public async verifyBinding(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<BindingVerificationResult> {
    assertNotAborted(signal);
    this.#calls.push({ stage: "VERIFY_BINDING", deviceId: session.deviceId });
    throwIfFault(this.#fault, "VERIFY_BINDING");
    return this.#verification;
  }
}

export class ScriptedFirmwareUpdateProvider implements FirmwareUpdateProvider {
  public readonly id: string;
  public readonly assurance = "SYNTHETIC_ONLY" as const;
  public readonly updateMethod: FirmwareUpdateMethod;
  public readonly updateCapabilityId: string;
  readonly #initial: SyntheticDeviceFixture;
  readonly #reconnected: SyntheticDeviceFixture;
  readonly #reconnects: boolean;
  readonly #artifactValid: boolean;
  readonly #verification: FirmwareVerificationResult | null;
  readonly #writeReceipt: FirmwareWriteReceipt;
  readonly #fault: MockFault<UpdateMockStage> | null;
  readonly #calls: MockProviderCall[] = [];
  readonly #identityReadsByOwner = new Map<string, number>();
  readonly #capabilityReadsByOwner = new Map<string, number>();

  public constructor(input: {
    readonly initial: SyntheticDeviceFixture;
    readonly providerId?: string;
    readonly updateMethod?: FirmwareUpdateMethod;
    readonly updateCapabilityId?: string;
    readonly reconnected?: SyntheticDeviceFixture;
    readonly reconnects?: boolean;
    readonly artifactValid?: boolean;
    readonly writeReceipt?: FirmwareWriteReceipt;
    readonly verification?: FirmwareVerificationResult;
    readonly fault?: MockFault<UpdateMockStage>;
  }) {
    this.id = input.providerId ?? "mock-wifi";
    this.updateMethod = input.updateMethod ?? "WIFI_OTA";
    this.updateCapabilityId = input.updateCapabilityId ?? `${this.id}-update`;
    this.#initial = input.initial;
    this.#reconnected = input.reconnected ?? input.initial;
    this.#reconnects = input.reconnects ?? true;
    this.#artifactValid = input.artifactValid ?? true;
    this.#writeReceipt = input.writeReceipt ?? {
      writeCompleted: true,
      bytesWritten: 4096,
      totalBytes: 4096,
    };
    this.#verification = input.verification ?? null;
    this.#fault = input.fault ?? null;
  }

  public get calls(): readonly MockProviderCall[] {
    return Object.freeze([...this.#calls]);
  }

  public async validateArtifact(
    artifact: VerifiedFirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<boolean> {
    assertNotAborted(signal);
    void artifact;
    this.#calls.push({ stage: "VALIDATE_ARTIFACT", deviceId: null });
    throwIfFault(this.#fault, "VALIDATE_ARTIFACT");
    return this.#artifactValid;
  }

  public async readIdentity(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly DeviceIdentityEvidence[]> {
    assertNotAborted(signal);
    const identityReads = this.#identityReadsByOwner.get(session.owner.id) ?? 0;
    const stage: UpdateMockStage =
      identityReads === 0
        ? "READ_IDENTITY_INITIAL"
        : "READ_IDENTITY_RECONNECTED";
    this.#calls.push({ stage, deviceId: session.deviceId });
    throwIfFault(this.#fault, stage);
    const fixture = fixtureForSession(
      session,
      this.#initial,
      this.#reconnected,
      identityReads,
    );
    this.#identityReadsByOwner.set(session.owner.id, identityReads + 1);
    return fixture.evidence;
  }

  public async readCapabilities(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly Capability[]> {
    assertNotAborted(signal);
    const capabilityReads =
      this.#capabilityReadsByOwner.get(session.owner.id) ?? 0;
    const stage: UpdateMockStage =
      capabilityReads === 0
        ? "READ_CAPABILITIES_INITIAL"
        : "READ_CAPABILITIES_RECONNECTED";
    this.#calls.push({ stage, deviceId: session.deviceId });
    throwIfFault(this.#fault, stage);
    const fixture = capabilityReads === 0 ? this.#initial : this.#reconnected;
    this.#capabilityReadsByOwner.set(session.owner.id, capabilityReads + 1);
    return fixture.capabilities;
  }

  public async prepareUpdate(
    session: DeviceSession,
    artifact: VerifiedFirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<void> {
    assertNotAborted(signal);
    void artifact;
    this.#calls.push({ stage: "PREPARE_UPDATE", deviceId: session.deviceId });
    throwIfFault(this.#fault, "PREPARE_UPDATE");
  }

  public async writeFirmware(
    session: DeviceSession,
    artifact: VerifiedFirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<FirmwareWriteReceipt> {
    assertNotAborted(signal);
    void artifact;
    this.#calls.push({ stage: "WRITE_FIRMWARE", deviceId: session.deviceId });
    throwIfFault(this.#fault, "WRITE_FIRMWARE");
    return this.#writeReceipt;
  }

  public async reboot(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<void> {
    assertNotAborted(signal);
    this.#calls.push({ stage: "REBOOT", deviceId: session.deviceId });
    throwIfFault(this.#fault, "REBOOT");
  }

  public async reconnect(
    expectedDeviceId: string,
    signal?: CancellationSignal,
  ): Promise<DeviceDescriptor | null> {
    assertNotAborted(signal);
    this.#calls.push({
      stage: "RECONNECT_UPDATE",
      deviceId: expectedDeviceId,
    });
    throwIfFault(this.#fault, "RECONNECT_UPDATE");
    return this.#reconnects ? this.#reconnected.descriptor : null;
  }

  public async verifyFirmware(
    session: DeviceSession,
    artifact: FirmwareUpdateArtifact,
    signal?: CancellationSignal,
  ): Promise<FirmwareVerificationResult> {
    assertNotAborted(signal);
    this.#calls.push({ stage: "VERIFY_FIRMWARE", deviceId: session.deviceId });
    throwIfFault(this.#fault, "VERIFY_FIRMWARE");
    return (
      this.#verification ?? {
        valid: true,
        observedTargetId: artifact.targetId,
        observedFirmwareVersion: artifact.firmwareVersion,
        reason: "EXPECTED_FIRMWARE_OBSERVED",
      }
    );
  }
}
