import { describe, expect, it } from "vitest";

import type { OfficialTarget } from "./parity-types";
import { verifyReconnectTarget } from "./reconnect-target-verification";
import type { ExpressLrsIdentity } from "./session";
import type { TargetMatchResult } from "./target-match";

const target: OfficialTarget = {
  id: "vendor/tx_2400/module",
  role: "tx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "tx_2400",
  targetKey: "module",
  config: {
    productName: "Module",
    platform: "esp32",
    firmware: "MODULE",
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

const identity: ExpressLrsIdentity = {
  validation: "CRSF_DEVICE_INFO",
  role: "tx",
  address: 0xee,
  requestOrigin: 0x10,
  productName: "Module",
  firmwareVersion: "4.1.0",
  serialMarker: "ELRS",
  hardwareVersion: 1,
  softwareVersion: 0x00040100,
  parameterVersion: 0,
  parameterCount: 10,
  usb: { usbVendorId: 0x303a, usbProductId: 0x1001 },
};

const noMatch: TargetMatchResult = {
  confidence: "NOT_FOUND",
  selected: null,
  candidates: [],
  reasons: ["No Target matched"],
};

describe("reconnect Target verification", () => {
  it("accepts an exact catalog match", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: target,
        beforeIdentity: null,
        afterIdentity: identity,
        match: {
          confidence: "EXACT",
          selected: target,
          candidates: [target],
          reasons: ["Exact"],
        },
        manualTargetConfirmed: false,
      }),
    ).toEqual({ verified: true, reason: "EXACT_CATALOG_MATCH" });
  });

  it("rejects manual confirmation without a pre-write physical identity", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: target,
        beforeIdentity: null,
        afterIdentity: identity,
        match: noMatch,
        manualTargetConfirmed: true,
      }),
    ).toEqual({ verified: false, reason: "TARGET_EVIDENCE_MISSING" });
  });

  it("accepts manual Target selection only when the same physical device returns", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: target,
        beforeIdentity: identity,
        afterIdentity: { ...identity, firmwareVersion: "4.2.0" },
        match: noMatch,
        manualTargetConfirmed: true,
      }),
    ).toEqual({
      verified: true,
      reason: "SAME_DEVICE_AND_MANUAL_TARGET",
    });
  });

  it("rejects a different USB identity after reboot", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: target,
        beforeIdentity: identity,
        afterIdentity: {
          ...identity,
          usb: { usbVendorId: 0x0483, usbProductId: 0xdf11 },
        },
        match: noMatch,
        manualTargetConfirmed: true,
      }),
    ).toEqual({
      verified: false,
      reason: "PHYSICAL_IDENTITY_MISMATCH",
    });
  });
});
