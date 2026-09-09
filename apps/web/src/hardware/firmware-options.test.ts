import { describe, expect, it } from "vitest";

import { validateFirmwareOptions } from "./firmware-options";
import type { ExpressLrsFirmwareOptions, OfficialTarget } from "./parity-types";

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

const options: ExpressLrsFirmwareOptions = {
  region: "EU_CE",
  domain: 8,
  bindPhrase: "FPV Arabic",
  wifiSsid: "ELRS-Lab",
  wifiPassword: "password123",
  wifiAutoOnInterval: 60,
  fanRuntime: 30,
  telemetryInterval: 240,
  uartInverted: false,
  unlockHigherPower: false,
  receiverUartBaud: 420000,
  receiverInvertTx: false,
  lockOnFirstConnection: true,
  r9mmMiniSbus: false,
  receiverAsTransmitter: false,
};

describe("firmware option validation", () => {
  it("returns a normalized immutable option snapshot", () => {
    const result = validateFirmwareOptions({
      target,
      options: { ...options, bindPhrase: "A\u0301" },
    });

    expect(result.bindPhrase).toBe("Á");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ["domain", Number.NaN],
    ["domain", 256],
    ["wifiAutoOnInterval", -1],
    ["fanRuntime", Number.POSITIVE_INFINITY],
    ["receiverUartBaud", 1],
  ] as const)("rejects invalid %s", (field, value) => {
    expect(() =>
      validateFirmwareOptions({
        target,
        options: { ...options, [field]: value },
      }),
    ).toThrow(expect.objectContaining({ field }));
  });

  it("rejects control characters and invalid WPA password lengths", () => {
    expect(() =>
      validateFirmwareOptions({
        target,
        options: { ...options, wifiSsid: "bad\u0000ssid" },
      }),
    ).toThrow(expect.objectContaining({ field: "wifiSsid" }));

    expect(() =>
      validateFirmwareOptions({
        target,
        options: { ...options, wifiPassword: "short" },
      }),
    ).toThrow(expect.objectContaining({ field: "wifiPassword" }));
  });

  it("fails closed for receiver-as-transmitter packaging", () => {
    expect(() =>
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          radioKey: "rx_2400",
          config: { ...target.config, firmware: "MODULE_RX" },
        },
        options: { ...options, receiverAsTransmitter: true },
      }),
    ).toThrow(expect.objectContaining({ field: "receiverAsTransmitter" }));
  });
});
