import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import type { CancellationSignal } from "@elrs-easy/domain";
import { runEasyBinding } from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import { syntheticTargetCatalog } from "./fixtures.js";
import {
  ScriptedBindingProvider,
  type BindingMockStage,
} from "./mock-sensitive-operation-providers.js";
import { sensitiveOperationFixtures } from "./sensitive-operation-fixtures.js";

function sessions() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ids: { next: () => `binding-session-${++id}` },
  });
}

function run(
  provider: ScriptedBindingProvider,
  operationId = "binding-1",
  signal?: CancellationSignal,
  sessionManager = sessions(),
) {
  return runEasyBinding({
    operationId,
    descriptor: sensitiveOperationFixtures.initial.descriptor,
    provider,
    sessions: sessionManager,
    catalog: syntheticTargetCatalog,
    userConfirmed: true,
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ...(signal === undefined ? {} : { signal }),
  });
}

describe("Easy Binding with a synthetic provider", () => {
  it("reports success only after the same target returns and a link is verified", async () => {
    const provider = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider);

    expect(operation.state).toBe("SUCCESS");
    expect(operation.verificationPassed).toBe(true);
    expect(operation.result?.verification).toBe("LINK_ESTABLISHED");
    expect(operation.history).toEqual([
      "IDLE",
      "PREPARING",
      "IDENTIFYING",
      "WAITING_FOR_CONFIRMATION",
      "EXECUTING",
      "RECONNECTING",
      "VERIFYING",
      "SUCCESS",
    ]);
    expect(provider.calls.map((call) => call.stage)).toEqual([
      "READ_IDENTITY_INITIAL",
      "READ_CAPABILITIES_INITIAL",
      "PREPARE_BINDING",
      "EXECUTE_BINDING",
      "RECONNECT_BINDING",
      "READ_IDENTITY_RECONNECTED",
      "READ_CAPABILITIES_RECONNECTED",
      "VERIFY_BINDING",
    ]);
  });

  for (const stage of [
    "READ_IDENTITY_INITIAL",
    "READ_CAPABILITIES_INITIAL",
    "PREPARE_BINDING",
    "EXECUTE_BINDING",
    "RECONNECT_BINDING",
    "READ_IDENTITY_RECONNECTED",
    "READ_CAPABILITIES_RECONNECTED",
    "VERIFY_BINDING",
  ] satisfies readonly BindingMockStage[]) {
    it(`never reports success when the device disconnects at ${stage}`, async () => {
      const operation = await run(
        new ScriptedBindingProvider({
          initial: sensitiveOperationFixtures.initial,
          fault: { stage },
        }),
        `binding-disconnect-${stage}`,
      );

      expect(operation.state).not.toBe("SUCCESS");
      expect(operation.verificationPassed).toBe(false);
      expect(operation.error?.code).toBe("CONNECTION_LOST");
      if (stage === "EXECUTE_BINDING") {
        expect(operation.state).toBe("UNKNOWN_STATE");
      } else if (
        [
          "RECONNECT_BINDING",
          "READ_IDENTITY_RECONNECTED",
          "READ_CAPABILITIES_RECONNECTED",
          "VERIFY_BINDING",
        ].includes(stage)
      ) {
        expect(operation.state).toBe("RECOVERY_REQUIRED");
      } else {
        expect(operation.state).toBe("FAILED");
      }
    });
  }

  it("fails cleanly when permission is denied before the command", async () => {
    const operation = await run(
      new ScriptedBindingProvider({
        initial: sensitiveOperationFixtures.initial,
        fault: { stage: "PREPARE_BINDING", code: "PERMISSION_DENIED" },
      }),
    );

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("PERMISSION_DENIED");
  });

  it("cancels explicitly before executing when the signal is already aborted", async () => {
    const provider = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await run(provider, "binding-cancelled", {
      aborted: true,
    });

    expect(operation.state).toBe("CANCELLED");
    expect(operation.error).toBeNull();
    expect(provider.calls).toEqual([]);
  });

  for (const [label, reason] of [
    ["LINK_NOT_ESTABLISHED", "LINK_NOT_ESTABLISHED"],
    ["MODEL_MISMATCH", "MODEL_MISMATCH"],
  ] as const) {
    it(`rejects a completed bind command when verification reports ${label}`, async () => {
      const operation = await run(
        new ScriptedBindingProvider({
          initial: sensitiveOperationFixtures.initial,
          verification: { linked: false, reason },
        }),
      );

      expect(operation.state).toBe("FAILED");
      expect(operation.error?.code).toBe("VERIFICATION_FAILED");
      expect(operation.error?.reason).toBe(reason);
      expect(operation.history).toContain("VERIFYING");
    });
  }

  it("keeps the outcome unknown when a different target reconnects", async () => {
    const operation = await run(
      new ScriptedBindingProvider({
        initial: sensitiveOperationFixtures.initial,
        reconnected: sensitiveOperationFixtures.wrongTargetAfterReboot,
      }),
    );

    expect(operation.state).toBe("UNKNOWN_STATE");
    expect(operation.error?.code).toBe("TARGET_MISMATCH");
    expect(operation.verificationPassed).toBe(false);
  });

  it("rejects a different descriptor even when its target evidence matches", async () => {
    const provider = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
      reconnected: sensitiveOperationFixtures.sameTargetDifferentDevice,
    });
    const operation = await run(provider);

    expect(operation.state).toBe("UNKNOWN_STATE");
    expect(operation.error?.code).toBe("VERIFICATION_FAILED");
    expect(operation.error?.reason).toBe(
      "RECONNECTED_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
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
    const provider = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
      reconnected: sensitiveOperationFixtures.sameTargetDifferentDevice,
    });

    const operation = await runEasyBinding({
      operationId: "binding-mutated-descriptor",
      descriptor: mutableDescriptor,
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

    expect(operation.state).toBe("UNKNOWN_STATE");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.error?.reason).toBe(
      "RECONNECTED_DEVICE_DESCRIPTOR_DID_NOT_MATCH",
    );
    expect(
      provider.calls.find((call) => call.stage === "RECONNECT_BINDING")
        ?.deviceId,
    ).toBe(initialDeviceId);
  });

  it("does not let an observer change denied user intent", async () => {
    let mutableIntent = false;
    const provider = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await runEasyBinding({
      operationId: "binding-intent-snapshot",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      get userConfirmed() {
        return mutableIntent;
      },
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      observer: () => {
        mutableIntent = true;
      },
    });

    expect(mutableIntent).toBe(true);
    expect(operation.state).toBe("CANCELLED");
    expect(
      provider.calls.some((call) => call.stage === "EXECUTE_BINDING"),
    ).toBe(false);
  });

  it("requires recovery when cancellation is requested at verification", async () => {
    const signal = { aborted: false };
    const provider = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const operation = await runEasyBinding({
      operationId: "binding-cancelled-at-verification",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      userConfirmed: true,
      signal,
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      observer: (snapshot) => {
        if (snapshot.state === "VERIFYING") {
          signal.aborted = true;
        }
      },
    });

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.history).not.toContain("SUCCESS");
    expect(provider.calls.some((call) => call.stage === "VERIFY_BINDING")).toBe(
      false,
    );
  });

  it("does not assume success when the device never reconnects", async () => {
    const operation = await run(
      new ScriptedBindingProvider({
        initial: sensitiveOperationFixtures.initial,
        reconnects: false,
      }),
    );

    expect(operation.state).toBe("RECOVERY_REQUIRED");
    expect(operation.error?.code).toBe("RECOVERY_REQUIRED");
  });

  it("rejects a contradictory provider verification at runtime", async () => {
    const operation = await run(
      new ScriptedBindingProvider({
        initial: sensitiveOperationFixtures.initial,
        verification: {
          linked: true,
          reason: "MODEL_MISMATCH",
        } as never,
      }),
    );

    expect(operation.state).toBe("FAILED");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.error?.reason).toBe("MODEL_MISMATCH");
  });

  it("keeps command outcome unknown when completion is not confirmed", async () => {
    const operation = await run(
      new ScriptedBindingProvider({
        initial: sensitiveOperationFixtures.initial,
        executionReceipt: { commandCompleted: false } as never,
      }),
    );

    expect(operation.state).toBe("UNKNOWN_STATE");
    expect(operation.verificationPassed).toBe(false);
    expect(operation.history).not.toContain("RECONNECTING");
  });

  it("re-identifies from the beginning on a retry attempt", async () => {
    const first = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
      fault: { stage: "EXECUTE_BINDING" },
    });
    const retry = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
    });

    expect((await run(first, "binding-attempt-1")).state).toBe("UNKNOWN_STATE");
    expect((await run(retry, "binding-attempt-2")).state).toBe("SUCCESS");
    expect(retry.calls[0]?.stage).toBe("READ_IDENTITY_INITIAL");
    expect(retry.calls[1]?.stage).toBe("READ_CAPABILITIES_INITIAL");
  });

  it("starts from initial identification when a provider instance is reused", async () => {
    const provider = new ScriptedBindingProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const sessionManager = sessions();

    const first = await run(
      provider,
      "binding-provider-reuse-1",
      undefined,
      sessionManager,
    );
    const second = await run(
      provider,
      "binding-provider-reuse-2",
      undefined,
      sessionManager,
    );

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

  it("releases the session after an uncertain terminal outcome", async () => {
    const sessionManager = sessions();
    const operation = await run(
      new ScriptedBindingProvider({
        initial: sensitiveOperationFixtures.initial,
        fault: { stage: "EXECUTE_BINDING" },
      }),
      "binding-session-cleanup",
      undefined,
      sessionManager,
    );

    expect(operation.state).toBe("UNKNOWN_STATE");
    expect(() =>
      sessionManager.acquire({
        deviceId: sensitiveOperationFixtures.initial.descriptor.id,
        owner: { id: "binding-cleanup-check", kind: "SYSTEM" },
      }),
    ).not.toThrow();
  });
});
