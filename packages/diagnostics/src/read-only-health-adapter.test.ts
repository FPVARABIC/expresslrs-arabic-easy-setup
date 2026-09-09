import { describe, expect, it } from "vitest";

import { createReadOnlyHealthAssessmentFromDiagnosticReport } from "./read-only-health-adapter.js";
import { createReadOnlyDiagnosticReport } from "./read-only-report.js";

function createSuccessfulReport(
  reconnectState: "NOT_ATTEMPTED" | "CONSISTENT" = "CONSISTENT",
) {
  return createReadOnlyDiagnosticReport({
    outcome: "SUCCESS",
    confidence: "CONFIRMED",
    errorCode: null,
    retryable: false,
    verificationPassed: true,
    attempts: reconnectState === "CONSISTENT" ? 2 : 1,
    baselineAvailable: reconnectState === "CONSISTENT",
    reconnectState,
    factCategories: ["TARGET", "FIRMWARE_VERSION", "DEVICE_ROLE"],
    stageCategories: [
      "PREPARING",
      "DISCOVERING",
      "IDENTIFYING",
      "VERIFYING",
      "SUCCESS",
    ],
  });
}

const healthySupplemental = Object.freeze({
  compatibility: "SUPPORTED_BY_CATALOG" as const,
  binding: "LINK_ESTABLISHED_VERIFIED" as const,
  firmware: "CURRENT_APPROVED" as const,
});

describe("read-only diagnostic to health adapter", () => {
  it("composes a verified read and reviewed supplemental evidence without enabling writes", () => {
    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      createSuccessfulReport(),
      healthySupplemental,
    );

    expect(assessment.overall).toBe("READ_ONLY_HEALTHY");
    expect(assessment.writeDisposition).toBe("BLOCKED_NO_HARDWARE_AUTHORITY");
    expect(assessment.checks.map((item) => item.status)).toEqual([
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
    ]);
  });

  it("does not infer a stable connection when no reconnect comparison exists", () => {
    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      createSuccessfulReport("NOT_ATTEMPTED"),
      healthySupplemental,
    );

    expect(assessment.overall).toBe("NEEDS_REVIEW");
    expect(assessment.checks[5]).toEqual({
      id: "CONNECTION_STABILITY",
      status: "UNKNOWN",
    });
  });

  it("maps a failed read to unavailable configuration and reconnect attention", () => {
    const report = createReadOnlyDiagnosticReport({
      outcome: "FAILED",
      confidence: "UNKNOWN",
      errorCode: "CONNECTION_LOST",
      retryable: true,
      verificationPassed: false,
      attempts: 2,
      baselineAvailable: true,
      reconnectState: "REQUIRED",
      factCategories: [],
      stageCategories: ["PREPARING", "DISCOVERING", "FAILED"],
    });

    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      report,
      healthySupplemental,
    );

    expect(assessment.overall).toBe("BLOCKED");
    expect(assessment.checks[4]).toEqual({
      id: "CONFIGURATION_READ",
      status: "ATTENTION",
    });
    expect(assessment.checks[5]).toEqual({
      id: "CONNECTION_STABILITY",
      status: "ATTENTION",
    });
  });

  it("keeps cancellation distinct from a failed read capability", () => {
    const report = createReadOnlyDiagnosticReport({
      outcome: "CANCELLED",
      confidence: "UNKNOWN",
      errorCode: null,
      retryable: false,
      verificationPassed: false,
      attempts: 1,
      baselineAvailable: false,
      reconnectState: "NOT_ATTEMPTED",
      factCategories: [],
      stageCategories: ["PREPARING", "CANCELLED"],
    });

    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      report,
      healthySupplemental,
    );

    expect(assessment.checks[4]).toEqual({
      id: "CONFIGURATION_READ",
      status: "UNKNOWN",
    });
  });

  it("rejects a forged report envelope and falls back to unknown evidence", () => {
    const forged = {
      ...createSuccessfulReport(),
      reportType: "REAL_DEVICE_HEALTH",
    };

    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      forged,
      healthySupplemental,
    );

    expect(assessment.overall).toBe("BLOCKED");
    expect(assessment.checks[0]).toEqual({
      id: "DEVICE_IDENTITY",
      status: "BLOCKED",
    });
    expect(assessment.checks[4]).toEqual({
      id: "CONFIGURATION_READ",
      status: "UNKNOWN",
    });
    expect(assessment.checks[5]).toEqual({
      id: "CONNECTION_STABILITY",
      status: "UNKNOWN",
    });
  });

  it("does not execute accessor-backed report or supplemental fields", () => {
    const report = Object.create(null) as Record<string, unknown>;
    const supplemental = Object.create(null) as Record<string, unknown>;
    let getterCalls = 0;

    for (const key of [
      "schemaVersion",
      "reportType",
      "validationLevel",
      "hardwareValidation",
      "operation",
      "evidenceSummary",
    ]) {
      Object.defineProperty(report, key, {
        get() {
          getterCalls += 1;
          throw new Error("password=do-not-copy");
        },
      });
    }

    for (const key of ["compatibility", "binding", "firmware"]) {
      Object.defineProperty(supplemental, key, {
        get() {
          getterCalls += 1;
          throw new Error("uid=do-not-copy");
        },
      });
    }

    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      report,
      supplemental,
    );
    const serialized = JSON.stringify(assessment);

    expect(getterCalls).toBe(0);
    expect(assessment.overall).toBe("BLOCKED");
    expect(serialized).not.toContain("do-not-copy");
  });

  it("fails hostile supplemental enum values closed", () => {
    const secret = "secret-real-writer";
    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      createSuccessfulReport(),
      {
        compatibility: secret,
        binding: secret,
        firmware: secret,
      },
    );
    const serialized = JSON.stringify(assessment);

    expect(assessment.overall).toBe("NEEDS_REVIEW");
    expect(assessment.checks.slice(1, 4).map((item) => item.status)).toEqual([
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
    ]);
    expect(serialized).not.toContain(secret);
  });

  it("ignores raw and secret-like properties added to otherwise valid inputs", () => {
    const report = {
      ...createSuccessfulReport(),
      uid: "private-uid",
      password: "private-password",
      rawResponse: "private-response",
    };
    const supplemental = {
      ...healthySupplemental,
      target: "private-target",
    };

    const assessment = createReadOnlyHealthAssessmentFromDiagnosticReport(
      report,
      supplemental,
    );
    const serialized = JSON.stringify(assessment);

    expect(assessment.overall).toBe("READ_ONLY_HEALTHY");
    expect(serialized).not.toContain("private-uid");
    expect(serialized).not.toContain("private-password");
    expect(serialized).not.toContain("private-response");
    expect(serialized).not.toContain("private-target");
  });
});
