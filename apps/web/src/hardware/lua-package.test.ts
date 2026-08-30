import { zipSync } from "fflate";
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
    luaName: "example.lua",
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
  it("returns only the exact target-declared script", async () => {
    const archive = zipSync({
      "lua/example.lua": new TextEncoder().encode("return 'example'"),
      "lua/other.lua": new TextEncoder().encode("return 'other'"),
    });
    const fetchImplementation = vi.fn(async () =>
      new Response(archive.slice().buffer),
    ) as unknown as typeof fetch;

    const result = await acquireOfficialLuaScript({
      release,
      target,
      fetchImplementation,
    });

    expect(result.fileName).toBe("example.lua");
    expect(new TextDecoder().decode(result.bytes)).toBe("return 'example'");
  });

  it("rejects RX targets and TX targets without a declared script", async () => {
    await expect(
      acquireOfficialLuaScript({
        release,
        target: { ...target, role: "rx", config: { ...target.config, luaName: null } },
        fetchImplementation: vi.fn() as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
  });
});
