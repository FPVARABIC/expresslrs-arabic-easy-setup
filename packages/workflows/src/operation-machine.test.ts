import { CoreOperationError } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { VerifiedOperationMachine } from "./operation-machine.js";

function machine() {
  return new VerifiedOperationMachine<{ version: string }>({
    id: "operation-1",
    type: "FIRMWARE_UPDATE",
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
  });
}

describe("VerifiedOperationMachine", () => {
  it("records provider completion as WRITE_COMPLETED, never SUCCESS", () => {
    const operation = machine();
    operation.transition("PREPARING");
    operation.transition("EXECUTING");
    const completed = operation.transition("WRITE_COMPLETED", {
      messageCode: "PROVIDER_WRITE_COMPLETED",
      bytesWritten: 1024,
      totalBytes: 1024,
    });

    expect(completed.state).toBe("WRITE_COMPLETED");
    expect(completed.verificationPassed).toBe(false);
  });

  it("prohibits WRITE_COMPLETED to SUCCESS", () => {
    const operation = machine();
    operation.transition("PREPARING");
    operation.transition("EXECUTING");
    operation.transition("WRITE_COMPLETED");

    expect(() => operation.verificationSucceeded({ version: "4.1.0" })).toThrow(
      CoreOperationError,
    );
  });

  it("reaches SUCCESS only through a passed verification", () => {
    const operation = machine();
    operation.transition("PREPARING");
    operation.transition("EXECUTING");
    operation.transition("WRITE_COMPLETED");
    operation.transition("REBOOTING");
    operation.transition("RECONNECTING");
    operation.transition("VERIFYING");
    const result = operation.verificationSucceeded({ version: "4.1.0" });

    expect(result.state).toBe("SUCCESS");
    expect(result.verificationPassed).toBe(true);
    expect(result.history).toEqual([
      "IDLE",
      "PREPARING",
      "EXECUTING",
      "WRITE_COMPLETED",
      "REBOOTING",
      "RECONNECTING",
      "VERIFYING",
      "SUCCESS",
    ]);
  });

  it("does not invent percentage progress without provider byte counts", () => {
    const operation = machine();
    const preparing = operation.transition("PREPARING");

    expect(preparing.progress).not.toHaveProperty("percentage");
    expect(preparing.progress).not.toHaveProperty("bytesWritten");
  });

  it("requires a structured error for unknown and recovery terminal states", () => {
    const operation = machine();
    operation.transition("PREPARING");
    operation.transition("EXECUTING");
    operation.transition("WRITE_COMPLETED");
    const result = operation.endUncertain("RECOVERY_REQUIRED", {
      code: "RECOVERY_REQUIRED",
      reason: "DEVICE_DID_NOT_RECONNECT",
      details: { stage: "RECONNECTING" },
      retryable: true,
    });

    expect(result.state).toBe("RECOVERY_REQUIRED");
    expect(result.error?.reason).toBe("DEVICE_DID_NOT_RECONNECT");
    expect(result.verificationPassed).toBe(false);
  });

  it("blocks raw transitions into uncertain terminal states", () => {
    for (const state of ["UNKNOWN_STATE", "RECOVERY_REQUIRED"] as const) {
      const operation = machine();
      operation.transition("PREPARING");
      operation.transition("EXECUTING");

      expect(() => operation.transition(state as never)).toThrow(
        CoreOperationError,
      );
      expect(operation.snapshot().state).toBe("EXECUTING");
      expect(operation.snapshot().error).toBeNull();
    }
  });

  for (const progress of [
    { bytesWritten: -1, totalBytes: 10 },
    { bytesWritten: 1.5, totalBytes: 10 },
    { bytesWritten: 11, totalBytes: 10 },
    { bytesWritten: 1, totalBytes: -1 },
    { bytesWritten: 1, totalBytes: Number.MAX_SAFE_INTEGER + 1 },
    { bytesWritten: 1 },
    { totalBytes: 1 },
  ]) {
    it(`rejects invalid byte progress ${JSON.stringify(progress)}`, () => {
      const operation = machine();
      operation.transition("PREPARING");
      operation.transition("EXECUTING");

      expect(() =>
        operation.transition("WRITE_COMPLETED", {
          messageCode: "INVALID_PROGRESS",
          ...progress,
        }),
      ).toThrow(CoreOperationError);
      expect(operation.snapshot().state).toBe("EXECUTING");
      expect(operation.snapshot().progress).not.toHaveProperty("bytesWritten");
    });
  }

  it("keeps every terminal state immutable", () => {
    const operation = machine();
    operation.transition("PREPARING");
    operation.fail({
      code: "CONNECTION_LOST",
      reason: "SYNTHETIC_FAILURE",
      details: {},
      retryable: true,
    });

    expect(() => operation.transition("PREPARING")).toThrow(CoreOperationError);
    expect(() => operation.verificationSucceeded({ version: "4.1.0" })).toThrow(
      CoreOperationError,
    );
  });

  it("rejects representative illegal forward and backward transitions", () => {
    const idle = machine();
    expect(() => idle.transition("EXECUTING")).toThrow(CoreOperationError);

    const verifying = machine();
    verifying.transition("PREPARING");
    verifying.transition("EXECUTING");
    verifying.transition("VERIFYING");
    expect(() => verifying.transition("PREPARING")).toThrow(CoreOperationError);
  });

  it("emits ordered, structured audit evidence for every state", () => {
    const operation = machine();
    operation.transition("PREPARING");
    operation.transition("EXECUTING");
    operation.transition("VERIFYING");
    const result = operation.verificationSucceeded({ version: "4.1.0" });

    expect(result.auditEvents.map((event) => event.sequence)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(result.auditEvents.map((event) => event.stage)).toEqual([
      "IDLE",
      "PREPARING",
      "EXECUTING",
      "VERIFYING",
      "SUCCESS",
    ]);
    expect(result.auditEvents.at(-1)?.outcome).toBe("SUCCEEDED");
  });

  it("publishes every snapshot and isolates observer failures", () => {
    const observedStates: string[] = [];
    const operation = new VerifiedOperationMachine<{ version: string }>({
      id: "observed-operation",
      type: "FIRMWARE_UPDATE",
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      observer: (snapshot) => {
        observedStates.push(snapshot.state);
        if (snapshot.state === "PREPARING") {
          throw new Error("synthetic observer failure");
        }
      },
    });

    operation.transition("PREPARING");
    operation.transition("EXECUTING");
    operation.transition("VERIFYING");
    const result = operation.verificationSucceeded({ version: "4.1.0" });

    expect(result.state).toBe("SUCCESS");
    expect(observedStates).toEqual([
      "IDLE",
      "PREPARING",
      "EXECUTING",
      "VERIFYING",
      "SUCCESS",
    ]);
  });

  it("isolates rejected async observers without changing the outcome", async () => {
    const observedStates: string[] = [];
    const operation = new VerifiedOperationMachine<{ version: string }>({
      id: "async-observer-operation",
      type: "FIRMWARE_UPDATE",
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      observer: async (snapshot) => {
        observedStates.push(snapshot.state);
        if (snapshot.state === "PREPARING") {
          throw new Error("synthetic async observer rejection");
        }
      },
    });

    operation.transition("PREPARING");
    operation.transition("EXECUTING");
    operation.transition("VERIFYING");
    const result = operation.verificationSucceeded({ version: "4.1.0" });
    await Promise.resolve();

    expect(result.state).toBe("SUCCESS");
    expect(result.verificationPassed).toBe(true);
    expect(observedStates).toEqual([
      "IDLE",
      "PREPARING",
      "EXECUTING",
      "VERIFYING",
      "SUCCESS",
    ]);
  });
});
