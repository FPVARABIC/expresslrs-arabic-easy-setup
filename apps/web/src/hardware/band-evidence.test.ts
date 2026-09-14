import { describe, expect, it } from "vitest";

import {
  bandFamilyForDomain,
  bandFamilyForRadioKey,
  bandFromVersionDomain,
  bandKnownToMismatch,
  deviceBandEvidence,
} from "./band-evidence";
import type { CrsfParameter } from "./crsf";
import type { OfficialTarget } from "./parity-types";
import type { TargetMatchResult } from "./target-match";

function info(name: string, value = "abc1234"): CrsfParameter {
  return {
    id: 9,
    parentId: 0,
    type: 12,
    hidden: false,
    name,
    rawValue: new Uint8Array(),
    kind: "info",
    value,
  };
}

function target(radioKey: string): OfficialTarget {
  return {
    id: `vendor/${radioKey}/device`,
    role: radioKey.startsWith("tx") ? "tx" : "rx",
    vendorKey: "vendor",
    vendorName: "Vendor",
    radioKey,
    targetKey: "device",
    config: {
      productName: "Device",
      platform: "esp32",
      firmware: "DEVICE",
      luaName: null,
      layoutFile: null,
      logoFile: null,
      uploadMethods: ["uart", "download"],
      minVersion: null,
      customLayout: {},
      overlay: null,
      raw: {},
    },
  };
}

function exactMatch(radioKey: string): TargetMatchResult {
  const selected = target(radioKey);
  return {
    confidence: "EXACT",
    selected,
    candidates: [
      { target: selected, score: 100, evidence: ["product-name-exact"] },
    ],
  };
}

describe("band evidence", () => {
  it.each([
    ["tx_2400", "2.4GHz"],
    ["rx_2400", "2.4GHz"],
    ["tx_900", "Sub-GHz"],
    ["rx_900", "Sub-GHz"],
    ["rx_433", "Sub-GHz"],
    ["tx_dual", "Dual-Band"],
    ["rx_dual", "Dual-Band"],
  ] as const)("reads %s as %s", (radioKey, band) => {
    expect(bandFamilyForRadioKey(radioKey)).toBe(band);
  });

  it("does not guess a band from a radio key it does not recognise", () => {
    expect(bandFamilyForRadioKey("rx_lora")).toBeNull();
    expect(bandFamilyForRadioKey("")).toBeNull();
  });

  // The names are FHSS.cpp's `domains[]` / `domainsDualBand[]` at 4.1.0.
  it.each([
    ["AU915", "Sub-GHz"],
    ["FCC915", "Sub-GHz"],
    ["EU868", "Sub-GHz"],
    ["IN866", "Sub-GHz"],
    ["AU433", "Sub-GHz"],
    ["EU433", "Sub-GHz"],
    ["US433", "Sub-GHz"],
    ["US433W", "Sub-GHz"],
    ["ISM2G4", "2.4GHz"],
    ["CE_LBT", "2.4GHz"],
  ] as const)("maps the regulatory domain %s to %s", (domain, band) => {
    expect(bandFamilyForDomain(domain)).toBe(band);
    expect(bandFamilyForDomain(domain.toLowerCase())).toBe(band);
  });

  it("refuses an unknown domain name rather than guessing", () => {
    expect(bandFamilyForDomain("FCC")).toBeNull();
    expect(bandFamilyForDomain("2400")).toBeNull();
  });

  it("parses the version string the firmware publishes, single and dual band", () => {
    expect(bandFromVersionDomain("4.1.0 ISM2G4")).toEqual({
      band: "2.4GHz",
      domain: "ISM2G4",
    });
    expect(bandFromVersionDomain("4.1.0 FCC915")).toEqual({
      band: "Sub-GHz",
      domain: "FCC915",
    });
    expect(bandFromVersionDomain("4.1.0 FCC915/ISM2G4")).toEqual({
      band: "Dual-Band",
      domain: "FCC915/ISM2G4",
    });
    // addDomainInfo() truncates a long version to 17 characters plus "... ".
    expect(bandFromVersionDomain("4.1.0-RC1-2026090... EU868")).toEqual({
      band: "Sub-GHz",
      domain: "EU868",
    });
  });

  it("is not fooled by other info entries, a lone version, or a half-known pair", () => {
    // luaInfo: the bad/good packet counters.
    expect(bandFromVersionDomain("0/500   0/0")).toBeNull();
    expect(bandFromVersionDomain("4.1.0")).toBeNull();
    expect(bandFromVersionDomain("abc1234")).toBeNull();
    expect(bandFromVersionDomain("4.1.0 FCC915/NOPE")).toBeNull();
    expect(bandFromVersionDomain("4.1.0 ISM2G4/FCC915")).toBeNull();
  });

  it("prefers the domain the device reports over a catalog match", () => {
    expect(
      deviceBandEvidence({
        parameters: [info("4.1.0 FCC915")],
        match: exactMatch("rx_2400"),
      }),
    ).toEqual({
      band: "Sub-GHz",
      source: "REGULATORY_DOMAIN",
      detail: "FCC915",
    });
  });

  it("reads the domain from the info entry's value when the name carries none", () => {
    expect(
      deviceBandEvidence({
        parameters: [info("ELRS", "4.1.0 ISM2G4")],
        match: null,
      }),
    ).toEqual({
      band: "2.4GHz",
      source: "REGULATORY_DOMAIN",
      detail: "ISM2G4",
    });
  });

  it("falls back to an exact catalog match, and to nothing for a weaker one", () => {
    expect(
      deviceBandEvidence({ parameters: [], match: exactMatch("tx_900") }),
    ).toEqual({
      band: "Sub-GHz",
      source: "EXACT_TARGET_MATCH",
      detail: "tx_900",
    });
    expect(
      deviceBandEvidence({
        parameters: [info("0/500   0/0")],
        match: { ...exactMatch("tx_900"), confidence: "LIKELY" },
      }),
    ).toBeNull();
    expect(deviceBandEvidence({ parameters: [], match: null })).toBeNull();
  });

  it("calls a mismatch only when both bands are known and differ", () => {
    const device = {
      band: "2.4GHz",
      source: "REGULATORY_DOMAIN",
      detail: "ISM2G4",
    } as const;
    expect(bandKnownToMismatch(device, "rx_900")).toBe(true);
    expect(bandKnownToMismatch(device, "rx_dual")).toBe(true);
    expect(bandKnownToMismatch(device, "rx_2400")).toBe(false);
    expect(bandKnownToMismatch(device, "rx_unknown")).toBe(false);
    expect(bandKnownToMismatch(device, null)).toBe(false);
    expect(bandKnownToMismatch(null, "rx_900")).toBe(false);
  });
});
