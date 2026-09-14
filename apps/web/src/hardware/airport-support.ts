import type { OfficialTarget } from "./parity-types";

/**
 * Whether AirPort can be written into a package for this Target.
 *
 * Upstream's Python configurator patches `is_airport` into an STM32 image
 * (`binary_configurator.py` `patch_rx_params` / `patch_tx_params` at 3.6.4),
 * but the pinned official web flasher — the code this application's STM32
 * packaging is a port of — does not: `configure.js` `#configureSTM32` writes
 * the domain, the UID, the flash discriminator, the fan runtime and the RX/TX
 * parameters, and no AirPort bit. An option that is accepted and then not
 * encoded would be reported as applied without ever reaching the device, so
 * for STM32 it is refused by name instead. ESP targets carry `is-airport` in
 * their options JSON exactly as the configurator writes it.
 */
export type AirportSupport =
  | Readonly<{ supported: true }>
  | Readonly<{
      supported: false;
      reason: "PLATFORM_NOT_ENCODED";
      targetName: string;
      platform: string;
    }>;

export function evaluateAirportSupport(
  target: OfficialTarget | null,
): AirportSupport {
  if (target === null) return Object.freeze({ supported: true as const });
  const platform = target.config.platform.toLocaleLowerCase("en-US");
  if (platform.startsWith("stm32")) {
    return Object.freeze({
      supported: false as const,
      reason: "PLATFORM_NOT_ENCODED" as const,
      targetName: target.config.productName,
      platform: target.config.platform,
    });
  }
  return Object.freeze({ supported: true as const });
}
