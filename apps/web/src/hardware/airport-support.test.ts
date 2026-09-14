import { describe, expect, it } from "vitest";

import { evaluateAirportSupport } from "./airport-support";
import type { OfficialTarget } from "./parity-types";

function target(platform: string): OfficialTarget {
  return {
    id: `vendor/rx_900/${platform}`,
    role: "rx",
    vendorKey: "vendor",
    vendorName: "Vendor",
    radioKey: "rx_900",
    targetKey: platform,
    config: {
      productName: `Vendor ${platform} RX`,
      platform,
      firmware: "VENDOR_RX",
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

describe("AirPort support per platform", () => {
  it.each(["esp8285", "esp32", "esp32-c3", "esp32-s3"])(
    "is encodable for %s, where the options JSON carries is-airport",
    (platform) => {
      expect(evaluateAirportSupport(target(platform))).toEqual({
        supported: true,
      });
    },
  );

  it("is refused for STM32, which the pinned official flasher never encodes it for", () => {
    expect(evaluateAirportSupport(target("stm32"))).toEqual({
      supported: false,
      reason: "PLATFORM_NOT_ENCODED",
      targetName: "Vendor stm32 RX",
      platform: "stm32",
    });
    expect(evaluateAirportSupport(target("STM32F1")).supported).toBe(false);
  });

  it("holds nothing against a Target that has not been chosen yet", () => {
    expect(evaluateAirportSupport(null)).toEqual({ supported: true });
  });
});
