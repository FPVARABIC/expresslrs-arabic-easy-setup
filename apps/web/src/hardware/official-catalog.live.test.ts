import { describe, expect, it } from "vitest";

import { loadOfficialExpressLrsCatalog } from "./official-catalog";

const runLive =
  (
    globalThis as {
      readonly process?: {
        readonly env?: Readonly<Record<string, string | undefined>>;
      };
    }
  ).process?.env?.EXPRESSLRS_LIVE_CATALOG === "1";

(runLive ? describe : describe.skip)("live official ExpressLRS catalog", () => {
  it("parses the current official release index and target archive", async () => {
    const catalog = await loadOfficialExpressLrsCatalog();

    expect(catalog.source).toBe("EXPRESSLRS_WEB_FLASHER_MIRROR");
    expect(catalog.releases.length).toBeGreaterThan(0);
    expect(catalog.targets.length).toBeGreaterThan(0);
    expect(catalog.targets.some((target) => target.role === "tx")).toBe(true);
    expect(catalog.targets.some((target) => target.role === "rx")).toBe(true);
    expect(
      catalog.targets.every(
        (target) =>
          target.config.productName.length > 0 &&
          target.config.platform.length > 0 &&
          target.config.firmware.length > 0,
      ),
    ).toBe(true);
    const upstreamMethods = (target: (typeof catalog.targets)[number]) =>
      Array.isArray(target.config.raw.upload_methods)
        ? target.config.raw.upload_methods
        : [];
    // Each upstream route keeps its own name: the debug probe is `stlink`,
    // the ROM bootloader is `dfu`, and neither stands in for the other.
    expect(
      catalog.targets.every(
        (target) =>
          target.config.uploadMethods.includes("stlink") ===
            upstreamMethods(target).includes("stlink") &&
          target.config.uploadMethods.includes("dfu") ===
            upstreamMethods(target).includes("dfu"),
      ),
    ).toBe(true);
    expect(
      catalog.targets.some(
        (target) =>
          target.config.platform === "stm32" &&
          target.config.uploadMethods.includes("stlink"),
      ),
    ).toBe(true);
  }, 120_000);
});
