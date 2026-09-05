import { describe, expect, it, vi } from "vitest";

import {
  EXPRESSLRS_WEB_FLASHER_ASSET_BASE,
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
    const release400 = "a".repeat(40);
    const release410 = "b".repeat(40);
    const master = "c".repeat(40);
    const releases = parseOfficialReleaseIndex({
      tags: {
        "4.0.0": release400,
        "4.1.0": release410,
        malformed: "../../escape",
        abbreviated: "abcdef",
      },
      branches: { master },
    });

    expect(releases.map((item) => item.label)).toEqual([
      "4.1.0",
      "4.0.0",
      "master",
    ]);
    expect(releases.find((item) => item.label === "malformed")).toBeUndefined();
  });

  it("sorts stable and numbered prereleases by version precedence", () => {
    const releases = parseOfficialReleaseIndex({
      tags: {
        "4.2.0-RC2": "d".repeat(40),
        "4.2.0-RC10": "c".repeat(40),
        "4.2.0": "b".repeat(40),
        "4.1.0": "a".repeat(40),
      },
    });

    expect(releases.map((item) => item.label)).toEqual([
      "4.2.0",
      "4.2.0-RC10",
      "4.2.0-RC2",
      "4.1.0",
    ]);
  });

  it("sorts all bounded candidates before applying the exact release cap", () => {
    const tags = Object.fromEntries(
      Array.from({ length: 130 }, (_, index) => [
        `1.0.${index}`,
        index.toString(16).padStart(40, "0"),
      ]),
    );

    const releases = parseOfficialReleaseIndex({
      tags,
      branches: { master: "f".repeat(40) },
    });

    expect(releases).toHaveLength(128);
    expect(releases.slice(0, 2).map((release) => release.label)).toEqual([
      "1.0.129",
      "1.0.128",
    ]);
    expect(releases.some((release) => release.label === "master")).toBe(false);
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

  it("loads the CORS-capable Web Flasher index and targets JSON", async () => {
    const releaseSha = "d".repeat(40);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("index.json")) {
        return new Response(JSON.stringify({ tags: { "4.1.0": releaseSha } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(targetsFixture), { status: 200 });
    });
    const fetchImplementation = fetchMock as unknown as typeof fetch;

    const catalog = await loadOfficialExpressLrsCatalog({
      fetchImplementation,
    });

    expect(catalog.releases[0]).toEqual({
      label: "4.1.0",
      revision: releaseSha,
      channel: "release",
    });
    expect(catalog.targets).toHaveLength(2);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/index.json`,
      `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/hardware/targets.json`,
    ]);
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

  it("stops a bounded-byte response with excessive streaming overhead", async () => {
    const cancel = vi.fn();
    let emitted = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          emitted += 1;
          controller.enqueue(new Uint8Array([0]));
        },
        cancel,
      }),
    );

    await expect(
      readBoundedResponse(response, 32 * 1024),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(emitted).toBe(16_385);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 503, contentLength: null, code: "HTTP" },
    { status: 200, contentLength: "11", code: "TOO_LARGE" },
  ] as const)(
    "cancels an unread response body before rejecting with $code",
    async ({ status, contentLength, code }) => {
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream<Uint8Array>({ cancel }),
        {
          status,
          headers:
            contentLength === null
              ? undefined
              : { "content-length": contentLength },
        },
      );

      await expect(readBoundedResponse(response, 10)).rejects.toMatchObject({
        code,
      });
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it("reports an unknown total when Content-Length is absent", async () => {
    const progress = vi.fn();
    await readBoundedResponse(new Response("catalog"), 64, progress);

    expect(progress).toHaveBeenLastCalledWith(7, null);
  });
});
