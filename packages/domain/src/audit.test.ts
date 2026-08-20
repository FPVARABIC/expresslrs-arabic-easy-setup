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
    expect(scrubbed.redactedFieldCount).toBe(3);
    expect(scrubbed.excludedFieldCount).toBe(0);
    expect(scrubbed.redactionCategories).toEqual(["SENSITIVE_FIELD"]);
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
    expect(scrubbed.redactedFieldCount).toBe(5);
    expect(scrubbed.excludedFieldCount).toBe(0);
    expect(scrubbed.redactionCategories).toEqual(["UNSAFE_VALUE"]);
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
    expect(event.redactedFieldCount).toBe(1);
    expect(event.excludedFieldCount).toBe(0);
    expect(event.redactionCategories).toEqual(["SENSITIVE_FIELD"]);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.safeDetails)).toBe(true);
    expect(Object.isFrozen(event.redactionCategories)).toBe(true);
  });

  it("never echoes malicious field names through support metadata", () => {
    const secretField = "wifiPassword_TOPSECRET-BINDING-PHRASE";
    const unknownField = "unknown_LEAKME123";
    const scrubbed = scrubAuditDetails({
      [secretField]: "x",
      [unknownField]: "y",
    });
    const serialized = JSON.stringify(scrubbed);

    expect(scrubbed).toMatchObject({
      details: {},
      redactedFieldCount: 0,
      excludedFieldCount: 0,
    });
    expect(scrubbed.redactionCategories).toEqual([]);
    expect(serialized).not.toContain(secretField);
    expect(serialized).not.toContain(unknownField);
    expect(serialized).not.toContain("TOPSECRET");
    expect(serialized).not.toContain("LEAKME123");
  });

  it("pulls only fixed descriptors under unknown-key floods", () => {
    let descriptorReads = 0;
    let getterReads = 0;
    const flooded = Object.fromEntries(
      Array.from({ length: 5_000 }, (_, index) => [
        `unknown_${index}`,
        "value",
      ]),
    );
    Object.defineProperty(flooded, "targetId", {
      enumerable: true,
      value: "fixture.rx.alpha",
    });
    Object.defineProperty(flooded, "providerId", {
      enumerable: true,
      get() {
        getterReads += 1;
        return "must-not-run";
      },
    });
    const bounded = scrubAuditDetails(
      new Proxy(flooded, {
        ownKeys() {
          throw new Error("unbounded enumeration must not run");
        },
        getOwnPropertyDescriptor(target, property) {
          descriptorReads += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      }),
    );

    expect(bounded.details).toEqual({ targetId: "fixture.rx.alpha" });
    expect(bounded.excludedFieldCount).toBe(1);
    expect(bounded.redactionCategories).toEqual(["UNREVIEWED_FIELD"]);
    expect(descriptorReads).toBeGreaterThan(0);
    expect(descriptorReads).toBeLessThanOrEqual(64);
    expect(getterReads).toBe(0);
  });

  it("fails closed within a fixed descriptor budget on unreadable input", () => {
    const unreadable = scrubAuditDetails(
      new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            throw new Error("password=not-exported");
          },
        },
      ),
    );

    expect(unreadable.details).toEqual({});
    expect(unreadable.redactedFieldCount).toBe(0);
    expect(unreadable.excludedFieldCount).toBeGreaterThan(0);
    expect(unreadable.excludedFieldCount).toBeLessThanOrEqual(64);
    expect(unreadable.redactionCategories).toEqual(["INPUT_UNREADABLE"]);
    expect(JSON.stringify(unreadable)).not.toContain("not-exported");
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
