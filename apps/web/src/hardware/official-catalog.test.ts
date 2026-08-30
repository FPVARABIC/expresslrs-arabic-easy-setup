import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import {
  loadOfficialExpressLrsCatalog,
  parseOfficialReleaseIndex,
  parseOfficialTargets,
  readBoundedResponse,
} from "./official-catalog";

const targetsFixture = {
  vendor_a: {
    name: "Vendor A",
    tx_2400: {
      target_tx: {
        product_name: "Vendor A TX",
        platform: "esp32",
        firmware: "VENDOR_A_TX_2400",
        upload_methods: ["uart", "etx", "wifi"],
        lua_name: "vendor_a_tx.lua",
      },
    },
    rx_2400: {
      target_rx: {
        product_name: "Vendor A RX",
        platform: "esp8285",
        firmware: "VENDOR_A_RX_2400",
        upload_methods: ["bf", "wifi"],
      },
    },
    backpack: {
      ignored: {
        product_name: "Ignored Backpack",
        platform: "esp8285",
        firmware: "IGNORED",
      },
    },
  },
};

describe("official ExpressLRS catalog", () => {
  it("sorts releases and rejects malformed revisions", () => {
    const releases = parseOfficialReleaseIndex({
      tags: {
        "4.0.0": "abc123",
        "4.1.0": "def456",
        malformed: "../../escape",
      },
      branches: { master: "fedcba" },
    });

    expect(releases.map((item) => item.label)).toEqual([
      "4.1.0",
      "4.0.0",
      "master",
    ]);
    expect(releases.find((item) => item.label === "malformed")).toBeUndefined();
  });

  it("normalizes TX/RX targets and their official upload methods", () => {
    const targets = parseOfficialTargets(targetsFixture);

    expect(targets).toHaveLength(2);
    expect(targets.find((item) => item.role === "tx")).toEqual(
      expect.objectContaining({
        id: "vendor_a/tx_2400/target_tx",
        config: expect.objectContaining({
          platform: "esp32",
          uploadMethods: ["uart", "edgetx", "wifi", "download"],
        }),
      }),
    );
    expect(targets.find((item) => item.role === "rx")).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          uploadMethods: ["betaflight", "wifi", "download"],
        }),
      }),
    );
  });

  it("loads the index and the single targets.json from bounded responses", async () => {
    const hardwareZip = zipSync({
      "hardware/targets.json": new TextEncoder().encode(
        JSON.stringify(targetsFixture),
      ),
    });
    const fetchImplementation = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("index.json")) {
        return new Response(
          JSON.stringify({ tags: { "4.1.0": "release410" } }),
          { status: 200 },
        );
      }
      return new Response(hardwareZip, { status: 200 });
    }) as unknown as typeof fetch;

    const catalog = await loadOfficialExpressLrsCatalog({
      fetchImplementation,
    });

    expect(catalog.releases[0]).toEqual({
      label: "4.1.0",
      revision: "release410",
      channel: "release",
    });
    expect(catalog.targets).toHaveLength(2);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("stops reading a streaming response when it crosses the byte limit", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(8));
          controller.enqueue(new Uint8Array(8));
          controller.close();
        },
      }),
    );

    await expect(readBoundedResponse(response, 10)).rejects.toMatchObject({
      code: "TOO_LARGE",
    });
  });
});
