import { describe, expect, it } from "vitest";

import {
  applyRxAsTxLayout,
  evaluateRxAsTxSupport,
  RxAsTxLayoutError,
  rxAsTxFirmwareArtifact,
  rxAsTxModesForPlatform,
} from "./rx-as-tx";
import type { OfficialTarget } from "./parity-types";

/**
 * Parity fixture for the pinned upstream sources:
 *
 * - `ExpressLRS/ExpressLRS` @ 73ce820ba51437f73f31686233b607c58e188e7b
 * - `ExpressLRS/ExpressLRS-Configurator` @ 421d656f1987117e37472979444cee464e3fcdef
 *
 * These tests assert the *role change* that `--rx-as-tx` performs. They must
 * never be satisfied by writing `is-airport`, which is a different feature; a
 * dedicated test below pins that separation.
 */
function targetOn(
  platform: string,
  options: {
    readonly role?: "tx" | "rx";
    readonly productName?: string;
    readonly firmware?: string;
  } = {},
): OfficialTarget {
  const role = options.role ?? "rx";
  return {
    id: `vendor/radio/${platform}`,
    role,
    vendorKey: "vendor",
    vendorName: "Vendor",
    radioKey: role === "tx" ? "tx_2400" : "rx_2400",
    targetKey: "module",
    config: {
      productName: options.productName ?? "Reference RX",
      platform,
      firmware: options.firmware ?? `Unified_${platform.toUpperCase()}_2400_RX`,
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

describe("rx-as-tx platform gate (parity with binary_configurator.py:238)", () => {
  // Upstream: `platform.startswith('esp32') or (platform.startswith('esp8285')
  // and mode == internal)` — `and` binds tighter than `or`.
  it.each(["esp32", "esp32-c3", "esp32-s2", "esp32-s3", "esp32-c6"])(
    "offers both modes on %s, as every esp32* variant matches startswith('esp32')",
    (platform) => {
      expect(rxAsTxModesForPlatform(platform)).toEqual([
        "internal",
        "external",
      ]);
    },
  );

  it("offers internal only on esp8285, which has no second UART", () => {
    expect(rxAsTxModesForPlatform("esp8285")).toEqual(["internal"]);
  });

  it.each(["stm32", "esp8266"])(
    "offers nothing on %s, which upstream rejects with exit(1)",
    (platform) => {
      expect(rxAsTxModesForPlatform(platform)).toEqual([]);
    },
  );

  it("matches the Configurator's own per-platform mode list", () => {
    // TargetUserDefinesFactory.ts:92-100 builds exactly these lists.
    const configurator = (platform: string): readonly string[] => {
      if (platform.startsWith("esp32")) return ["internal", "external"];
      if (platform.startsWith("esp8285")) return ["internal"];
      return [];
    };
    for (const platform of [
      "esp32",
      "esp32-c3",
      "esp32-s2",
      "esp32-s3",
      "esp32-c6",
      "esp8285",
      "esp8266",
      "stm32",
    ]) {
      expect(rxAsTxModesForPlatform(platform)).toEqual(configurator(platform));
    }
  });
});

describe("rx-as-tx artifact selection", () => {
  it("selects the transmitter build rather than patching the receiver one", () => {
    expect(rxAsTxFirmwareArtifact("Unified_ESP32_2400_RX")).toBe(
      "Unified_ESP32_2400_TX",
    );
  });

  it("rewrites every occurrence, as Python's str.replace does", () => {
    // JavaScript's `String.replace` with a string pattern would stop after the
    // first match and silently keep a receiver artifact in the path.
    expect(rxAsTxFirmwareArtifact("A_RX_B_RX")).toBe("A_TX_B_TX");
  });

  it("refuses a Target whose artifact names no receiver build", () => {
    const support = evaluateRxAsTxSupport({
      target: targetOn("esp32", {
        firmware: "Unified_ESP32_2400",
        productName: "Odd Module",
      }),
      mode: "internal",
    });
    expect(support).toMatchObject({
      supported: false,
      reason: "NO_TX_ARTIFACT",
      targetName: "Odd Module",
    });
  });
});

describe("rx-as-tx support decisions name the Target and the reason", () => {
  it("supports an ESP32 receiver in both modes", () => {
    for (const mode of ["internal", "external"] as const) {
      expect(
        evaluateRxAsTxSupport({ target: targetOn("esp32"), mode }),
      ).toMatchObject({ supported: true, platform: "esp32" });
    }
  });

  it("supports an ESP8285 receiver internally", () => {
    expect(
      evaluateRxAsTxSupport({ target: targetOn("esp8285"), mode: "internal" }),
    ).toMatchObject({ supported: true });
  });

  it("refuses ESP8285 external with a mode-specific reason, not a build excuse", () => {
    const support = evaluateRxAsTxSupport({
      target: targetOn("esp8285", { productName: "EP1 RX" }),
      mode: "external",
    });
    expect(support).toMatchObject({
      supported: false,
      reason: "MODE_UNSUPPORTED_BY_PLATFORM",
      targetName: "EP1 RX",
      platform: "esp8285",
      availableModes: ["internal"],
    });
  });

  it.each(["internal", "external"] as const)(
    "refuses STM32 in %s mode, naming the Target and platform",
    (mode) => {
      const support = evaluateRxAsTxSupport({
        target: targetOn("stm32", { productName: "R9 Mini" }),
        mode,
      });
      expect(support).toMatchObject({
        supported: false,
        reason: "PLATFORM_UNSUPPORTED",
        targetName: "R9 Mini",
        platform: "stm32",
        availableModes: [],
      });
    },
  );

  it("refuses a transmitter Target, which has no role to change", () => {
    expect(
      evaluateRxAsTxSupport({
        target: targetOn("esp32", { role: "tx" }),
        mode: "internal",
      }),
    ).toMatchObject({ supported: false, reason: "TARGET_IS_TRANSMITTER" });
  });

  it("asks for a Target before deciding anything", () => {
    expect(evaluateRxAsTxSupport({ target: null })).toMatchObject({
      supported: false,
      reason: "NO_TARGET_SELECTED",
    });
  });

  it("never blames the build stage or a project phase", () => {
    const reasons = [
      evaluateRxAsTxSupport({ target: null }),
      evaluateRxAsTxSupport({ target: targetOn("stm32"), mode: "internal" }),
      evaluateRxAsTxSupport({ target: targetOn("esp8285"), mode: "external" }),
    ].map((support) => (support.supported ? "" : support.reason));
    for (const reason of reasons) {
      expect(reason).not.toMatch(/BUILD|PHASE|STAGE|LATER|SOON|PENDING/iu);
    }
  });
});

describe("rx-as-tx hardware layout (parity with UnifiedConfiguration.py:59-67)", () => {
  const base = Object.freeze({ serial_rx: 3, serial_tx: 1, led: 16 });

  it("keeps the receive pin distinct in internal (full-duplex) mode", () => {
    const layout = applyRxAsTxLayout(base, "internal");
    expect(layout["serial_rx"]).toBe(3);
    expect(layout["serial_tx"]).toBe(1);
  });

  it("folds the receive pin onto the transmit pin in external (half-duplex) mode", () => {
    const layout = applyRxAsTxLayout(base, "external");
    expect(layout["serial_rx"]).toBe(1);
    expect(layout["serial_tx"]).toBe(1);
  });

  it("produces a different layout for each mode", () => {
    expect(applyRxAsTxLayout(base, "internal")).not.toEqual(
      applyRxAsTxLayout(base, "external"),
    );
  });

  it("leaves a GPIO 0 receive pin alone, matching upstream's truthiness guard", () => {
    // `if rx_as_tx == TXType.external and hardware['serial_rx']` — 0 is falsy.
    const layout = applyRxAsTxLayout(
      { serial_rx: 0, serial_tx: 1, led: 16 },
      "external",
    );
    expect(layout["serial_rx"]).toBe(0);
  });

  it("remaps the status LED to led_red in both modes", () => {
    for (const mode of ["internal", "external"] as const) {
      const layout = applyRxAsTxLayout(base, mode);
      expect(layout["led_red"]).toBe(16);
      expect("led" in layout).toBe(false);
    }
  });

  it("keeps an existing led_red and leaves led in place", () => {
    const layout = applyRxAsTxLayout(
      { serial_rx: 3, serial_tx: 1, led: 16, led_red: 2 },
      "internal",
    );
    expect(layout["led_red"]).toBe(2);
    expect(layout["led"]).toBe(16);
  });

  it("refuses a layout with no serial pins, as upstream exits", () => {
    expect(() => applyRxAsTxLayout({ led: 16 }, "internal")).toThrow(
      RxAsTxLayoutError,
    );
    expect(() => applyRxAsTxLayout({ serial_rx: 3 }, "internal")).toThrow(
      /serial_rx\/serial_tx/u,
    );
  });

  it("never introduces an AirPort key", () => {
    for (const mode of ["internal", "external"] as const) {
      expect(JSON.stringify(applyRxAsTxLayout(base, mode))).not.toContain(
        "airport",
      );
    }
  });
});
