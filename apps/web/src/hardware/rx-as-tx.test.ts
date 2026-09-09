import { describe, expect, it } from "vitest";

import { evaluateRxAsTxSupport } from "./rx-as-tx";
import type { OfficialRelease, OfficialTarget } from "./parity-types";

function targetOn(
  platform: string,
  role: "tx" | "rx" = "rx",
  productName = "Reference RX",
): OfficialTarget {
  return {
    id: `vendor/radio/${platform}`,
    role,
    vendorKey: "vendor",
    vendorName: "Vendor",
    radioKey: role === "tx" ? "tx_2400" : "rx_2400",
    targetKey: "module",
    config: {
      productName,
      platform,
      firmware: "MODULE",
      luaName: null,
      layoutFile: null,
      logoFile: null,
      uploadMethods: ["uart"],
      minVersion: null,
      customLayout: {},
      overlay: null,
      raw: {},
    },
  };
}

const release: OfficialRelease = {
  label: "4.1.0",
  revision: "release410",
  channel: "release",
};

describe("receiver-as-transmitter support", () => {
  it.each(["esp32", "esp32-c3", "esp32-s3", "esp8285", "esp8266"])(
    "is supported on %s, whose options block carries arbitrary keys",
    (platform) => {
      expect(
        evaluateRxAsTxSupport({ target: targetOn(platform), release }),
      ).toMatchObject({ supported: true });
    },
  );

  it("is unsupported on STM32, whose packed block has no AirPort field", () => {
    const support = evaluateRxAsTxSupport({
      target: targetOn("stm32", "rx", "R9 Mini"),
      release,
    });

    expect(support).toMatchObject({
      supported: false,
      reason: "PLATFORM_HAS_NO_AIRPORT_FIELD",
      targetName: "R9 Mini",
      platform: "stm32",
    });
  });

  it("names the Target rather than blaming the build", () => {
    const support = evaluateRxAsTxSupport({
      target: targetOn("stm32", "rx", "R9 Mini"),
      release,
    });

    expect(support.supported).toBe(false);
    if (support.supported) return;
    expect(support.targetName).toBe("R9 Mini");
    expect(support.platform).toBe("stm32");
  });

  it("is unsupported for a transmitter Target", () => {
    expect(
      evaluateRxAsTxSupport({ target: targetOn("esp32", "tx"), release }),
    ).toMatchObject({ supported: false, reason: "TARGET_IS_TRANSMITTER" });
  });

  it("is undecidable with no Target chosen", () => {
    expect(evaluateRxAsTxSupport({ target: null, release })).toMatchObject({
      supported: false,
      reason: "NO_TARGET_SELECTED",
    });
  });

  it("refuses a platform this application cannot configure at all", () => {
    expect(
      evaluateRxAsTxSupport({ target: targetOn("nrf52840"), release }),
    ).toMatchObject({ supported: false, reason: "PLATFORM_UNKNOWN" });
  });

  it("refuses a release that predates AirPort", () => {
    expect(
      evaluateRxAsTxSupport({
        target: targetOn("esp32"),
        release: { label: "2.5.2", revision: "r252", channel: "release" },
      }),
    ).toMatchObject({ supported: false, reason: "RELEASE_TOO_OLD" });
  });

  it("accepts the first release that carries AirPort", () => {
    expect(
      evaluateRxAsTxSupport({
        target: targetOn("esp32"),
        release: { label: "3.0.0", revision: "r300", channel: "release" },
      }),
    ).toMatchObject({ supported: true });
  });

  it("decides on the Target alone when no release is chosen yet", () => {
    expect(
      evaluateRxAsTxSupport({ target: targetOn("esp32"), release: null }),
    ).toMatchObject({ supported: true });
    expect(
      evaluateRxAsTxSupport({ target: targetOn("stm32"), release: null }),
    ).toMatchObject({ supported: false });
  });
});
