import { describe, expect, it } from "vitest";

import {
  EXPRESSLRS_REGULATORY_REGIONS,
  regulatoryRegionByKey,
  regulatoryRegionsForRadioKey,
} from "./regulatory-domain";

describe("ExpressLRS regulatory region mapping", () => {
  it("keeps 2.4 GHz artifact folders separate from numeric firmware domains", () => {
    expect(regulatoryRegionByKey("FCC_2400")).toEqual(
      expect.objectContaining({ artifactDirectory: "FCC", domain: 0 }),
    );
    expect(regulatoryRegionByKey("EU_CE_2400")).toEqual(
      expect.objectContaining({ artifactDirectory: "LBT", domain: 0 }),
    );
  });

  it("offers only the family compatible with the selected radio", () => {
    expect(
      regulatoryRegionsForRadioKey("tx_2400").map((item) => item.key),
    ).toEqual(["FCC_2400", "EU_CE_2400"]);
    expect(
      regulatoryRegionsForRadioKey("rx_900").map((item) => item.key),
    ).toEqual([
      "AU_915",
      "FCC_915",
      "EU_868",
      "IN_866",
      "AU_433",
      "EU_433",
      "US_433",
      "US_433_WIDE",
    ]);
    const dualRegions = regulatoryRegionsForRadioKey("tx_dual");
    expect(dualRegions).toHaveLength(16);
    expect(
      dualRegions.map((item) => [item.artifactDirectory, item.domain]),
    ).toEqual([
      ...Array.from({ length: 8 }, (_, domain) => ["FCC", domain]),
      ...Array.from({ length: 8 }, (_, domain) => ["LBT", domain]),
    ]);
    expect(regulatoryRegionByKey("DUAL_FCC_US_433_WIDE")).toEqual(
      expect.objectContaining({ artifactDirectory: "FCC", domain: 7 }),
    );
    expect(regulatoryRegionByKey("DUAL_LBT_AU_915")).toEqual(
      expect.objectContaining({ artifactDirectory: "LBT", domain: 0 }),
    );
    expect(
      regulatoryRegionsForRadioKey("rx_433").map((item) => item.key),
    ).toEqual(["AU_433", "EU_433", "US_433", "US_433_WIDE"]);
    expect(regulatoryRegionsForRadioKey("rx_unknown")).toEqual([]);
  });

  it("has unique keys and covers every low-frequency domain", () => {
    expect(
      new Set(EXPRESSLRS_REGULATORY_REGIONS.map((item) => item.key)).size,
    ).toBe(EXPRESSLRS_REGULATORY_REGIONS.length);
    expect(
      EXPRESSLRS_REGULATORY_REGIONS.filter(
        (item) => item.family === "Sub-GHz" || item.family === "433MHz",
      ).map((item) => item.domain),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
