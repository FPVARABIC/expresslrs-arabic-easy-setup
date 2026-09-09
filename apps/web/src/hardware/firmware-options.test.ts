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

  // Running a receiver as a transmitter is ExpressLRS' AirPort option. Whether
  // a device can take it follows from where that option lands in its firmware:
  // an ESP receiver is configured through a JSON options block that carries
  // arbitrary keys, while an STM32 receiver is configured through a packed
  // block whose receiver flags are three fixed bits with no AirPort field.
  it("accepts receiver-as-transmitter on an ESP receiver", () => {
    expect(() =>
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          radioKey: "rx_2400",
          config: {
            ...target.config,
            platform: "esp32",
            firmware: "MODULE_RX",
          },
        },
        options: { ...options, receiverAsTransmitter: true },
      }),
    ).not.toThrow();
  });

  it("accepts it on an ESP8285 receiver too", () => {
    expect(() =>
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          radioKey: "rx_900",
          config: {
            ...target.config,
            platform: "esp8285",
            firmware: "MODULE_RX",
          },
        },
        options: { ...options, receiverAsTransmitter: true },
      }),
    ).not.toThrow();
  });

  it("refuses it on an STM32 receiver and names the missing field", () => {
    expect(() =>
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          radioKey: "rx_900",
          config: {
            ...target.config,
            productName: "R9 Mini",
            platform: "stm32",
            firmware: "R9MINI",
          },
        },
        options: { ...options, receiverAsTransmitter: true },
      }),
    ).toThrow(
      expect.objectContaining({
        field: "receiverAsTransmitter",
        message: expect.stringContaining(
          "UNSUPPORTED_BY_TARGET (PLATFORM_HAS_NO_AIRPORT_FIELD)",
        ),
      }),
    );
  });

  it("names the Target and platform in the refusal", () => {
    let thrown: unknown;
    try {
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          config: {
            ...target.config,
            productName: "R9 Mini",
            platform: "stm32",
          },
        },
        options: { ...options, receiverAsTransmitter: true },
      });
    } catch (error: unknown) {
      thrown = error;
    }
    const message = (thrown as Error).message;
    expect(message).toContain("R9 Mini");
    expect(message).toContain("stm32");
    // Never a build-phase excuse.
    expect(message).not.toMatch(/locked|not implemented|until/iu);
  });

  it("refuses it on a transmitter Target, which has no receiver to repurpose", () => {
    expect(() =>
      validateFirmwareOptions({
        target,
        options: { ...options, receiverAsTransmitter: true },
      }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("TARGET_IS_TRANSMITTER"),
      }),
    );
  });

  it("refuses it on a platform this application cannot configure", () => {
    expect(() =>
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          config: { ...target.config, platform: "nrf52840" },
        },
        options: { ...options, receiverAsTransmitter: true },
      }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("PLATFORM_UNKNOWN"),
      }),
    );
  });

  it("refuses it for a release that predates AirPort", () => {
    expect(() =>
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          config: { ...target.config, platform: "esp32" },
        },
        options: { ...options, receiverAsTransmitter: true },
        release: { label: "2.5.2", revision: "r252", channel: "release" },
      }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("RELEASE_TOO_OLD"),
      }),
    );
  });

  it("leaves the option alone when it is not requested", () => {
    expect(
      validateFirmwareOptions({
        target: {
          ...target,
          role: "rx",
          config: { ...target.config, platform: "stm32" },
        },
        options: { ...options, receiverAsTransmitter: false },
      }).receiverAsTransmitter,
    ).toBe(false);
  });
});
