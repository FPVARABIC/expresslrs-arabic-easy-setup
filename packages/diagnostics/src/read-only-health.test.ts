import { describe, expect, it } from "vitest";

import {
  createReadOnlyHealthAssessment,
  readOnlyBindingStates,
  readOnlyCompatibilityStates,
  readOnlyConfigurationStates,
  readOnlyConnectionStates,
  readOnlyFirmwareStates,
  readOnlyHealthCheckIds,
  readOnlyHealthFindingIds,
} from "./read-only-health.js";

describe("read-only health assessment", () => {
  it("reports a fully healthy read-only evidence set without enabling writes", () => {
    const assessment = createReadOnlyHealthAssessment({
      confidence: "CONFIRMED",
      compatibility: "SUPPORTED_BY_CATALOG",
      binding: "LINK_ESTABLISHED_VERIFIED",
      firmware: "CURRENT_APPROVED",
      configuration: "READ_ONLY_AVAILABLE",
      connection: "STABLE_OBSERVED",
    });

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
    expect(assessment.findings.map((item) => item.id)).toEqual([
      "IDENTITY_CONFIRMED",
      "COMPATIBILITY_SUPPORTED",
      "BINDING_VERIFIED",
      "FIRMWARE_CURRENT",
      "CONFIGURATION_READABLE",
      "CONNECTION_STABLE",
      "SENSITIVE_ACTIONS_BLOCKED",
      "HARDWARE_VALIDATION_PENDING",
    ]);
    expect(
      assessment.findings.every((item) => item.automaticFixAvailable === false),
    ).toBe(true);
  });

  it("blocks the assessment when device identity is not confirmed", () => {
    const assessment = createReadOnlyHealthAssessment({
      confidence: "HIGH_CONFIDENCE",
      compatibility: "SUPPORTED_BY_CATALOG",
      binding: "LINK_ESTABLISHED_VERIFIED",
      firmware: "CURRENT_APPROVED",
      configuration: "READ_ONLY_AVAILABLE",
      connection: "STABLE_OBSERVED",
    });

    expect(assessment.overall).toBe("BLOCKED");
    expect(assessment.checks[0]).toEqual({
      id: "DEVICE_IDENTITY",
      status: "BLOCKED",
    });
    expect(assessment.findings[0]).toEqual({
      id: "IDENTITY_NOT_CONFIRMED",
      severity: "BLOCKING",
      recommendationCode: "KEEP_SENSITIVE_ACTIONS_BLOCKED",
      automaticFixAvailable: false,
    });
  });

  it("blocks unsupported compatibility independently of other healthy evidence", () => {
    const assessment = createReadOnlyHealthAssessment({
      confidence: "CONFIRMED",
      compatibility: "UNSUPPORTED",
      binding: "LINK_ESTABLISHED_VERIFIED",
      firmware: "CURRENT_APPROVED",
      configuration: "READ_ONLY_AVAILABLE",
      connection: "STABLE_OBSERVED",
    });

    expect(assessment.overall).toBe("BLOCKED");
    expect(assessment.checks[1]).toEqual({
      id: "COMPATIBILITY",
      status: "BLOCKED",
    });
    expect(assessment.findings[1]?.id).toBe("COMPATIBILITY_UNSUPPORTED");
  });

  it("uses review status for non-blocking operational attention", () => {
    const assessment = createReadOnlyHealthAssessment({
      confidence: "CONFIRMED",
      compatibility: "SUPPORTED_BY_CATALOG",
      binding: "NOT_ESTABLISHED",
      firmware: "APPROVED_UPDATE_AVAILABLE",
      configuration: "UNAVAILABLE",
      connection: "RECONNECT_REQUIRED",
    });

    expect(assessment.overall).toBe("NEEDS_REVIEW");
    expect(assessment.checks.map((item) => item.status)).toEqual([
      "PASS",
      "PASS",
      "ATTENTION",
      "ATTENTION",
      "ATTENTION",
      "ATTENTION",
    ]);
    expect(assessment.findings.map((item) => item.id)).toContain(
      "FIRMWARE_UPDATE_AVAILABLE",
    );
    expect(assessment.findings.map((item) => item.id)).toContain(
      "RECONNECT_REQUIRED",
    );
  });

  it("fails unknown enum values closed without echoing attacker-controlled data", () => {
    const secret = "password=never-copy-this";
    const assessment = createReadOnlyHealthAssessment({
      confidence: secret,
      compatibility: "REAL_WRITER_SUPPORTED",
      binding: secret,
      firmware: secret,
      configuration: secret,
      connection: secret,
    });
    const serialized = JSON.stringify(assessment);

    expect(assessment.overall).toBe("BLOCKED");
    expect(assessment.checks.map((item) => item.status)).toEqual([
      "BLOCKED",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
    ]);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("REAL_WRITER_SUPPORTED");
  });

  it("does not execute accessor-backed hostile input", () => {
    const input = Object.create(null) as Record<string, unknown>;
    let getterCalls = 0;

    for (const key of [
      "confidence",
      "compatibility",
      "binding",
      "firmware",
      "configuration",
      "connection",
    ]) {
      Object.defineProperty(input, key, {
        get() {
          getterCalls += 1;
          throw new Error("credential=do-not-copy");
        },
      });
    }

    const assessment = createReadOnlyHealthAssessment(input);
    const serialized = JSON.stringify(assessment);

    expect(getterCalls).toBe(0);
    expect(assessment.overall).toBe("BLOCKED");
    expect(serialized).not.toContain("do-not-copy");
    expect(serialized).not.toContain("credential");
  });

  it("keeps the output deeply immutable at every exposed collection boundary", () => {
    const assessment = createReadOnlyHealthAssessment({
      confidence: "CONFIRMED",
      compatibility: "SUPPORTED_BY_CATALOG",
      binding: "LINK_ESTABLISHED_VERIFIED",
      firmware: "CURRENT_APPROVED",
      configuration: "READ_ONLY_AVAILABLE",
      connection: "STABLE_OBSERVED",
    });

    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.checks)).toBe(true);
    expect(Object.isFrozen(assessment.findings)).toBe(true);
    expect(Object.isFrozen(assessment.privacy)).toBe(true);
    expect(assessment.checks.every((item) => Object.isFrozen(item))).toBe(true);
    expect(assessment.findings.every((item) => Object.isFrozen(item))).toBe(
      true,
    );
  });

  it("exports frozen reviewed registries with stable cardinality", () => {
    expect(Object.isFrozen(readOnlyCompatibilityStates)).toBe(true);
    expect(Object.isFrozen(readOnlyBindingStates)).toBe(true);
    expect(Object.isFrozen(readOnlyFirmwareStates)).toBe(true);
    expect(Object.isFrozen(readOnlyConfigurationStates)).toBe(true);
    expect(Object.isFrozen(readOnlyConnectionStates)).toBe(true);
    expect(Object.isFrozen(readOnlyHealthCheckIds)).toBe(true);
    expect(Object.isFrozen(readOnlyHealthFindingIds)).toBe(true);

    expect(readOnlyCompatibilityStates).toHaveLength(3);
    expect(readOnlyBindingStates).toHaveLength(3);
    expect(readOnlyFirmwareStates).toHaveLength(3);
    expect(readOnlyConfigurationStates).toHaveLength(3);
    expect(readOnlyConnectionStates).toHaveLength(3);
    expect(readOnlyHealthCheckIds).toHaveLength(6);
    expect(readOnlyHealthFindingIds).toHaveLength(19);
  });

  it("never includes raw values, identifiers, credentials, persistence, or hardware claims", () => {
    const assessment = createReadOnlyHealthAssessment({
      confidence: "UNKNOWN",
      compatibility: "UNKNOWN",
      binding: "UNKNOWN",
      firmware: "UNKNOWN",
      configuration: "UNKNOWN",
      connection: "UNKNOWN",
      target: "secret-target",
      uid: "secret-uid",
      password: "secret-password",
    });
    const serialized = JSON.stringify(assessment);

    expect(assessment.hardwareValidation).toBe("NONE");
    expect(assessment.privacy).toEqual({
      rawValuesIncluded: false,
      rawFieldNamesIncluded: false,
      deviceIdentifiersIncluded: false,
      credentialsIncluded: false,
      persistedByApplication: false,
    });
    expect(serialized).not.toContain("secret-target");
    expect(serialized).not.toContain("secret-uid");
    expect(serialized).not.toContain("secret-password");
  });
});
