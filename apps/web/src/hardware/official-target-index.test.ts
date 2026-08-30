import { describe, expect, it } from "vitest";

import { parseOfficialTargetsFlexible } from "./official-target-index";

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
