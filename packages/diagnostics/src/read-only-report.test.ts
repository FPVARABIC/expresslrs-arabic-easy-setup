import { describe, expect, it } from "vitest";

import {
  createReadOnlyDiagnosticReport,
  readOnlyFactCategories,
  readOnlyStageCategories,
} from "./read-only-report.js";

describe("privacy-safe read-only diagnostic reports", () => {
  it("summarizes a successful unvalidated read without raw values", () => {
    const report = createReadOnlyDiagnosticReport({
      outcome: "SUCCESS",
      confidence: "UNKNOWN",
      errorCode: null,
      retryable: false,
      verificationPassed: true,
      attempts: 2,
      baselineAvailable: true,
      reconnectState: "CONSISTENT",
      factCategories: ["TARGET", "FIRMWARE_VERSION", "DEVICE_ROLE", "TARGET"],
      stageCategories: [
        "PREPARING",
        "DISCOVERING",
        "IDENTIFYING",
        "VERIFYING",
        "SUCCESS",
      ],
    });

    expect(report.operation).toEqual({
      outcome: "SUCCESS",
      confidence: "UNKNOWN",
      errorCode: null,
      retryable: false,
      verificationPassed: true,
      attempts: 2,
      reconnectState: "CONSISTENT",
    });
    expect(report.evidenceSummary.factCategories).toEqual([
      "TARGET",
      "FIRMWARE_VERSION",
      "DEVICE_ROLE",
    ]);
    expect(report.findings.map((item) => item.id)).toEqual([
      "READ_SUCCEEDED",
      "IDENTITY_NOT_CONFIRMED",
      "RECONNECT_CONSISTENT",
      "HARDWARE_VALIDATION_PENDING",
    ]);
    expect(JSON.stringify(report)).not.toContain("target-value");
    expect(report.privacy).toEqual({
      rawValuesIncluded: false,
      rawFieldNamesIncluded: false,
      deviceIdentifiersIncluded: false,
      credentialsIncluded: false,
      persistedByApplication: false,
    });
  });

  it.each([
    ["CONNECTION_LOST", true, ["READ_FAILED", "RETRY_AVAILABLE"]],
    ["PROVIDER_UNSUPPORTED", false, ["READ_FAILED", "RESPONSE_REJECTED"]],
    ["INTERNAL_ERROR", false, ["READ_FAILED"]],
  ] as const)(
    "creates deterministic failure findings for %s",
    (errorCode, retryable, expected) => {
      const report = createReadOnlyDiagnosticReport({
        outcome: "FAILED",
        confidence: "UNKNOWN",
        errorCode,
        retryable,
        verificationPassed: false,
        attempts: retryable ? 2 : 1,
        baselineAvailable: retryable,
        reconnectState: retryable ? "REQUIRED" : "NOT_ATTEMPTED",
        factCategories: [],
        stageCategories: ["PREPARING", "DISCOVERING", "FAILED"],
      });

      expect(report.findings.map((item) => item.id)).toEqual([
        ...expected,
        ...(retryable ? ["RECONNECT_REQUIRED" as const] : []),
        "HARDWARE_VALIDATION_PENDING",
      ]);
    },
  );

  it("records cancellation without turning it into a device failure", () => {
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

    expect(report.operation.outcome).toBe("CANCELLED");
    expect(report.findings.map((item) => item.id)).toEqual([
      "READ_CANCELLED",
      "HARDWARE_VALIDATION_PENDING",
    ]);
  });

  it("drops unknown and malicious names instead of echoing an exclusion list", () => {
    const secret = "wifiPassword<script>alert(1)</script>";
    const report = createReadOnlyDiagnosticReport({
      outcome: "SUCCESS",
      confidence: "UNKNOWN",
      errorCode: null,
      retryable: false,
      verificationPassed: true,
      attempts: 1,
      baselineAvailable: false,
      reconnectState: "NOT_ATTEMPTED",
      factCategories: [
        secret,
        "TARGET",
        "uid",
        "SSID",
        "FIRMWARE_VERSION",
        "DEVICE_ROLE",
      ],
      stageCategories: ["PREPARING", secret, "SUCCESS"],
    });
    const serialized = JSON.stringify(report);

    expect(report.evidenceSummary.factCategories).toEqual([
      "TARGET",
      "FIRMWARE_VERSION",
      "DEVICE_ROLE",
    ]);
    expect(report.evidenceSummary.stageCategories).toEqual([
      "PREPARING",
      "SUCCESS",
    ]);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("uid");
    expect(serialized).not.toContain("SSID");
  });

  it("fails closed when hostile getters throw", () => {
    const input = Object.create(null) as Record<string, unknown>;
    let getterCalls = 0;
    Object.defineProperty(input, "outcome", {
      get() {
        getterCalls += 1;
        throw new Error("password=do-not-copy");
      },
    });
    Object.defineProperty(input, "factCategories", {
      get() {
        getterCalls += 1;
        throw new Error("uid=do-not-copy");
      },
    });

    const report = createReadOnlyDiagnosticReport(input);
    const serialized = JSON.stringify(report);

    expect(report.operation.outcome).toBe("FAILED");
    expect(report.operation.errorCode).toBe("INTERNAL_ERROR");
    expect(report.evidenceSummary.factCategories).toEqual([]);
    expect(serialized).not.toContain("do-not-copy");
    expect(getterCalls).toBe(0);
  });

  it("caps attempts and list traversal at reviewed bounds", () => {
    const categories: string[] = Array.from({ length: 100 }, (_, index) =>
      index === 63 ? "TARGET" : "NOT_ALLOWED",
    );
    categories.push("FIRMWARE_VERSION");
    const report = createReadOnlyDiagnosticReport({
      outcome: "SUCCESS",
      confidence: "UNKNOWN",
      errorCode: null,
      retryable: false,
      verificationPassed: true,
      attempts: Number.MAX_SAFE_INTEGER,
      baselineAvailable: false,
      reconnectState: "NOT_ATTEMPTED",
      factCategories: categories,
      stageCategories: [],
    });

    expect(report.operation.attempts).toBe(1);
    expect(report.evidenceSummary.factCategories).toEqual(["TARGET"]);
  });

  it("keeps exported category registries frozen and exhaustive", () => {
    expect(Object.isFrozen(readOnlyFactCategories)).toBe(true);
    expect(Object.isFrozen(readOnlyStageCategories)).toBe(true);
    expect(readOnlyFactCategories).toHaveLength(10);
    expect(readOnlyStageCategories).toHaveLength(7);
  });

  it.each([
    {
      label: "success without verification",
      verificationPassed: false,
      stageCategories: ["PREPARING", "SUCCESS"],
      factCategories: ["TARGET", "FIRMWARE_VERSION", "DEVICE_ROLE"],
    },
    {
      label: "success without a terminal stage",
      verificationPassed: true,
      stageCategories: ["PREPARING", "VERIFYING"],
      factCategories: ["TARGET", "FIRMWARE_VERSION", "DEVICE_ROLE"],
    },
    {
      label: "success without the identity envelope",
      verificationPassed: true,
      stageCategories: ["PREPARING", "SUCCESS"],
      factCategories: ["TARGET", "FIRMWARE_VERSION"],
    },
  ])("fails closed for $label", (candidate) => {
    const report = createReadOnlyDiagnosticReport({
      outcome: "SUCCESS",
      confidence: "CONFIRMED",
      errorCode: null,
      retryable: false,
      verificationPassed: candidate.verificationPassed,
      attempts: 1,
      baselineAvailable: false,
      reconnectState: "CONSISTENT",
      factCategories: candidate.factCategories,
      stageCategories: candidate.stageCategories,
    });

    expect(report.operation).toMatchObject({
      outcome: "FAILED",
      errorCode: "INTERNAL_ERROR",
      retryable: false,
      verificationPassed: false,
      reconnectState: "NOT_ATTEMPTED",
    });
    expect(report.findings.map((item) => item.id)).toEqual([
      "READ_FAILED",
      "HARDWARE_VALIDATION_PENDING",
    ]);
  });

  it("rejects impossible reconnect claims", () => {
    const report = createReadOnlyDiagnosticReport({
      outcome: "CANCELLED",
      confidence: "UNKNOWN",
      errorCode: null,
      retryable: false,
      verificationPassed: false,
      attempts: 99,
      baselineAvailable: true,
      reconnectState: "CONSISTENT",
      factCategories: [],
      stageCategories: ["CANCELLED"],
    });

    expect(report.operation.reconnectState).toBe("NOT_ATTEMPTED");
    expect(report.findings.map((item) => item.id)).not.toContain(
      "RECONNECT_CONSISTENT",
    );
  });

  it.each([
    {
      label: "success plus failed",
      outcome: "SUCCESS",
      stages: ["SUCCESS", "FAILED"],
    },
    {
      label: "cancelled plus success",
      outcome: "CANCELLED",
      stages: ["SUCCESS", "CANCELLED"],
    },
    {
      label: "failure without failed",
      outcome: "FAILED",
      stages: ["PREPARING", "SUCCESS"],
    },
  ] as const)("normalizes contradictory terminals: $label", (candidate) => {
    const report = createReadOnlyDiagnosticReport({
      outcome: candidate.outcome,
      confidence: "UNKNOWN",
      errorCode: "CONNECTION_LOST",
      retryable: true,
      verificationPassed: true,
      attempts: 2,
      baselineAvailable: true,
      reconnectState: "REQUIRED",
      factCategories: ["TARGET", "FIRMWARE_VERSION", "DEVICE_ROLE"],
      stageCategories: candidate.stages,
    });

    expect(report.operation).toMatchObject({
      outcome: "FAILED",
      errorCode: "INTERNAL_ERROR",
      retryable: false,
      reconnectState: "NOT_ATTEMPTED",
    });
    expect(
      report.evidenceSummary.stageCategories.filter((stage) =>
        ["SUCCESS", "FAILED", "CANCELLED"].includes(stage),
      ),
    ).toEqual(["FAILED"]);
  });

  it("requires a prior successful attempt before reconnect can be required", () => {
    const report = createReadOnlyDiagnosticReport({
      outcome: "FAILED",
      confidence: "UNKNOWN",
      errorCode: "CONNECTION_LOST",
      retryable: true,
      verificationPassed: false,
      attempts: 0,
      baselineAvailable: true,
      reconnectState: "REQUIRED",
      factCategories: [],
      stageCategories: ["PREPARING", "FAILED"],
    });

    expect(report.operation.attempts).toBe(1);
    expect(report.operation.reconnectState).toBe("NOT_ATTEMPTED");
  });
});
