import type { OfficialTarget } from "./parity-types";

/**
 * Running a receiver as a transmitter — ExpressLRS' `--rx-as-tx` option.
 *
 * This is **not** AirPort. The two are separate upstream features that happen
 * to both involve a receiver's serial port:
 *
 * - `--rx-as-tx {internal,external}` flashes **TX firmware** onto receiver
 *   hardware, so the device changes role. Upstream selects a different
 *   firmware artifact (`_RX` → `_TX`) and rewrites the hardware layout.
 * - `--airport-baud N` sets `is-airport` in the options block, turning a
 *   device into a transparent serial bridge. It never changes the role, and
 *   `--rx-as-tx` never sets it.
 *
 * Conflating them produces firmware that is still a receiver. Everything
 * below is derived from the pinned upstream sources, cited per rule:
 *
 * - `ExpressLRS/ExpressLRS` @ 73ce820ba51437f73f31686233b607c58e188e7b
 *   (`src/python/binary_configurator.py`, `src/python/UnifiedConfiguration.py`)
 * - `ExpressLRS/ExpressLRS-Configurator` @ 421d656f1987117e37472979444cee464e3fcdef
 *   (`src/api/src/factories/TargetUserDefinesFactory.ts`,
 *    `src/api/src/services/BinaryFlashingStrategy/index.ts`)
 */

/** `off` is the absence of the flag; the other two are upstream's `TXType`. */
export type RxAsTxMode = "off" | "internal" | "external";

/** The modes upstream's `TXType` enum can actually take. */
export type RxAsTxActiveMode = Exclude<RxAsTxMode, "off">;

export const RX_AS_TX_ACTIVE_MODES: readonly RxAsTxActiveMode[] = Object.freeze(
  ["internal", "external"],
);

export type RxAsTxUnsupportedReason =
  /** No official Target has been chosen yet, so nothing can be decided. */
  | "NO_TARGET_SELECTED"
  /** The chosen Target is already a transmitter; there is no role to change. */
  | "TARGET_IS_TRANSMITTER"
  /** The platform is outside upstream's `esp32*` / `esp8285*` gate. */
  | "PLATFORM_UNSUPPORTED"
  /** The platform supports the feature, but not in the requested mode. */
  | "MODE_UNSUPPORTED_BY_PLATFORM"
  /** The Target names no `_RX` artifact, so no `_TX` build can be selected. */
  | "NO_TX_ARTIFACT";

export type RxAsTxSupport =
  | Readonly<{
      supported: true;
      targetName: string;
      platform: string;
      /** The modes this Target accepts, for a UI that offers a choice. */
      availableModes: readonly RxAsTxActiveMode[];
    }>
  | Readonly<{
      supported: false;
      reason: RxAsTxUnsupportedReason;
      /** The Target this answer is about, so the message can name it. */
      targetName: string;
      /** The platform string the catalog reported, for the same reason. */
      platform: string;
      /** Empty when nothing is possible; otherwise what *is* offered. */
      availableModes: readonly RxAsTxActiveMode[];
    }>;

/**
 * Which modes a platform accepts.
 *
 * `binary_configurator.py:238` reads
 *
 * ```python
 * if config['platform'].startswith('esp32') or config['platform'].startswith('esp8285') and args.rx_as_tx == TXType.internal:
 * ```
 *
 * `and` binds tighter than `or` in Python, so that is
 * `esp32* OR (esp8285* AND internal)` — every ESP32 variant takes both modes,
 * ESP8285 takes internal only, and everything else (ESP8266 and STM32
 * included) falls to the `exit(1)` branch. The Configurator reaches the same
 * answer independently in `TargetUserDefinesFactory.ts:92-100`.
 *
 * The comparison is deliberately made against the raw platform string rather
 * than a lowercased copy, because upstream's `startswith` is case-sensitive
 * and parity is the point.
 */
export function rxAsTxModesForPlatform(
  platform: string,
): readonly RxAsTxActiveMode[] {
  if (platform.startsWith("esp32")) return RX_AS_TX_ACTIVE_MODES;
  if (platform.startsWith("esp8285")) return Object.freeze(["internal"]);
  return Object.freeze([]);
}

/**
 * The TX artifact upstream selects for a receiver.
 *
 * `binary_configurator.py:239` is `file.replace('_RX', '_TX')`, and Python's
 * `str.replace` rewrites **every** occurrence, so this uses `replaceAll`
 * rather than JavaScript's first-match `replace`.
 */
export function rxAsTxFirmwareArtifact(firmware: string): string {
  return firmware.replaceAll("_RX", "_TX");
}

export function evaluateRxAsTxSupport(input: {
  readonly target: OfficialTarget | null;
  /** The mode being asked about. Omit to ask whether *any* mode is possible. */
  readonly mode?: RxAsTxActiveMode;
}): RxAsTxSupport {
  const target = input.target;
  if (target === null) {
    return Object.freeze({
      supported: false as const,
      reason: "NO_TARGET_SELECTED" as const,
      targetName: "",
      platform: "",
      availableModes: Object.freeze([]),
    });
  }
  const targetName = target.config.productName;
  const platform = target.config.platform;
  const availableModes = rxAsTxModesForPlatform(platform);
  const deny = (reason: RxAsTxUnsupportedReason): RxAsTxSupport =>
    Object.freeze({
      supported: false as const,
      reason,
      targetName,
      platform,
      availableModes,
    });

  if (target.role !== "rx") return deny("TARGET_IS_TRANSMITTER");
  if (availableModes.length === 0) return deny("PLATFORM_UNSUPPORTED");
  if (input.mode !== undefined && !availableModes.includes(input.mode)) {
    return deny("MODE_UNSUPPORTED_BY_PLATFORM");
  }
  // Upstream replaces `_RX` unconditionally, so a Target whose artifact has no
  // `_RX` in it silently keeps the receiver build and gets flashed as though it
  // were a transmitter. That is a deliberate divergence: refuse instead, and
  // say why, rather than write receiver firmware and call the device a
  // transmitter.
  if (
    rxAsTxFirmwareArtifact(target.config.firmware) === target.config.firmware
  ) {
    return deny("NO_TX_ARTIFACT");
  }
  return Object.freeze({
    supported: true as const,
    targetName,
    platform,
    availableModes,
  });
}

export class RxAsTxLayoutError extends Error {
  public constructor(
    public readonly reason: "LAYOUT_HAS_NO_SERIAL_PINS",
    message: string,
  ) {
    super(message);
    this.name = "RxAsTxLayoutError";
  }
}

/**
 * The hardware-layout rewrite from `UnifiedConfiguration.py:59-67`.
 *
 * ```python
 * if rx_as_tx is not None:
 *     if 'serial_rx' not in hardware or 'serial_tx' not in hardware:
 *         sys.stderr.write(f'Cannot select this target as RX-as-TX\n')
 *         exit(1)
 *     if rx_as_tx == TXType.external and hardware['serial_rx']:
 *         hardware['serial_rx'] = hardware['serial_tx']
 *     if 'led_red' not in hardware and 'led' in hardware:
 *         hardware['led_red'] = hardware['led']
 *         del hardware['led']
 * ```
 *
 * Two details are easy to lose and are reproduced exactly:
 *
 * - The external remap is guarded by the *truthiness* of `serial_rx`, so a
 *   layout whose receive pin is GPIO `0` is left alone.
 * - The LED remap applies to both modes, not just external.
 *
 * The layout itself stays the receiver's: `UnifiedConfiguration.py:229` picks
 * the directory from the unmutated catalog entry, which still names an `_RX`
 * artifact, so upstream reads `hardware/RX/<layout_file>` even while flashing
 * the TX build.
 */
export function applyRxAsTxLayout(
  layout: Readonly<Record<string, unknown>>,
  mode: RxAsTxActiveMode,
): Readonly<Record<string, unknown>> {
  if (!("serial_rx" in layout) || !("serial_tx" in layout)) {
    throw new RxAsTxLayoutError(
      "LAYOUT_HAS_NO_SERIAL_PINS",
      "Cannot select this target as RX-as-TX: its hardware layout declares no serial_rx/serial_tx pair",
    );
  }
  const next: Record<string, unknown> = { ...layout };
  if (mode === "external" && Boolean(next["serial_rx"])) {
    next["serial_rx"] = next["serial_tx"];
  }
  if (!("led_red" in next) && "led" in next) {
    next["led_red"] = next["led"];
    delete next["led"];
  }
  return Object.freeze(next);
}
