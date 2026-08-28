import { describe, expect, it } from "vitest";

import {
  createSoftwareReadinessReport,
  softwareReadinessGateIds,
} from "./software-readiness.js";

describe("createSoftwareReadinessReport", () => {
  it("reports missing software work explicitly", () => {
    const report = createSoftwareReadinessReport({
      gates: [{ id: "FOUNDATION", state: "PASS" }],
    });

    expect(report.status).toBe("SOFTWARE_GAPS_REMAIN");
    expect(report.missingSoftwareGates).not.toContain("FOUNDATION");
    expect(report.missingSoftwareGates).toContain("WEB_PREVIEW");
  });

  it("allows external blocks without pretending they passed", () => {
    const report = createSoftwareReadinessReport({
      gates: softwareReadinessGateIds.map((id) => ({
        id,
        state: id === "WEB_PREVIEW" ? ("BLOCKED" as const) : ("PASS" as const),
      })),
    });

    expect(report.status).toBe("READY_FOR_HARDWARE_VALIDATION");
    expect(report.externallyBlockedGates).toEqual(["WEB_PREVIEW"]);
    expect(report.gateStates.WEB_PREVIEW).toBe("BLOCKED");
  });

  it("requires every software gate to be accounted for", () => {
    const report = createSoftwareReadinessReport({
      gates: softwareReadinessGateIds
        .filter((id) => id !== "PERFORMANCE_HARNESS")
        .map((id) => ({ id, state: "PASS" as const })),
    });

    expect(report.status).toBe("SOFTWARE_GAPS_REMAIN");
    expect(report.missingSoftwareGates).toEqual(["PERFORMANCE_HARNESS"]);
  });

  it("never enables Hardware, writes, or performance claims", () => {
    const report = createSoftwareReadinessReport({
      gates: softwareReadinessGateIds.map((id) => ({
        id,
        state: "PASS" as const,
      })),
    });

    expect(report.status).toBe("READY_FOR_HARDWARE_VALIDATION");
    expect(report.hardwareValidation).toBe("NONE");
    expect(report.realWritesEnabled).toBe(false);
    expect(report.performanceClaimsAllowed).toBe(false);
  });

  it("fails closed on duplicate gate declarations", () => {
    const report = createSoftwareReadinessReport({
      gates: [
        { id: "FOUNDATION", state: "PASS" },
        { id: "FOUNDATION", state: "PASS" },
      ],
    });

    expect(report.status).toBe("INVALID_INPUT");
    expect(report.missingSoftwareGates).toEqual([...softwareReadinessGateIds]);
  });

  it("returns immutable state and gate lists", () => {
    const report = createSoftwareReadinessReport({ gates: [] });

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.gateStates)).toBe(true);
    expect(Object.isFrozen(report.missingSoftwareGates)).toBe(true);
    expect(Object.isFrozen(report.externallyBlockedGates)).toBe(true);
  });

  it("fails closed without executing accessor-backed gate values", () => {
    let executed = false;
    const gate = Object.defineProperty({}, "id", {
      get() {
        executed = true;
        return "FOUNDATION";
      },
    });
    Object.defineProperty(gate, "state", { value: "PASS" });

    const report = createSoftwareReadinessReport({ gates: [gate] });

    expect(executed).toBe(false);
    expect(report.status).toBe("INVALID_INPUT");
    expect(report.realWritesEnabled).toBe(false);
    expect(report.performanceClaimsAllowed).toBe(false);
  });

  it("bounds the number of caller-supplied gate declarations", () => {
    const report = createSoftwareReadinessReport({
      gates: Array.from(
        { length: softwareReadinessGateIds.length + 1 },
        () => ({
          id: "FOUNDATION" as const,
          state: "PASS" as const,
        }),
      ),
    });

    expect(report.status).toBe("INVALID_INPUT");
    expect(report.missingSoftwareGates).toEqual([...softwareReadinessGateIds]);
  });
});
