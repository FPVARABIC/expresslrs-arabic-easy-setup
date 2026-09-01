import type { FirmwareArtifactDescriptor } from "@elrs-easy/compatibility";
import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import type { CancellationSignal, DeviceSession } from "@elrs-easy/domain";
import { runFirmwareUpdate } from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import { syntheticTargetCatalog } from "./fixtures.js";
import { ManualWorkflowClock } from "./manual-clock.js";
import {
  ScriptedFirmwareUpdateProvider,
  type UpdateMockStage,
} from "./mock-sensitive-operation-providers.js";
import {
  compatibleFirmwareArtifact,
  majorVersionMismatchArtifact,
  sensitiveOperationFixtures,
} from "./sensitive-operation-fixtures.js";

function sessions() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ids: { next: () => `update-session-${++id}` },
  });
}

class ArtifactRecordingFirmwareProvider extends ScriptedFirmwareUpdateProvider {
  public writtenArtifact: FirmwareArtifactDescriptor | null = null;

  public override async writeFirmware(
    session: DeviceSession,
    artifact: FirmwareArtifactDescriptor,
    signal?: CancellationSignal,
  ) {
    this.writtenArtifact = Object.freeze({ ...artifact });
    return super.writeFirmware(session, artifact, signal);
  }
}

function run(
  provider: ScriptedFirmwareUpdateProvider,
  input?: {
    readonly operationId?: string;
    readonly artifact?: typeof compatibleFirmwareArtifact;
    readonly userConfirmed?: boolean;
    readonly signal?: CancellationSignal;
    readonly sessionManager?: ReturnType<typeof sessions>;
  },
) {
  return runFirmwareUpdate({
    operationId: input?.operationId ?? "update-1",
    descriptor: sensitiveOperationFixtures.initial.descriptor,
    artifact: input?.artifact ?? compatibleFirmwareArtifact,
    provider,
    sessions: input?.sessionManager ?? sessions(),
    catalog: syntheticTargetCatalog,
    userConfirmed: input?.userConfirmed ?? true,
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ...(input?.signal === undefined ? {} : { signal: input.signal }),
  });
}

describe("Firmware Update with a synthetic provider", () => {
  it("keeps provider completion at WRITE_COMPLETED until post-reboot verification", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider);

    expect(operation.state).toBe("SUCCESS");
    expect(operation.verificationPassed).toBe(true);
    expect(operation.result?.firmwareVersion).toBe("4.2.0");
    expect(operation.history).toEqual([
      "IDLE",
      "PREPARING",
      "IDENTIFYING",
      "WAITING_FOR_CONFIRMATION",
      "EXECUTING",
      "WRITE_COMPLETED",
      "REBOOTING",
      "RECONNECTING",
      "VERIFYING",
      "SUCCESS",
    ]);
  });

  it("blocks an unsupported major version before any write", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider, {
      artifact: majorVersionMismatchArtifact,
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("VERSION_INCOMPATIBLE");
    expect(provider.calls.some((call) => call.stage === "WRITE_FIRMWARE")).toBe(
      false,
    );
  });

  it("blocks malformed Firmware SemVer before prepare or write", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider, {
      artifact: {
        ...compatibleFirmwareArtifact,
        firmwareVersion: "4.garbage",
      },
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.state).not.toBe("SUCCESS");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.error?.code).toBe("VERSION_INCOMPATIBLE");
    expect(provider.calls.map((call) => call.stage)).toEqual([
      "VALIDATE_ARTIFACT",
      "READ_IDENTITY_INITIAL",
      "READ_CAPABILITIES_INITIAL",
    ]);
  });

  it("blocks a malformed artifact and permission denial before writing", async () => {
    const invalidProvider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
      artifactValid: false,
    });
    const deniedProvider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
      fault: { stage: "PREPARE_UPDATE", code: "PERMISSION_DENIED" },
    });

    const invalid = await run(invalidProvider, {
      operationId: "update-invalid",
    });
    const denied = await run(deniedProvider, {
      operationId: "update-denied",
    });

    expect(invalid.error?.code).toBe("ARTIFACT_INVALID");
    expect(denied.error?.code).toBe("PERMISSION_DENIED");
    expect(denied.state).toBe("FAILED");
  });

  it("requires the provider's runtime update capability before writing", async () => {
    const fixtureWithoutUpdateCapability = {
      ...sensitiveOperationFixtures.initial,
      capabilities: sensitiveOperationFixtures.initial.capabilities.filter(
        (capability) => capability.id !== "mock-wifi-update",
      ),
    };
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: fixtureWithoutUpdateCapability,
    });
    const operation = await run(provider);

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("PROVIDER_UNSUPPORTED");
    expect(operation.error?.reason).toBe("UPDATE_CAPABILITY_NOT_AVAILABLE");
    expect(provider.calls.some((call) => call.stage === "WRITE_FIRMWARE")).toBe(
      false,
    );
  });

  it("accepts only literal true from runtime artifact validation", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
      artifactValid: "truthy-provider-value" as never,
    });
    const operation = await run(provider);

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("ARTIFACT_INVALID");
    expect(provider.calls.some((call) => call.stage === "WRITE_FIRMWARE")).toBe(
      false,
    );
  });

  it("rejects a non-string runtime firmware version before any provider call", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider, {
      operationId: "update-non-string-version",
      artifact: {
        ...compatibleFirmwareArtifact,
        firmwareVersion: { toString: () => "4.2.0" },
      } as never,
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.error?.code).toBe("ARTIFACT_INVALID");
    expect(operation.error?.reason).toBe(
      "FIRMWARE_ARTIFACT_DESCRIPTOR_INVALID",
    );
    expect(provider.calls).toEqual([]);
    expect(operation.history).not.toContain("EXECUTING");
    expect(operation.history).not.toContain("SUCCESS");
  });

  for (const stage of [
    "VALIDATE_ARTIFACT",
    "READ_IDENTITY_INITIAL",
    "READ_CAPABILITIES_INITIAL",
    "PREPARE_UPDATE",
    "WRITE_FIRMWARE",
    "REBOOT",
    "RECONNECT_UPDATE",
    "READ_IDENTITY_RECONNECTED",
    "READ_CAPABILITIES_RECONNECTED",
    "VERIFY_FIRMWARE",
  ] satisfies readonly UpdateMockStage[]) {
    it(`never reports success when connection is lost at ${stage}`, async () => {
      const operation = await run(
        new ScriptedFirmwareUpdateProvider({
          initial: sensitiveOperationFixtures.initial,
          fault: { stage },
        }),
        { operationId: `update-disconnect-${stage}` },
      );

      expect(operation.state).not.toBe("SUCCESS");
      expect(operation.verificationPassed).toBe(false);
      if (stage === "WRITE_FIRMWARE") {
        expect(operation.state).toBe("UNKNOWN_STATE");
      } else if (
        [
          "REBOOT",
          "RECONNECT_UPDATE",
          "READ_IDENTITY_RECONNECTED",
          "READ_CAPABILITIES_RECONNECTED",
          "VERIFY_FIRMWARE",
        ].includes(stage)
      ) {
        expect(operation.state).toBe("RECOVERY_REQUIRED");
      } else {
        expect(operation.state).toBe("FAILED");
      }
    });
  }

  it("requires recovery when the written device never returns", async () => {
    const operation = await run(
      new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
        reconnects: false,
      }),
    );

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.error?.code).toBe("RECOVERY_REQUIRED");
  });

  it("requires recovery when a different target returns", async () => {
    const operation = await run(
      new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
        reconnected: sensitiveOperationFixtures.wrongTargetAfterReboot,
      }),
    );

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.error?.code).toBe("TARGET_MISMATCH");
  });

  it("rejects a different descriptor even when its target evidence matches", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
      reconnected: sensitiveOperationFixtures.sameTargetDifferentDevice,
    });
    const operation = await run(provider);

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.error?.code).toBe("VERIFICATION_FAILED");
    expect(operation.error?.reason).toBe(
      "POST_WRITE_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
    );
    expect(
      provider.calls.some((call) => call.stage === "READ_IDENTITY_RECONNECTED"),
    ).toBe(false);
  });

  it("keeps the initial descriptor identity when caller input mutates during reconnect", async () => {
    const initialDeviceId = sensitiveOperationFixtures.initial.descriptor.id;
    const mutableDescriptor = {
      ...sensitiveOperationFixtures.initial.descriptor,
    };
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
      reconnected: sensitiveOperationFixtures.sameTargetDifferentDevice,
    });

    const operation = await runFirmwareUpdate({
      operationId: "update-mutated-descriptor",
      descriptor: mutableDescriptor,
      artifact: compatibleFirmwareArtifact,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      userConfirmed: true,
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      observer: (snapshot) => {
        if (snapshot.state === "RECONNECTING") {
          mutableDescriptor.id =
            sensitiveOperationFixtures.sameTargetDifferentDevice.descriptor.id;
        }
      },
    });

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.error?.reason).toBe(
      "POST_WRITE_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
    );
    expect(
      provider.calls.find((call) => call.stage === "RECONNECT_UPDATE")
        ?.deviceId,
    ).toBe(initialDeviceId);
  });

  it("writes the validated artifact snapshot despite adversarial caller mutation", async () => {
    const originalArtifact = { ...compatibleFirmwareArtifact };
    const mutableArtifact = { ...compatibleFirmwareArtifact };
    const provider = new ArtifactRecordingFirmwareProvider({
      initial: sensitiveOperationFixtures.initial,
    });

    const operation = await runFirmwareUpdate({
      operationId: "update-mutated-artifact",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: mutableArtifact,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      userConfirmed: true,
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      observer: (snapshot) => {
        if (snapshot.state === "WAITING_FOR_CONFIRMATION") {
          mutableArtifact.targetId = "fixture.rx.beta-subghz";
          mutableArtifact.firmwareVersion = "9.9.9";
          mutableArtifact.sha256 = "a".repeat(64);
        }
        if (snapshot.state === "WRITE_COMPLETED") {
          Object.assign(mutableArtifact, originalArtifact);
        }
      },
    });

    expect(operation.state).toBe("SUCCESS");
    expect(operation.verificationPassed).toBe(true);
    expect(provider.writtenArtifact).toEqual(originalArtifact);
    expect(operation.result?.targetId).toBe(originalArtifact.targetId);
    expect(operation.result?.firmwareVersion).toBe(
      originalArtifact.firmwareVersion,
    );
    expect(operation.result?.artifactSha256).toBe(originalArtifact.sha256);
  });

  it("requires recovery when cancellation is requested after the write", async () => {
    const signal = { aborted: false };
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await runFirmwareUpdate({
      operationId: "update-cancelled-after-write",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      userConfirmed: true,
      signal,
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      observer: (snapshot) => {
        if (snapshot.state === "WRITE_COMPLETED") {
          signal.aborted = true;
        }
      },
    });

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.history).toContain("WRITE_COMPLETED");
    expect(operation.history).not.toContain("SUCCESS");
    expect(provider.calls.some((call) => call.stage === "REBOOT")).toBe(false);
  });

  it("requires recovery when the expected firmware version is not observed", async () => {
    const operation = await run(
      new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
        verification: {
          valid: false,
          observedTargetId: compatibleFirmwareArtifact.targetId,
          observedFirmwareVersion: "4.1.0",
          reason: "VERSION_MISMATCH",
        },
      }),
    );

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.error?.code).toBe("VERIFICATION_FAILED");
  });

  it("rejects a contradictory provider verification at runtime", async () => {
    const operation = await run(
      new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
        verification: {
          valid: true,
          observedTargetId: compatibleFirmwareArtifact.targetId,
          observedFirmwareVersion: compatibleFirmwareArtifact.firmwareVersion,
          reason: "ARTIFACT_NOT_VERIFIED",
        } as never,
      }),
    );

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.error?.reason).toBe("ARTIFACT_NOT_VERIFIED");
  });

  it("keeps the outcome unknown when write completion is not confirmed", async () => {
    const operation = await run(
      new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
        writeReceipt: { writeCompleted: false } as never,
      }),
    );

    expect(operation.state).toBe("UNKNOWN_STATE");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.history).not.toContain("WRITE_COMPLETED");
    expect(operation.error?.reason).toBe(
      "FIRMWARE_WRITE_COMPLETION_NOT_CONFIRMED",
    );
  });

  it("does not write when the user has not confirmed the operation", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider, { userConfirmed: false });

    expect(operation.state).toBe("CANCELLED");
    expect(provider.calls.some((call) => call.stage === "WRITE_FIRMWARE")).toBe(
      false,
    );
  });

  it("cancels explicitly when aborted before validation or write", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider, { signal: { aborted: true } });

    expect(operation.state).toBe("CANCELLED");
    expect(operation.error).toBeNull();
    expect(provider.calls).toEqual([]);
    expect(provider.calls.some((call) => call.stage === "WRITE_FIRMWARE")).toBe(
      false,
    );
  });

  it("re-identifies from the beginning on a retry attempt", async () => {
    const first = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
      fault: { stage: "PREPARE_UPDATE" },
    });
    const retry = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });

    expect((await run(first, { operationId: "update-attempt-1" })).state).toBe(
      "FAILED",
    );
    expect((await run(retry, { operationId: "update-attempt-2" })).state).toBe(
      "SUCCESS",
    );
    expect(retry.calls[1]?.stage).toBe("READ_IDENTITY_INITIAL");
    expect(retry.calls[2]?.stage).toBe("READ_CAPABILITIES_INITIAL");
  });

  it("starts from initial identification when a provider instance is reused", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const sessionManager = sessions();

    const first = await run(provider, {
      operationId: "update-provider-reuse-1",
      sessionManager,
    });
    const second = await run(provider, {
      operationId: "update-provider-reuse-2",
      sessionManager,
    });

    expect(first.state).toBe("SUCCESS");
    expect(second.state).toBe("SUCCESS");
    expect(
      provider.calls.filter((call) => call.stage === "READ_IDENTITY_INITIAL"),
    ).toHaveLength(2);
    expect(
      provider.calls.filter(
        (call) => call.stage === "READ_IDENTITY_RECONNECTED",
      ),
    ).toHaveLength(2);
  });

  it("provides controllable time for deterministic timeout and retry fixtures", () => {
    const clock = new ManualWorkflowClock("2026-08-20T08:00:00.000Z");
    expect(clock.now()).toBe("2026-08-20T08:00:00.000Z");
    clock.advance(5_000);
    expect(clock.now()).toBe("2026-08-20T08:00:05.000Z");
  });

  it("releases the session after an uncertain terminal outcome", async () => {
    const sessionManager = sessions();
    const operation = await run(
      new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
        fault: { stage: "WRITE_FIRMWARE" },
      }),
      { operationId: "update-session-cleanup", sessionManager },
    );

    expect(operation.state).toBe("UNKNOWN_STATE");
    expect(
      sessionManager.current(sensitiveOperationFixtures.initial.descriptor.id),
    ).toBeNull();
  });
});
