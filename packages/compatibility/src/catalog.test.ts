import {
  createIdentityEvidence,
  type FirmwareUpdateMethod,
} from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { InMemoryTargetCatalog, type TargetDefinition } from "./catalog.js";

const catalog = new InMemoryTargetCatalog(
  {
    source: "synthetic-test",
    revision: "fixture-1",
    schemaVersion: "1",
    contentDigest: "sha256:synthetic",
    redistributionApproved: true,
  },
  [
    {
      targetId: "fixture.rx.alpha",
      displayName: "Synthetic Alpha",
      identity: {
        "mcu-family": ["esp32"],
        "radio-family": ["radio-a"],
      },
      capabilities: ["read-config"],
      updateMethods: ["WIFI_OTA"],
      supportedFirmwareMajors: [4],
    },
    {
      targetId: "fixture.rx.beta",
      displayName: "Synthetic Beta",
      identity: {
        "mcu-family": ["esp32"],
        "radio-family": ["radio-b"],
      },
      capabilities: ["read-config"],
      updateMethods: ["UART"],
      supportedFirmwareMajors: [4],
    },
  ],
);

function evidence(
  id: string,
  claim: string,
  rawValue: string,
  strength: "GENERIC" | "SUPPORTING" | "TARGET_SPECIFIC" = "SUPPORTING",
) {
  return createIdentityEvidence({
    id,
    claim,
    rawValue,
    source: {
      kind: "test-reader",
      instanceId: "reader-1",
      trustDomain: "test-domain",
    },
    strength,
    observedAt: "2026-08-20T08:00:00.000Z",
  });
}

describe("InMemoryTargetCatalog", () => {
  it("keeps multiple model candidates when generic evidence cannot distinguish them", () => {
    const candidates = catalog.match([
      evidence("mcu", "mcu-family", "ESP32", "GENERIC"),
    ]);

    expect(candidates.map((candidate) => candidate.targetId)).toEqual([
      "fixture.rx.alpha",
      "fixture.rx.beta",
    ]);
  });

  it("resolves newly injected model data without changing resolver code", () => {
    const candidates = catalog.match([
      evidence("target", "target", "fixture.rx.alpha", "TARGET_SPECIFIC"),
      evidence("radio", "radio-family", "radio-a"),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.targetId).toBe("fixture.rx.alpha");
    expect(candidates[0]?.conflictingEvidenceIds).toEqual([]);
  });

  it("preserves conflicting evidence instead of silently choosing a model", () => {
    const candidates = catalog.match([
      evidence("target", "target", "fixture.rx.alpha", "TARGET_SPECIFIC"),
      evidence("radio", "radio-family", "radio-b"),
    ]);

    expect(candidates[0]?.targetId).toBe("fixture.rx.alpha");
    expect(candidates[0]?.conflictingEvidenceIds).toEqual(["radio"]);
  });

  it("copies injected definitions so later caller mutation cannot change decisions", () => {
    const capabilities = ["read-config"];
    const radioFamilies = ["radio-safe"];
    const updateMethods: FirmwareUpdateMethod[] = ["WIFI_OTA"];
    const definition: TargetDefinition = {
      targetId: "fixture.rx.immutable",
      displayName: "Synthetic Immutable",
      identity: { "radio-family": radioFamilies },
      capabilities,
      updateMethods,
      supportedFirmwareMajors: [4],
    };
    const immutableCatalog = new InMemoryTargetCatalog(
      {
        source: "synthetic-test",
        revision: "immutable-1",
        schemaVersion: "1",
        contentDigest: "sha256:immutable",
        redistributionApproved: true,
      },
      [definition],
    );

    capabilities.push("unsafe-later-capability");
    radioFamilies.push("radio-mutated");
    updateMethods.push("UART");

    expect(immutableCatalog.get("fixture.rx.immutable")?.capabilities).toEqual([
      "read-config",
    ]);
    expect(immutableCatalog.get("fixture.rx.immutable")?.updateMethods).toEqual(
      ["WIFI_OTA"],
    );
    expect(
      immutableCatalog.match([
        evidence("mutated", "radio-family", "radio-mutated"),
      ]),
    ).toEqual([]);
  });

  it("rejects unknown or duplicate canonical update methods", () => {
    const definition: TargetDefinition = {
      targetId: "fixture.rx.invalid-method",
      displayName: "Synthetic Invalid Method",
      identity: { "radio-family": ["radio-safe"] },
      capabilities: [],
      updateMethods: ["WIFI_OTA"],
      supportedFirmwareMajors: [4],
    };
    const metadata = {
      source: "synthetic-test",
      revision: "invalid-method-1",
      schemaVersion: "2",
      contentDigest: "sha256:invalid-method",
      redistributionApproved: true,
    } as const;

    expect(
      () =>
        new InMemoryTargetCatalog(metadata, [
          { ...definition, updateMethods: ["NOT_A_METHOD"] as never },
        ]),
    ).toThrowError("Invalid update method");
    expect(
      () =>
        new InMemoryTargetCatalog(metadata, [
          {
            ...definition,
            updateMethods: ["WIFI_OTA", "WIFI_OTA"],
          },
        ]),
    ).toThrowError("Duplicate update method");
  });
});
