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
  rxAsTxMode: "off",
  airportEnabled: false,
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
  const rxOn = (
    platform: string,
    firmware = "MODULE_RX",
    productName = "Reference RX",
  ) => ({
    ...target,
    role: "rx" as const,
    radioKey: "rx_2400",
    config: { ...target.config, platform, firmware, productName },
  });

  it.each(["internal", "external"] as const)(
    "accepts %s mode on an ESP32 receiver",
    (mode) => {
      expect(() =>
        validateFirmwareOptions({
          target: rxOn("esp32"),
          options: { ...options, rxAsTxMode: mode },
        }),
      ).not.toThrow();
    },
  );

  it("accepts internal mode on an ESP8285 receiver", () => {
    expect(() =>
      validateFirmwareOptions({
        target: rxOn("esp8285"),
        options: { ...options, rxAsTxMode: "internal" },
      }),
    ).not.toThrow();
  });

  it("refuses external mode on an ESP8285 receiver, which has one UART", () => {
    expect(() =>
      validateFirmwareOptions({
        target: rxOn("esp8285", "MODULE_RX", "EP1 RX"),
        options: { ...options, rxAsTxMode: "external" },
      }),
    ).toThrow(
      expect.objectContaining({
        field: "rxAsTxMode",
        message: expect.stringContaining(
          "UNSUPPORTED_BY_TARGET (MODE_UNSUPPORTED_BY_PLATFORM)",
        ),
      }),
    );
  });

  it.each(["internal", "external"] as const)(
    "refuses %s mode on an STM32 receiver, naming the Target and platform",
    (mode) => {
      let thrown: unknown;
      try {
        validateFirmwareOptions({
          target: rxOn("stm32", "R9MINI_RX", "R9 Mini"),
          options: { ...options, rxAsTxMode: mode },
        });
      } catch (error: unknown) {
        thrown = error;
      }
      const message = (thrown as Error).message;
      expect(message).toContain("UNSUPPORTED_BY_TARGET (PLATFORM_UNSUPPORTED)");
      expect(message).toContain("R9 Mini");
      expect(message).toContain("stm32");
      // Never a build-phase excuse.
      expect(message).not.toMatch(/locked|not implemented|until|later|stage/iu);
    },
  );

  it("refuses it on a transmitter Target, which has no role to change", () => {
    expect(() =>
      validateFirmwareOptions({
        target,
        options: { ...options, rxAsTxMode: "internal" },
      }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("TARGET_IS_TRANSMITTER"),
      }),
    );
  });

  it("refuses a receiver whose artifact names no transmitter build", () => {
    expect(() =>
      validateFirmwareOptions({
        target: rxOn("esp32", "MODULE"),
        options: { ...options, rxAsTxMode: "internal" },
      }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("NO_TX_ARTIFACT"),
      }),
    );
  });

  it("rejects a mode outside upstream's TXType enum", () => {
    expect(() =>
      validateFirmwareOptions({
        target: rxOn("esp32"),
        options: {
          ...options,
          rxAsTxMode: "sideways" as unknown as "internal",
        },
      }),
    ).toThrow(expect.objectContaining({ field: "rxAsTxMode" }));
  });

  it("leaves an unsupported Target alone when the option is off", () => {
    expect(
      validateFirmwareOptions({
        target: rxOn("stm32"),
        options: { ...options, rxAsTxMode: "off" },
      }).rxAsTxMode,
    ).toBe("off");
  });

  it("keeps AirPort independent of rx-as-tx in both directions", () => {
    // AirPort on an STM32 receiver is fine: it is a different feature and is
    // not gated by the rx-as-tx platform rule.
    expect(
      validateFirmwareOptions({
        target: rxOn("stm32"),
        options: { ...options, rxAsTxMode: "off", airportEnabled: true },
      }),
    ).toMatchObject({ rxAsTxMode: "off", airportEnabled: true });
    // And enabling rx-as-tx must not turn AirPort on.
    expect(
      validateFirmwareOptions({
        target: rxOn("esp32"),
        options: { ...options, rxAsTxMode: "internal", airportEnabled: false },
      }),
    ).toMatchObject({ rxAsTxMode: "internal", airportEnabled: false });
  });
});
