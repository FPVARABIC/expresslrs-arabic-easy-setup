import type { OfficialRelease, OfficialTarget } from "./parity-types";

/**
 * Running a receiver as a transmitter is ExpressLRS' AirPort mode, carried by
 * the `is-airport` option.
 *
 * Whether a given device can take it is not a project decision — it follows
 * from where that option physically lands in the firmware:
 *
 * - **ESP receivers** are configured through a JSON options block, which
 *   carries arbitrary keys including `is-airport`.
 * - **STM32 receivers** are configured through a packed binary block whose
 *   receiver flags are three fixed bits — invert-TX, lock-on-first-connection
 *   and R9MM mini SBUS. There is no field for AirPort, so the option cannot be
 *   written to one at all.
 *
 * So the answer is derived from the target, never from the build's phase, and
 * an unsupported target is told exactly which field is missing.
 */
export type RxAsTxUnsupportedReason =
  /** No official Target has been chosen yet, so nothing can be decided. */
  | "NO_TARGET_SELECTED"
  /** The chosen Target is a transmitter; there is no receiver to repurpose. */
  | "TARGET_IS_TRANSMITTER"
  /** The platform's configuration block has no AirPort field. */
  | "PLATFORM_HAS_NO_AIRPORT_FIELD"
  /** The platform is not one this application can configure at all. */
  | "PLATFORM_UNKNOWN"
  /** The selected release predates AirPort. */
  | "RELEASE_TOO_OLD";

export type RxAsTxSupport =
  | Readonly<{ supported: true; targetName: string }>
  | Readonly<{
      supported: false;
      reason: RxAsTxUnsupportedReason;
      /** The Target this answer is about, so the message can name it. */
      targetName: string;
      /** The platform string the catalog reported, for the same reason. */
      platform: string;
    }>;

/** AirPort landed in ExpressLRS 3.0. */
const MINIMUM_AIRPORT_RELEASE = [3, 0, 0] as const;

function releaseAtLeast(
  label: string,
  minimum: readonly [number, number, number],
): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(label.trim());
  if (match === null) return false;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  for (const [index, floor] of minimum.entries()) {
    const part = parts[index] ?? 0;
    if (part > floor) return true;
    if (part < floor) return false;
  }
  return true;
}

/** Which configuration block a platform uses, or null when unrecognised. */
function configurationBlock(platform: string): "json" | "packed" | null {
  const normalized = platform.toLocaleLowerCase("en-US");
  if (normalized.includes("8285") || normalized.includes("8266")) return "json";
  if (normalized.startsWith("esp32")) return "json";
  if (normalized.startsWith("stm32")) return "packed";
  return null;
}

export function evaluateRxAsTxSupport(input: {
  readonly target: OfficialTarget | null;
  readonly release: OfficialRelease | null;
}): RxAsTxSupport {
  const target = input.target;
  if (target === null) {
    return Object.freeze({
      supported: false as const,
      reason: "NO_TARGET_SELECTED" as const,
      targetName: "",
      platform: "",
    });
  }
  const targetName = target.config.productName;
  const platform = target.config.platform;
  if (target.role !== "rx") {
    return Object.freeze({
      supported: false as const,
      reason: "TARGET_IS_TRANSMITTER" as const,
      targetName,
      platform,
    });
  }
  const block = configurationBlock(platform);
  if (block === null) {
    return Object.freeze({
      supported: false as const,
      reason: "PLATFORM_UNKNOWN" as const,
      targetName,
      platform,
    });
  }
  if (block === "packed") {
    return Object.freeze({
      supported: false as const,
      reason: "PLATFORM_HAS_NO_AIRPORT_FIELD" as const,
      targetName,
      platform,
    });
  }
  if (
    input.release !== null &&
    !releaseAtLeast(input.release.label, MINIMUM_AIRPORT_RELEASE)
  ) {
    return Object.freeze({
      supported: false as const,
      reason: "RELEASE_TOO_OLD" as const,
      targetName,
      platform,
    });
  }
  return Object.freeze({ supported: true as const, targetName });
}
