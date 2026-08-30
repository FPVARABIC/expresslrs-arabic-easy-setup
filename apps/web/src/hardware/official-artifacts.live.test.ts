import { describe, expect, it } from "vitest";

import { loadOfficialExpressLrsCatalog } from "./official-catalog";
import { fetchOfficialExpressLrsResource } from "./official-source";

const runLive = process.env.EXPRESSLRS_LIVE_CATALOG === "1";

(runLive ? describe : describe.skip)(
  "live official ExpressLRS release artifacts",
  () => {
    it("resolves the current Firmware and Lua archives without consuming them", async () => {
      const catalog = await loadOfficialExpressLrsCatalog();
      const release = catalog.releases.find(
        (item) => item.channel === "release",
      );
      expect(release).toBeDefined();
      if (release === undefined) return;

      for (const fileName of ["firmware.zip", "lua.zip"] as const) {
        const response = await fetchOfficialExpressLrsResource({
          path: `${release.revision}/${fileName}`,
          accept: "application/zip",
        });
        expect(response.ok).toBe(true);
        await response.body?.cancel();
      }
    }, 120_000);
  },
);
