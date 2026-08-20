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
});
