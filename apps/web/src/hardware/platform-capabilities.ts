/**
 * What this browser can actually do, read from the APIs themselves.
 *
 * Nothing here is inferred from a screen size or a user-agent string alone: a
 * narrow window on a laptop is not a phone, and a phone that gained an API is
 * not blocked by a name. The device paths are decided by whether the API
 * object exists, which is the only thing that determines whether a port can be
 * opened.
 */
export interface PlatformCapabilities {
  /** Web Serial: the CRSF path and the ESP/XMODEM flashing path. */
  readonly webSerial: boolean;
  /** WebUSB: the STM32 DFU path. */
  readonly webUsb: boolean;
  /** Both APIs require a secure context; without it neither is present. */
  readonly secureContext: boolean;
  /** A native host has injected a bridge implementing the device contract. */
  readonly nativeBridge: boolean;
  /** Reported by the platform, used only to word the explanation. */
  readonly platformHint: string;
  /** Running as an installed app rather than a browser tab. */
  readonly standalone: boolean;
}

/** Why a device path is unavailable, in terms the operator can act on. */
export type DevicePathBlocker =
  /** The page is not in a secure context, so neither API is exposed. */
  | "INSECURE_CONTEXT"
  /** The browser exposes neither Web Serial nor a native bridge. */
  | "NO_SERIAL_TRANSPORT"
  /** Serial is unavailable but WebUSB is, so only DFU could work. */
  | "USB_ONLY";

interface CapabilityGlobals {
  readonly navigator?: {
    readonly serial?: unknown;
    readonly usb?: unknown;
    readonly userAgentData?: { readonly platform?: unknown };
  };
  readonly isSecureContext?: unknown;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
  readonly elrsNativeBridge?: unknown;
}

export function readPlatformCapabilities(
  scope: unknown = globalThis,
): PlatformCapabilities {
  const global = (scope ?? {}) as CapabilityGlobals;
  const navigatorObject = global.navigator;
  const platform = navigatorObject?.userAgentData?.platform;
  let standalone = false;
  try {
    standalone =
      typeof global.matchMedia === "function" &&
      global.matchMedia("(display-mode: standalone)").matches;
  } catch {
    // A host that refuses matchMedia tells us nothing; it is not standalone.
  }
  return Object.freeze({
    webSerial: navigatorObject?.serial !== undefined,
    webUsb: navigatorObject?.usb !== undefined,
    secureContext: global.isSecureContext === true,
    nativeBridge: global.elrsNativeBridge !== undefined,
    platformHint: typeof platform === "string" ? platform : "unknown",
    standalone,
  });
}

/**
 * The reason the direct device path cannot run here, or null when it can.
 * A native bridge counts: it implements the same device contract, so a host
 * that provides one is not blocked even without Web Serial.
 */
export function devicePathBlocker(
  capabilities: PlatformCapabilities,
): DevicePathBlocker | null {
  if (capabilities.webSerial || capabilities.nativeBridge) return null;
  if (!capabilities.secureContext) return "INSECURE_CONTEXT";
  return capabilities.webUsb ? "USB_ONLY" : "NO_SERIAL_TRANSPORT";
}
