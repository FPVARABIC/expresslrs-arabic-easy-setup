import { describe, expect, it } from "vitest";

import { parseOfficialTargetsFlexible } from "./official-target-index";

describe("official Target parser", () => {
  it("preserves safe Unicode display names while identifiers remain path-safe", () => {
    const targets = parseOfficialTargetsFlexible({
      vendor: {
        name: "شركة الاختبار",
        tx_2400: {
          module: {
            product_name: "وحدة إرسال 2.4 GHz",
            platform: "esp32",
            firmware: "VENDOR_TX",
            upload_methods: ["uart", "etx", "wifi"],
          },
        },
      },
    });

    expect(targets[0]).toEqual(
      expect.objectContaining({
        id: "vendor/tx_2400/module",
        vendorName: "شركة الاختبار",
        config: expect.objectContaining({
          productName: "وحدة إرسال 2.4 GHz",
          uploadMethods: ["uart", "edgetx", "wifi", "download"],
        }),
      }),
    );
  });

  it("finds TX/RX definitions below an extra category layer", () => {
    const targets = parseOfficialTargetsFlexible({
      vendor: {
        receivers: {
          rx_900: {
            receiver: {
              product_name: "RX",
              platform: "stm32",
              firmware: "VENDOR_RX",
              upload_methods: ["dfu"],
            },
          },
        },
      },
    });

    expect(targets[0]).toEqual(
      expect.objectContaining({
        role: "rx",
        radioKey: "rx_900",
        targetKey: "receiver",
        config: expect.objectContaining({
          uploadMethods: ["stlink", "download"],
        }),
      }),
    );
  });

  it("does not authorize STM32 DFU for an upstream ST-Link-only Target", () => {
    const targets = parseOfficialTargetsFlexible({
      vendor: {
        tx_900: {
          probe_only: {
            product_name: "ST-Link-only TX",
            platform: "stm32",
            firmware: "PROBE_ONLY_TX",
            upload_methods: ["stlink"],
          },
          rom_dfu: {
            product_name: "ROM DFU TX",
            platform: "stm32",
            firmware: "ROM_DFU_TX",
            upload_methods: ["dfu", "stlink"],
          },
        },
      },
    });

    expect(
      targets.find((target) => target.targetKey === "probe_only")?.config
        .uploadMethods,
    ).toEqual(["download"]);
    expect(
      targets.find((target) => target.targetKey === "rom_dfu")?.config
        .uploadMethods,
    ).toEqual(["stlink", "download"]);
  });

  it("rejects traversal-like identifiers and artifact paths", () => {
    expect(() =>
      parseOfficialTargetsFlexible({
        "../vendor": {
          tx_2400: {
            module: {
              product_name: "Unsafe",
              platform: "esp32",
              firmware: "UNSAFE",
            },
          },
        },
      }),
    ).toThrow(/no bounded TX\/RX definitions/iu);

    const targets = parseOfficialTargetsFlexible({
      vendor: {
        tx_2400: {
          module: {
            product_name: "Safe",
            platform: "esp32",
            firmware: "SAFE",
            layout_file: "../../outside.json",
          },
        },
      },
    });
    expect(targets[0]?.config.layoutFile).toBeNull();
  });
});

describe("flexible official Target hierarchy", () => {
  it("parses the conventional vendor/radio/target tree", () => {
    const targets = parseOfficialTargetsFlexible({
      vendor: {
        name: "Vendor",
        tx_2400: {
          module: {
            product_name: "Vendor Module",
            platform: "esp32",
            firmware: "VENDOR_MODULE",
            upload_methods: ["uart", "etx"],
          },
        },
      },
    });

    expect(targets).toEqual([
      expect.objectContaining({
        id: "vendor/tx_2400/module",
        role: "tx",
        vendorName: "Vendor",
        config: expect.objectContaining({
          productName: "Vendor Module",
          uploadMethods: ["uart", "edgetx", "download"],
        }),
      }),
    ]);
  });

  it("finds a target below an added category layer", () => {
    const targets = parseOfficialTargetsFlexible({
      vendor: {
        name: "Vendor",
        modules: {
          rx_900: {
            receiver: {
              product_name: "Receiver",
              platform: "esp8285",
              firmware: "VENDOR_RX",
              upload_method: "bf",
            },
          },
        },
      },
    });

    expect(targets[0]).toEqual(
      expect.objectContaining({
        role: "rx",
        targetKey: "receiver",
        radioKey: "rx_900",
        config: expect.objectContaining({
          uploadMethods: ["betaflight", "download"],
        }),
      }),
    );
  });

  it("ignores non-TX/RX device groups", () => {
    expect(() =>
      parseOfficialTargetsFlexible({
        vendor: {
          backpack: {
            device: {
              product_name: "Backpack",
              platform: "esp8285",
              firmware: "BACKPACK",
            },
          },
        },
      }),
    ).toThrow(/no bounded TX\/RX definitions/iu);
  });
});
