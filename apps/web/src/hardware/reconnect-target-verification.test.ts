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
          candidates: [
            { target, score: 100, evidence: ["product-name-exact"] },
          ],
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

describe("rx-as-tx role verification after reboot", () => {
  const rxTarget: OfficialTarget = {
    ...target,
    id: "vendor/rx_2400/module",
    role: "rx",
    radioKey: "rx_2400",
    config: { ...target.config, firmware: "MODULE_RX" },
  };
  const beforeRx: ExpressLrsIdentity = { ...identity, role: "rx" };
  const afterTx: ExpressLrsIdentity = {
    ...identity,
    role: "tx",
    firmwareVersion: "4.1.0",
  };

  it("fails when the device comes back still a receiver", () => {
    // The bytes may have been written and the device may have rebooted and
    // reconnected — none of that is proof the role changed.
    expect(
      verifyReconnectTarget({
        expectedTarget: rxTarget,
        beforeIdentity: beforeRx,
        afterIdentity: beforeRx,
        match: noMatch,
        manualTargetConfirmed: true,
        rxAsTxMode: "internal",
      }),
    ).toEqual({ verified: false, reason: "RX_AS_TX_ROLE_NOT_APPLIED" });
  });

  it("confirms only when the same unit reports a transmitter role", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: rxTarget,
        beforeIdentity: beforeRx,
        afterIdentity: afterTx,
        match: noMatch,
        manualTargetConfirmed: true,
        rxAsTxMode: "internal",
      }),
    ).toEqual({ verified: true, reason: "RX_AS_TX_ROLE_CONFIRMED" });
  });

  it("refuses when there is no before-identity to compare the unit against", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: rxTarget,
        beforeIdentity: null,
        afterIdentity: afterTx,
        match: noMatch,
        manualTargetConfirmed: true,
        rxAsTxMode: "internal",
      }),
    ).toEqual({ verified: false, reason: "TARGET_EVIDENCE_MISSING" });
  });

  it("refuses when a different physical unit answers", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: rxTarget,
        beforeIdentity: beforeRx,
        afterIdentity: { ...afterTx, hardwareVersion: 99 },
        match: noMatch,
        manualTargetConfirmed: true,
        rxAsTxMode: "internal",
      }),
    ).toEqual({ verified: false, reason: "PHYSICAL_IDENTITY_MISMATCH" });
  });

  it("refuses without an operator Target confirmation", () => {
    expect(
      verifyReconnectTarget({
        expectedTarget: rxTarget,
        beforeIdentity: beforeRx,
        afterIdentity: afterTx,
        match: noMatch,
        manualTargetConfirmed: false,
        rxAsTxMode: "internal",
      }),
    ).toEqual({ verified: false, reason: "TARGET_EVIDENCE_MISSING" });
  });

  it("still expects the receiver role for an ordinary write", () => {
    // Without rx-as-tx a device that suddenly reports TX is a mismatch, not a
    // success.
    expect(
      verifyReconnectTarget({
        expectedTarget: rxTarget,
        beforeIdentity: beforeRx,
        afterIdentity: afterTx,
        match: noMatch,
        manualTargetConfirmed: true,
        rxAsTxMode: "off",
      }),
    ).toEqual({ verified: false, reason: "ROLE_MISMATCH" });
  });

  it("expects the receiver role back after a recovery restore", () => {
    // Recovery replays the original receiver image, so `rxAsTxMode` is absent
    // and the device must return to being a receiver.
    expect(
      verifyReconnectTarget({
        expectedTarget: rxTarget,
        beforeIdentity: beforeRx,
        afterIdentity: beforeRx,
        match: noMatch,
        manualTargetConfirmed: true,
      }),
    ).toMatchObject({ verified: true });
  });
});
