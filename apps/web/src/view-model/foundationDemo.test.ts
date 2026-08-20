import { describe, expect, it } from "vitest";

import {
  canRunSensitiveFoundationTask,
  runFoundationDemo,
} from "./foundationDemo";

describe("scenario-bound Foundation demo", () => {
  it("does not assume confirmation for a sensitive operation", async () => {
    const outcome = await runFoundationDemo("bind", "rx24", false);

    expect(outcome.state).toBe("CANCELLED");
    expect(outcome.verificationPassed).toBe(false);
    expect(outcome.targetId).toBeNull();
  });

  it.each(["setup", "diagnose"] as const)(
    "never attributes Discovery success to the deferred %s task",
    async (task) => {
      const outcome = await runFoundationDemo(task, "rx24", false);

      expect(outcome).toEqual({
        task,
        state: "NOT_IMPLEMENTED",
        verificationPassed: false,
        errorCode: "PROVIDER_UNSUPPORTED",
        auditEventCount: 0,
        targetId: null,
        updateMethod: null,
      });
    },
  );

  it("automatically selects the scenario Target's preferred update method", async () => {
    const tx = await runFoundationDemo("update", "rx24", true);
    const rx = await runFoundationDemo("update", "tx-sub-ghz", true);

    expect(tx).toMatchObject({
      state: "SUCCESS",
      verificationPassed: true,
      targetId: "fixture.tx.alpha-2g4",
      updateMethod: "WIFI_OTA",
    });
    expect(rx).toMatchObject({
      state: "SUCCESS",
      verificationPassed: true,
      targetId: "fixture.rx.beta-subghz",
      updateMethod: "UART",
    });
  });

  it.each([
    ["ambiguous", "IDENTITY_AMBIGUOUS"],
    ["disconnected", "IDENTITY_UNKNOWN"],
    ["reconnecting", "CONNECTION_LOST"],
  ] as const)(
    "fails closed before a sensitive provider for %s",
    async (scenarioId, errorCode) => {
      expect(canRunSensitiveFoundationTask("bind", scenarioId)).toBe(false);
      expect(canRunSensitiveFoundationTask("update", scenarioId)).toBe(false);

      const binding = await runFoundationDemo("bind", scenarioId, true);
      const update = await runFoundationDemo("update", scenarioId, true);

      expect(binding).toMatchObject({
        state: "FAILED",
        verificationPassed: false,
        errorCode,
        auditEventCount: 0,
        targetId: null,
      });
      expect(update).toMatchObject({
        state: "FAILED",
        verificationPassed: false,
        errorCode,
        auditEventCount: 0,
        targetId: null,
      });
    },
  );
});
