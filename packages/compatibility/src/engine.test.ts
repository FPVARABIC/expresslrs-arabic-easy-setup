import type { DeviceIdentityResolution } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { InMemoryTargetCatalog } from "./catalog.js";
import { evaluateFirmwareCompatibility } from "./engine.js";

const definition = {
  targetId: "fixture.rx.alpha",
  displayName: "Synthetic Alpha",
  identity: { "mcu-family": ["esp32"] },
  capabilities: ["read-config"],
  updateProviders: ["mock-wifi"],
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
    selectedTargetId:
      confidence === "CONFIRMED" ? "fixture.rx.alpha" : null,
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
      updateProvider: "mock-wifi",
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
      updateProvider: "mock-wifi",
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
      updateProvider: "mock-wifi",
      catalog,
    });

    expect(decision.status).toBe("COMPATIBLE");
  });
});
