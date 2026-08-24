import { describe, expect, it } from "vitest";
import { createReadOnlyHealthAssessment } from "@elrs-easy/diagnostics";

import {
  createReadOnlyHealthPresentation,
  readOnlyHealthPresentationCheckIds,
} from "./readOnlyHealthPresentation";

function healthyAssessment() {
  return createReadOnlyHealthAssessment({
    confidence: "CONFIRMED",
    compatibility: "SUPPORTED_BY_CATALOG",
    binding: "LINK_ESTABLISHED_VERIFIED",
    firmware: "CURRENT_APPROVED",
    configuration: "READ_ONLY_AVAILABLE",
    connection: "STABLE_OBSERVED",
  });
}

describe("read-only health presentation", () => {
  it("maps a healthy Core assessment to fixed Advanced-mode presentation keys", () => {
    const presentation = createReadOnlyHealthPresentation(healthyAssessment());

    expect(presentation.overall).toBe("READ_ONLY_HEALTHY");
    expect(presentation.tone).toBe("SAFE");
    expect(presentation.overallKey).toBe("status.systemReady");
    expect(presentation.writeBoundaryKey).toBe("task.previewOnly");
    expect(presentation.rows.map((row) => row.id)).toEqual(
      readOnlyHealthPresentationCheckIds,
    );
    expect(presentation.rows.every((row) => row.status === "PASS")).toBe(true);
  });

  it("keeps attention and blocked states distinct", () => {
    const attention = createReadOnlyHealthPresentation(
      createReadOnlyHealthAssessment({
        confidence: "CONFIRMED",
        compatibility: "SUPPORTED_BY_CATALOG",
        binding: "NOT_ESTABLISHED",
        firmware: "APPROVED_UPDATE_AVAILABLE",
        configuration: "READ_ONLY_AVAILABLE",
        connection: "RECONNECT_REQUIRED",
      }),
    );
    const blocked = createReadOnlyHealthPresentation(
      createReadOnlyHealthAssessment({
        confidence: "UNKNOWN",
        compatibility: "UNKNOWN",
        binding: "UNKNOWN",
        firmware: "UNKNOWN",
        configuration: "UNKNOWN",
        connection: "UNKNOWN",
      }),
    );

    expect(attention.overall).toBe("NEEDS_REVIEW");
    expect(attention.tone).toBe("ATTENTION");
    expect(attention.rows.some((row) => row.status === "ATTENTION")).toBe(true);
    expect(blocked.overall).toBe("BLOCKED");
    expect(blocked.tone).toBe("BLOCKED");
  });

  it("fails a forged envelope closed and never trusts a claimed healthy state", () => {
    const forged = {
      ...healthyAssessment(),
      writeDisposition: "REAL_WRITES_ALLOWED",
    };
    const presentation = createReadOnlyHealthPresentation(forged);

    expect(presentation.overall).toBe("BLOCKED");
    expect(presentation.tone).toBe("BLOCKED");
    expect(presentation.rows.every((row) => row.status === "UNKNOWN")).toBe(
      true,
    );
  });

  it("does not execute accessor-backed hostile input", () => {
    const hostile = Object.create(null) as Record<string, unknown>;
    let getterCalls = 0;

    for (const key of [
      "schemaVersion",
      "reportType",
      "validationLevel",
      "hardwareValidation",
      "writeDisposition",
      "overall",
      "checks",
    ]) {
      Object.defineProperty(hostile, key, {
        get() {
          getterCalls += 1;
          throw new Error("password=do-not-copy");
        },
      });
    }

    const presentation = createReadOnlyHealthPresentation(hostile);
    const serialized = JSON.stringify(presentation);

    expect(getterCalls).toBe(0);
    expect(presentation.overall).toBe("BLOCKED");
    expect(serialized).not.toContain("do-not-copy");
  });

  it("ignores findings and secret-like extra properties instead of reflecting them", () => {
    const input = {
      ...healthyAssessment(),
      findings: [
        {
          id: "ATTACKER_DEFINED",
          recommendationCode: "password=private-password",
        },
      ],
      uid: "private-uid",
      rawResponse: "private-response",
    };

    const presentation = createReadOnlyHealthPresentation(input);
    const serialized = JSON.stringify(presentation);

    expect(presentation.overall).toBe("READ_ONLY_HEALTHY");
    expect(serialized).not.toContain("private-password");
    expect(serialized).not.toContain("private-uid");
    expect(serialized).not.toContain("private-response");
    expect(serialized).not.toContain("ATTACKER_DEFINED");
  });

  it("returns immutable presentation collections", () => {
    const presentation = createReadOnlyHealthPresentation(healthyAssessment());

    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.rows)).toBe(true);
    expect(presentation.rows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(Object.isFrozen(readOnlyHealthPresentationCheckIds)).toBe(true);
  });
});
