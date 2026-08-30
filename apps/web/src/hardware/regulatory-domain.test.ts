import { describe, expect, it } from "vitest";

import {
  EXPRESSLRS_REGULATORY_REGIONS,
  regulatoryRegionByKey,
  regulatoryRegionsForRadioKey,
} from "./regulatory-domain";

describe("ExpressLRS regulatory region mapping", () => {
  it("keeps 2.4 GHz artifact folders separate from numeric firmware domains", () => {
    expect(regulatoryRegionByKey("FCC_2400")).toEqual(
      expect.objectContaining({ artifactDirectory: "FCC", domain: 7 }),
    );
    expect(regulatoryRegionByKey("EU_CE_2400")).toEqual(
      expect.objectContaining({ artifactDirectory: "EU_CE", domain: 8 }),
    );
  });

  it("offers only the family compatible with the selected radio", () => {
    expect(regulatoryRegionsForRadioKey("tx_2400").map((item) => item.key)).toEqual([
      "FCC_2400",
      "EU_CE_2400",
    ]);
    expect(regulatoryRegionsForRadioKey("rx_900").map((item) => item.key)).toEqual([
      "AU_915",
      "FCC_915",
      "EU_868",
      "IN_866",
    ]);
    expect(regulatoryRegionsForRadioKey("rx_433").map((item) => item.key)).toEqual([
      "AU_433",
      "EU_433",
      "US_433",
    ]);
  });

  it("has unique keys and numeric domains", () => {
    expect(new Set(EXPRESSLRS_REGULATORY_REGIONS.map((item) => item.key)).size).toBe(
      EXPRESSLRS_REGULATORY_REGIONS.length,
    );
    expect(
      new Set(EXPRESSLRS_REGULATORY_REGIONS.map((item) => item.domain)).size,
    ).toBe(EXPRESSLRS_REGULATORY_REGIONS.length);
  });
});
