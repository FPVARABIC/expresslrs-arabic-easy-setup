// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createAuditEvent,
  isSensitiveAuditField,
  scrubAuditDetails,
} from "./audit.js";

describe("audit privacy", () => {
  for (const field of [
    "bindingPhrase",
    "binding_phrase",
    "binding-identity",
    "uid",
    "deviceUID",
    "wifiPassword",
    "wifi_passphrase",
    "wifiPsk",
    "accessToken",
    "refresh-token",
    "serial",
    "serialNumber",
    "hardware_serial_identifier",
    "macAddress",
  ] as const) {
    it(`classifies ${field} as sensitive`, () => {
      expect(isSensitiveAuditField(field)).toBe(true);
    });
  }

  it("does not classify safe operational names by substring accident", () => {
    expect(isSensitiveAuditField("fluidPressure")).toBe(false);
    expect(isSensitiveAuditField("serialProvider")).toBe(false);
    expect(isSensitiveAuditField("targetId")).toBe(false);
  });

  it("copies only allowlisted primitives and excludes unknown payloads", () => {
    const scrubbed = scrubAuditDetails({
      targetId: "fixture.rx.alpha",
      wifiPassword: "do-not-log",
      binding_phrase: "also-secret",
      errorCode: "TARGET_UNKNOWN",
      deviceUID: "private-uid",
      rawResponse: { secret: "nested" },
      arbitraryAdapterField: "not reviewed",
    });

    expect(scrubbed.details).toEqual({
      errorCode: "TARGET_UNKNOWN",
      targetId: "fixture.rx.alpha",
    });
    expect(scrubbed.redactedFields).toEqual([
      "binding_phrase",
      "deviceUID",
      "wifiPassword",
    ]);
    expect(scrubbed.excludedFields).toEqual([
      "arbitraryAdapterField",
      "rawResponse",
    ]);
    expect(JSON.stringify(scrubbed)).not.toContain("do-not-log");
    expect(JSON.stringify(scrubbed)).not.toContain("also-secret");
    expect(JSON.stringify(scrubbed)).not.toContain("private-uid");
    expect(JSON.stringify(scrubbed)).not.toContain("nested");
  });

  it("rejects unsafe values even when an adapter uses an allowlisted key", () => {
    const scrubbed = scrubAuditDetails({
      deviceId: "stable-hardware-serial",
      providerId: "https://user:secret@example.test/provider",
      targetId: "bindingPhrase=do-not-export",
      artifactSha256: "not-a-real-digest",
      bytesWritten: -1,
      totalBytes: 12.5,
      coreVersion: "1.0.0",
    });

    expect(scrubbed.details).toEqual({ coreVersion: "1.0.0" });
    expect(scrubbed.redactedFields).toEqual([
      "artifactSha256",
      "bytesWritten",
      "providerId",
      "targetId",
      "totalBytes",
    ]);
    expect(scrubbed.excludedFields).toEqual(["deviceId"]);
    expect(JSON.stringify(scrubbed)).not.toContain("secret@example");
    expect(JSON.stringify(scrubbed)).not.toContain("do-not-export");
  });

  it("creates a complete immutable event from scrubbed details", () => {
    const event = createAuditEvent({
      id: "event-1",
      operationId: "operation-1",
      sequence: 3,
      occurredAt: "2026-08-20T08:00:00.000Z",
      operationType: "FIRMWARE_UPDATE",
      stage: "VERIFYING",
      eventCode: "DEVICE_IDENTIFIED",
      outcome: "PROGRESSED",
      severity: "INFO",
      providerId: "mock-wifi",
      details: { targetId: "fixture.rx.alpha", accessToken: "secret-token" },
    });

    expect(event.schemaVersion).toBe("1");
    expect(event.sequence).toBe(3);
    expect(event.safeDetails.targetId).toBe("fixture.rx.alpha");
    expect(event.safeDetails).not.toHaveProperty("accessToken");
    expect(event.redactedFields).toEqual(["accessToken"]);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.safeDetails)).toBe(true);
    expect(Object.isFrozen(event.redactedFields)).toBe(true);
  });

  it("rejects an invalid event sequence", () => {
    expect(() =>
      createAuditEvent({
        id: "event-1",
        operationId: "operation-1",
        sequence: -1,
        occurredAt: "2026-08-20T08:00:00.000Z",
        operationType: "DISCOVERY",
        stage: "PREPARING",
        eventCode: "OPERATION_STARTED",
        outcome: "STARTED",
        severity: "INFO",
      }),
    ).toThrow(TypeError);
  });

  it("rejects unsafe top-level metadata before it can reach an export", () => {
    expect(() =>
      createAuditEvent({
        id: "event-1",
        operationId: "https://user:secret@example.test",
        sequence: 0,
        occurredAt: "2026-08-20T08:00:00.000Z",
        operationType: "DISCOVERY",
        stage: "PREPARING",
        eventCode: "OPERATION_STARTED",
        outcome: "STARTED",
        severity: "INFO",
      }),
    ).toThrow(TypeError);
  });

  it("rejects non-canonical timestamps and unknown runtime enums", () => {
    const baseEvent = {
      id: "event-1",
      operationId: "operation-1",
      sequence: 0,
      occurredAt: "2026-08-20T08:00:00.000Z",
      operationType: "DISCOVERY",
      stage: "PREPARING",
      eventCode: "OPERATION_STARTED",
      outcome: "STARTED",
      severity: "INFO",
    } as const;

    expect(() =>
      createAuditEvent({
        ...baseEvent,
        occurredAt: "August 20, 2026 08:00 UTC",
      }),
    ).toThrow(TypeError);
    expect(() =>
      createAuditEvent({ ...baseEvent, outcome: "LEAKED" as never }),
    ).toThrow(TypeError);
    expect(() =>
      createAuditEvent({ ...baseEvent, severity: "TRACE" as never }),
    ).toThrow(TypeError);
  });
});
