import { describe, expect, it, vi } from "vitest";

import { acquireOfficialLuaScript } from "./lua-package";
import type { OfficialRelease, OfficialTarget } from "./parity-types";

const release: OfficialRelease = {
  label: "4.1.0",
  revision: "release410",
  channel: "release",
};

const target: OfficialTarget = {
  id: "vendor/tx_2400/example",
  role: "tx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "tx_2400",
  targetKey: "example",
  config: {
    productName: "Example TX",
    platform: "esp32",
    firmware: "EXAMPLE_TX",
    luaName: "Example TX",
    layoutFile: null,
    logoFile: null,
    uploadMethods: ["uart", "download"],
    minVersion: null,
    customLayout: {},
    overlay: null,
    raw: {},
  },
};

describe("official Lua script acquisition", () => {
  it("downloads the universal v4 script instead of treating lua_name as a filename", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response("return 'v4'"),
    ) as unknown as typeof fetch;

    const result = await acquireOfficialLuaScript({
      release,
      target,
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://expresslrs.github.io/web-flasher/assets/firmware/release410/lua/elrs.lua",
      expect.objectContaining({
        credentials: "omit",
        redirect: "follow",
      }),
    );
    expect(result.fileName).toBe("elrs.lua");
    expect(new TextDecoder().decode(result.bytes)).toBe("return 'v4'");
  });

  it("selects the verified elrsV3.lua mirror path for a v3 release", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response("return 'v3'"),
    ) as unknown as typeof fetch;
    const result = await acquireOfficialLuaScript({
      release: { label: "3.6.4", revision: "release364", channel: "release" },
      target: { ...target, config: { ...target.config, luaName: null } },
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://expresslrs.github.io/web-flasher/assets/firmware/release364/lua/elrsV3.lua",
      expect.any(Object),
    );
    expect(result.fileName).toBe("elrsV3.lua");
    expect(new TextDecoder().decode(result.bytes)).toBe("return 'v3'");
  });

  it("uses the current script name for a non-semantic branch label", async () => {
    const result = await acquireOfficialLuaScript({
      release: { label: "master", revision: "branch", channel: "branch" },
      target,
      fetchImplementation: vi.fn(
        async () => new Response("return 'branch'"),
      ) as unknown as typeof fetch,
    });

    expect(result.fileName).toBe("elrs.lua");
  });

  it("rejects RX targets without requesting a script", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    await expect(
      acquireOfficialLuaScript({
        release,
        target: {
          ...target,
          role: "rx",
          config: { ...target.config, luaName: "Example RX" },
        },
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example/elrs.lua",
    "https://artifactory.expresslrs.org/ExpressLRS/release410/lua/elrs.lua",
    "https://expresslrs.github.io/web-flasher/assets/firmware/release410/lua/other.lua",
    "https://expresslrs.github.io/web-flasher/assets/firmware/release410/lua/elrs.lua?substituted=1",
  ])("rejects an unexpected final script URL: %s", async (finalUrl) => {
    const response = new Response("return 'substituted'");
    Object.defineProperty(response, "url", { value: finalUrl });

    await expect(
      acquireOfficialLuaScript({
        release,
        target,
        fetchImplementation: vi.fn(
          async () => response,
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "UNTRUSTED_REDIRECT" });
    expect(response.bodyUsed).toBe(true);
  });

  it("rejects an oversized script from its declared length before reading it", async () => {
    await expect(
      acquireOfficialLuaScript({
        release,
        target,
        fetchImplementation: vi.fn(
          async () =>
            new Response("not read", {
              headers: { "content-length": String(512 * 1024 + 1) },
            }),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "SCRIPT_TOO_LARGE" });
  });

  it("rejects an empty official script", async () => {
    await expect(
      acquireOfficialLuaScript({
        release,
        target,
        fetchImplementation: vi.fn(
          async () => new Response(new Uint8Array()),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "SCRIPT_NOT_FOUND" });
  });

  it("times out a stalled official request", async () => {
    vi.useFakeTimers();
    try {
      const pending = acquireOfficialLuaScript({
        release,
        target,
        fetchImplementation: vi.fn(
          async () => await new Promise<Response>(() => undefined),
        ) as unknown as typeof fetch,
      });
      const rejected = expect(pending).rejects.toMatchObject({
        code: "TIMEOUT",
      });

      await vi.advanceTimersByTimeAsync(45_000);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors caller cancellation while the request is stalled", async () => {
    const controller = new AbortController();
    const pending = acquireOfficialLuaScript({
      release,
      target,
      signal: controller.signal,
      fetchImplementation: vi.fn(
        async () => await new Promise<Response>(() => undefined),
      ) as unknown as typeof fetch,
    });
    const rejected = expect(pending).rejects.toMatchObject({ code: "ABORTED" });

    controller.abort();
    await rejected;
  });

  it("does not request the network when already cancelled", async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    controller.abort();

    await expect(
      acquireOfficialLuaScript({
        release,
        target,
        signal: controller.signal,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
