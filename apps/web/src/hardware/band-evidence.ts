import type { CrsfParameter } from "./crsf";
import type { TargetMatchResult } from "./target-match";

/**
 * The band a Target's radio key names. Coarse on purpose: a 900 MHz and a
 * 433 MHz build are both sub-GHz hardware and neither belongs on a 2.4 GHz
 * device, which is the one distinction a firmware write must never get wrong.
 */
export type BandFamily = "2.4GHz" | "Sub-GHz" | "Dual-Band";

export function bandFamilyForRadioKey(radioKey: string): BandFamily | null {
  const key = radioKey.toLocaleLowerCase("en-US");
  if (key.includes("dual")) return "Dual-Band";
  if (key.includes("2400") || key.includes("2g4")) return "2.4GHz";
  if (key.includes("900") || key.includes("433")) return "Sub-GHz";
  return null;
}

/**
 * The regulatory-domain names exactly as the pinned firmware prints them
 * (`ExpressLRS@a9d4a9cb` `src/lib/FHSS/FHSS.cpp`, `domains[]` and
 * `domainsDualBand[]`).
 */
const SUB_GHZ_DOMAINS: ReadonlySet<string> = new Set([
  "AU915",
  "FCC915",
  "EU868",
  "IN866",
  "AU433",
  "EU433",
  "US433",
  "US433W",
]);
const HIGH_BAND_DOMAINS: ReadonlySet<string> = new Set(["ISM2G4", "CE_LBT"]);

export function bandFamilyForDomain(domain: string): BandFamily | null {
  const name = domain.trim().toUpperCase();
  if (SUB_GHZ_DOMAINS.has(name)) return "Sub-GHz";
  if (HIGH_BAND_DOMAINS.has(name)) return "2.4GHz";
  return null;
}

/**
 * Reads the band out of the version string a device reports over CRSF.
 *
 * `FHSS.cpp` `addDomainInfo()` builds it as `<version> <domain>` for a single
 * band device and `<version> <sub-GHz domain>/<2.4 GHz domain>` for a
 * dual-band one, and both the transmitter and the receiver publish it as the
 * name of an `INFO` parameter (`TXModuleParameters.cpp`, `RXParameters.cpp`:
 * `luaELRSversion`). Anything that is not a known domain — the `Bad/Good`
 * counters, a commit hash — is not band evidence and yields null.
 */
export function bandFromVersionDomain(
  value: string,
): Readonly<{ band: BandFamily; domain: string }> | null {
  const match = /^\s*\S+\s+([A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)?)\s*$/u.exec(
    value,
  );
  if (match === null) return null;
  const domain = match[1] ?? "";
  const parts = domain.split("/");
  if (parts.length === 2) {
    const low = bandFamilyForDomain(parts[0] ?? "");
    const high = bandFamilyForDomain(parts[1] ?? "");
    return low === "Sub-GHz" && high === "2.4GHz"
      ? Object.freeze({ band: "Dual-Band" as const, domain })
      : null;
  }
  const band = bandFamilyForDomain(domain);
  return band === null ? null : Object.freeze({ band, domain });
}

export interface DeviceBandEvidence {
  readonly band: BandFamily;
  /** Where the band was read from, so a refusal can say so. */
  readonly source: "REGULATORY_DOMAIN" | "EXACT_TARGET_MATCH";
  /** The domain name or radio key the band was read from. */
  readonly detail: string;
}

/**
 * What the connected device itself says about its band.
 *
 * The regulatory domain the firmware reports is protocol evidence and wins;
 * an exact product-name match against the catalog is the fallback. A device
 * that reports neither has no band evidence, and the caller must not treat
 * that as agreement — only as the absence of a contradiction.
 */
export function deviceBandEvidence(input: {
  readonly parameters: readonly CrsfParameter[];
  readonly match: TargetMatchResult | null;
}): DeviceBandEvidence | null {
  for (const parameter of input.parameters) {
    if (parameter.kind !== "info") continue;
    for (const text of [parameter.name, parameter.value]) {
      const parsed = bandFromVersionDomain(text);
      if (parsed !== null) {
        return Object.freeze({
          band: parsed.band,
          source: "REGULATORY_DOMAIN",
          detail: parsed.domain,
        });
      }
    }
  }
  const match = input.match;
  if (match?.confidence === "EXACT" && match.selected !== null) {
    const band = bandFamilyForRadioKey(match.selected.radioKey);
    if (band !== null) {
      return Object.freeze({
        band,
        source: "EXACT_TARGET_MATCH",
        detail: match.selected.radioKey,
      });
    }
  }
  return null;
}

/**
 * True only when the device's band is known and differs from the Target's.
 * Unknown on either side is not a mismatch; it leaves the operator's Target
 * confirmation as the remaining safeguard.
 */
export function bandKnownToMismatch(
  device: DeviceBandEvidence | null,
  targetRadioKey: string | null,
): boolean {
  if (device === null || targetRadioKey === null) return false;
  const target = bandFamilyForRadioKey(targetRadioKey);
  return target !== null && target !== device.band;
}
