import type { DeviceIdentityResolution } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { InMemoryTargetCatalog } from "./catalog.js";
import { evaluateFirmwareCompatibility } from "./engine.js";

const definition = {
  targetId: "fixture.rx.alpha",
  displayName: "Synthetic Alpha",
  identity: { "mcu-family": ["esp32"] },
  capabilities: ["read-config"],
  updateMethods: ["WIFI_OTA"],
  supportedFirmwareMajors: [4],
} as const;

const catalog = new InMemoryTargetCatalog(
  {
    source: "synthetic-test",
    revision: "fixture-1",
    schemaVersion: "1",
    contentDigest: "sha256:synthetic",
    redistributionApproved: true,
  },
  [definition],
);

function resolution(
  confidence: DeviceIdentityResolution["confidence"],
): DeviceIdentityResolution {
  return {
    confidence,
    selectedTargetId: confidence === "CONFIRMED" ? "fixture.rx.alpha" : null,
    candidates: [],
    evidence: [],
    conflicts: [],
    reasons: [],
  };
}

describe("evaluateFirmwareCompatibility", () => {
  it("fails closed when model identity is not confirmed", () => {
    const decision = evaluateFirmwareCompatibility({
      identity: resolution("HIGH_CONFIDENCE"),
      artifact: {
        targetId: "fixture.rx.alpha",
        firmwareVersion: "4.1.0",
        sha256: "abc",
      },
      updateMethod: "WIFI_OTA",
      catalog,
    });

    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons).toContain("IDENTITY_NOT_CONFIRMED");
  });

  it("blocks a wrong-target artifact even when its version is supported", () => {
    const decision = evaluateFirmwareCompatibility({
      identity: resolution("CONFIRMED"),
      artifact: {
        targetId: "fixture.rx.other",
        firmwareVersion: "4.1.0",
        sha256: "abc",
      },
      updateMethod: "WIFI_OTA",
      catalog,
    });

    expect(decision.status).toBe("BLOCKED");
    expect(decision.blockingErrorCode).toBe("TARGET_MISMATCH");
  });

  it("accepts only the confirmed target, supported major and provider", () => {
    const decision = evaluateFirmwareCompatibility({
      identity: resolution("CONFIRMED"),
      artifact: {
        targetId: "fixture.rx.alpha",
        firmwareVersion: "4.1.0",
        sha256: "abc",
      },
      updateMethod: "WIFI_OTA",
      catalog,
    });

    expect(decision.status).toBe("COMPATIBLE");
  });

  it("returns the exact fail-closed reason for ambiguous identity", () => {
    const decision = evaluateFirmwareCompatibility({
      identity: resolution("AMBIGUOUS"),
      artifact: {
        targetId: "fixture.rx.alpha",
        firmwareVersion: "4.1.0",
        sha256: "abc",
      },
      updateMethod: "WIFI_OTA",
      catalog,
    });

    expect(decision.blockingErrorCode).toBe("IDENTITY_AMBIGUOUS");
  });

  it.each([
    "4.0.0",
    "4.1.0",
    "4.1.0-rc.1",
    "4.1.0+fixture.5",
    "4.1.0-rc.1+fixture.5",
  ])("accepts a supported firmware major with valid SemVer: %s", (version) => {
    const decision = evaluateFirmwareCompatibility({
      identity: resolution("CONFIRMED"),
      artifact: {
        targetId: "fixture.rx.alpha",
        firmwareVersion: version,
        sha256: "abc",
      },
      updateMethod: "WIFI_OTA",
      catalog,
    });

    expect(decision.status).toBe("COMPATIBLE");
    expect(decision.blockingErrorCode).toBeNull();
  });

  it.each([
    "",
    "not-a-version",
    "4.",
    "4.garbage",
    "4...",
    "4.1",
    "v4.1.0",
    "04.1.0",
    "4.01.0",
    "4.1.00",
    "4.1.0trailing",
    "4.1.0 trailing",
    "4.1.0-",
    "4.1.0+",
    "4.1.0-01",
    "4.1.0-rc..1",
    "5.0.0",
  ])("blocks malformed or unsupported Firmware SemVer: %j", (version) => {
    const decision = evaluateFirmwareCompatibility({
      identity: resolution("CONFIRMED"),
      artifact: {
        targetId: "fixture.rx.alpha",
        firmwareVersion: version,
        sha256: "abc",
      },
      updateMethod: "WIFI_OTA",
      catalog,
    });

    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons).toEqual(["FIRMWARE_MAJOR_UNSUPPORTED"]);
    expect(decision.blockingErrorCode).toBe("VERSION_INCOMPATIBLE");
  });

  it("blocks an update method that the confirmed target does not support", () => {
    const decision = evaluateFirmwareCompatibility({
      identity: resolution("CONFIRMED"),
      artifact: {
        targetId: "fixture.rx.alpha",
        firmwareVersion: "4.1.0",
        sha256: "abc",
      },
      updateMethod: "UART",
      catalog,
    });

    expect(decision.reasons).toEqual(["UPDATE_METHOD_UNSUPPORTED"]);
    expect(decision.blockingErrorCode).toBe("PROVIDER_UNSUPPORTED");
  });

  it("treats a confirmed target absent from the pinned catalog as unknown", () => {
    const decision = evaluateFirmwareCompatibility({
      identity: {
        ...resolution("CONFIRMED"),
        selectedTargetId: "fixture.rx.removed",
      },
      artifact: {
        targetId: "fixture.rx.removed",
        firmwareVersion: "4.1.0",
        sha256: "abc",
      },
      updateMethod: "WIFI_OTA",
      catalog,
    });

    expect(decision.status).toBe("UNKNOWN");
    expect(decision.blockingErrorCode).toBe("TARGET_UNKNOWN");
  });
});
