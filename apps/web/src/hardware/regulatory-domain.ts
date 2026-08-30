export interface ExpressLrsRegulatoryRegion {
  readonly key: string;
  readonly label: string;
  readonly artifactDirectory: string;
  readonly domain: number;
  readonly family: "2.4GHz" | "Sub-GHz" | "433MHz";
}

/**
 * Numeric values follow the stable ExpressLRS regulatory-domain enumeration.
 * The CI parity gate compares these values with the pinned upstream source.
 */
export const EXPRESSLRS_REGULATORY_REGIONS: readonly ExpressLrsRegulatoryRegion[] =
  Object.freeze([
    Object.freeze({
      key: "FCC_2400",
      label: "FCC / ISM 2.4 GHz",
      artifactDirectory: "FCC",
      domain: 7,
      family: "2.4GHz",
    }),
    Object.freeze({
      key: "EU_CE_2400",
      label: "EU CE 2.4 GHz",
      artifactDirectory: "EU_CE",
      domain: 8,
      family: "2.4GHz",
    }),
    Object.freeze({
      key: "AU_915",
      label: "Australia 915 MHz",
      artifactDirectory: "AU_915",
      domain: 0,
      family: "Sub-GHz",
    }),
    Object.freeze({
      key: "FCC_915",
      label: "FCC 915 MHz",
      artifactDirectory: "FCC",
      domain: 1,
      family: "Sub-GHz",
    }),
    Object.freeze({
      key: "EU_868",
      label: "EU 868 MHz",
      artifactDirectory: "EU_868",
      domain: 2,
      family: "Sub-GHz",
    }),
    Object.freeze({
      key: "IN_866",
      label: "India 866 MHz",
      artifactDirectory: "IN_866",
      domain: 3,
      family: "Sub-GHz",
    }),
    Object.freeze({
      key: "AU_433",
      label: "Australia 433 MHz",
      artifactDirectory: "AU_433",
      domain: 4,
      family: "433MHz",
    }),
    Object.freeze({
      key: "EU_433",
      label: "EU 433 MHz",
      artifactDirectory: "EU_433",
      domain: 5,
      family: "433MHz",
    }),
    Object.freeze({
      key: "US_433",
      label: "US 433 MHz",
      artifactDirectory: "US_433",
      domain: 6,
      family: "433MHz",
    }),
  ]);

export function regulatoryRegionsForRadioKey(
  radioKey: string,
): readonly ExpressLrsRegulatoryRegion[] {
  const normalized = radioKey.toLocaleLowerCase("en-US");
  const family: ExpressLrsRegulatoryRegion["family"] =
    normalized.includes("2400") || normalized.includes("2g4")
      ? "2.4GHz"
      : normalized.includes("433")
        ? "433MHz"
        : "Sub-GHz";
  return Object.freeze(
    EXPRESSLRS_REGULATORY_REGIONS.filter((region) => region.family === family),
  );
}

export function regulatoryRegionByKey(
  key: string,
): ExpressLrsRegulatoryRegion | null {
  return (
    EXPRESSLRS_REGULATORY_REGIONS.find((region) => region.key === key) ?? null
  );
}
