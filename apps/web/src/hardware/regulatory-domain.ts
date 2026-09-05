export interface ExpressLrsRegulatoryRegion {
  readonly key: string;
  readonly label: string;
  readonly artifactDirectory: string;
  readonly domain: number;
  readonly family: "2.4GHz" | "Sub-GHz" | "433MHz" | "Dual-Band";
}

/**
 * Numeric values follow the ExpressLRS 4.1 regulatory-domain enumeration used
 * by the mirrored stable assets. Focused tests lock this reviewed mapping;
 * newer upstream domains require an explicit release-aware review.
 */
const HIGH_BAND_REGIONS = Object.freeze([
  Object.freeze({
    key: "FCC_2400",
    label: "FCC / ISM 2.4 GHz",
    artifactDirectory: "FCC",
    domain: 0,
    family: "2.4GHz",
  }),
  Object.freeze({
    key: "EU_CE_2400",
    label: "EU CE 2.4 GHz",
    artifactDirectory: "LBT",
    domain: 0,
    family: "2.4GHz",
  }),
] satisfies readonly ExpressLrsRegulatoryRegion[]);

const LOW_BAND_REGIONS = Object.freeze([
  Object.freeze({
    key: "AU_915",
    label: "Australia 915 MHz",
    artifactDirectory: "FCC",
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
    artifactDirectory: "FCC",
    domain: 2,
    family: "Sub-GHz",
  }),
  Object.freeze({
    key: "IN_866",
    label: "India 866 MHz",
    artifactDirectory: "FCC",
    domain: 3,
    family: "Sub-GHz",
  }),
  Object.freeze({
    key: "AU_433",
    label: "Australia 433 MHz",
    artifactDirectory: "FCC",
    domain: 4,
    family: "433MHz",
  }),
  Object.freeze({
    key: "EU_433",
    label: "EU 433 MHz",
    artifactDirectory: "FCC",
    domain: 5,
    family: "433MHz",
  }),
  Object.freeze({
    key: "US_433",
    label: "US 433 MHz",
    artifactDirectory: "FCC",
    domain: 6,
    family: "433MHz",
  }),
  Object.freeze({
    key: "US_433_WIDE",
    label: "US 433 MHz Wide",
    artifactDirectory: "FCC",
    domain: 7,
    family: "433MHz",
  }),
] satisfies readonly ExpressLrsRegulatoryRegion[]);

const DUAL_BAND_REGIONS = Object.freeze(
  HIGH_BAND_REGIONS.flatMap((highBand) =>
    LOW_BAND_REGIONS.map((lowBand) =>
      Object.freeze({
        key: `DUAL_${highBand.artifactDirectory}_${lowBand.key}`,
        label: `${highBand.label} + ${lowBand.label}`,
        artifactDirectory: highBand.artifactDirectory,
        domain: lowBand.domain,
        family: "Dual-Band" as const,
      }),
    ),
  ),
);

export const EXPRESSLRS_REGULATORY_REGIONS: readonly ExpressLrsRegulatoryRegion[] =
  Object.freeze([
    ...HIGH_BAND_REGIONS,
    ...LOW_BAND_REGIONS,
    ...DUAL_BAND_REGIONS,
  ]);

export function regulatoryRegionsForRadioKey(
  radioKey: string,
): readonly ExpressLrsRegulatoryRegion[] {
  const normalized = radioKey.toLocaleLowerCase("en-US");
  const families: readonly ExpressLrsRegulatoryRegion["family"][] =
    normalized.includes("dual")
      ? ["Dual-Band"]
      : normalized.includes("2400") || normalized.includes("2g4")
        ? ["2.4GHz"]
        : normalized.includes("900")
          ? ["Sub-GHz", "433MHz"]
          : normalized.includes("433")
            ? ["433MHz"]
            : [];
  return Object.freeze(
    EXPRESSLRS_REGULATORY_REGIONS.filter((region) =>
      families.includes(region.family),
    ),
  );
}

export function regulatoryRegionByKey(
  key: string,
): ExpressLrsRegulatoryRegion | null {
  return (
    EXPRESSLRS_REGULATORY_REGIONS.find((region) => region.key === key) ?? null
  );
}
