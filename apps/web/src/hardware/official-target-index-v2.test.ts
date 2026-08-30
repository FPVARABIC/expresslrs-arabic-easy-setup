import { describe, expect, it } from "vitest";

import { parseOfficialTargetsV2 } from "./official-target-index-v2";

describe("official Target parser V2", () => {
  it("preserves safe Unicode display names while identifiers remain path-safe", () => {
    const targets = parseOfficialTargetsV2({
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
    const targets = parseOfficialTargetsV2({
      vendor: {
        receivers: {
          rx_900: {
            receiver: {
              product_name: "RX",
              platform: "stm32",
              firmware: "VENDOR_RX",
              upload_methods: ["stlink"],
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

  it("rejects traversal-like identifiers and artifact paths", () => {
    expect(() =>
      parseOfficialTargetsV2({
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

    const targets = parseOfficialTargetsV2({
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
