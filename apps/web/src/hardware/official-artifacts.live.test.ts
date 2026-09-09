import { describe, expect, it } from "vitest";

import { loadOfficialExpressLrsCatalog } from "./official-catalog";
import { acquireOfficialLuaScript } from "./lua-package";

const runLive =
  (
    globalThis as {
      readonly process?: {
        readonly env?: Readonly<Record<string, string | undefined>>;
      };
    }
  ).process?.env?.EXPRESSLRS_LIVE_CATALOG === "1";

(runLive ? describe : describe.skip)(
  "live official ExpressLRS release artifacts",
  () => {
    it("downloads the current Lua script from the official Web Flasher mirror", async () => {
      const catalog = await loadOfficialExpressLrsCatalog();
      const release = catalog.releases.find(
        (item) => item.channel === "release",
      );
      expect(release).toBeDefined();
      if (release === undefined) return;
      const target = catalog.targets.find((item) => item.role === "tx");
      expect(target).toBeDefined();
      if (target === undefined) return;

      const script = await acquireOfficialLuaScript({ release, target });
      expect(script.fileName).toBe("elrs.lua");
      expect(script.bytes.byteLength).toBeGreaterThan(0);
    }, 120_000);
  },
);
