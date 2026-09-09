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
  /** True when the platform reports itself as Android. */
  readonly android: boolean;
  /** The browser's own version claim, e.g. "Chrome 154". Empty when unknown. */
  readonly browserVersion: string;
  /**
   * Whether the page may call the device-permission APIs at all. A page whose
   * Permissions-Policy withholds `serial` sees the API but is refused on use,
   * which looks like a broken device rather than a policy decision.
   */
  readonly serialPolicyAllowed: boolean | null;
  readonly usbPolicyAllowed: boolean | null;
  /**
   * How many devices the user has already granted this origin. Zero is normal
   * before the first grant and is not a failure; null means the browser would
   * not answer.
   */
  readonly grantedSerialPorts: number | null;
  readonly grantedUsbDevices: number | null;
}

/** Why a device path is unavailable, in terms the operator can act on. */
export type DevicePathBlocker =
  /** The page is not in a secure context, so neither API is exposed. */
  | "INSECURE_CONTEXT"
  /** The browser exposes neither Web Serial nor a native bridge. */
  | "NO_SERIAL_TRANSPORT"
  /** Serial is unavailable but WebUSB is, so only DFU could work. */
  | "USB_ONLY";

interface UserAgentBrand {
  readonly brand?: unknown;
  readonly version?: unknown;
}

interface CapabilityGlobals {
  readonly navigator?: {
    readonly serial?: unknown;
    readonly usb?: unknown;
    readonly userAgent?: unknown;
    readonly userAgentData?: {
      readonly platform?: unknown;
      readonly mobile?: unknown;
      readonly brands?: unknown;
    };
    readonly permissions?: unknown;
  };
  readonly isSecureContext?: unknown;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
  readonly document?: {
    readonly featurePolicy?: { allowsFeature?: (name: string) => boolean };
    readonly permissionsPolicy?: { allowsFeature?: (name: string) => boolean };
  };
  readonly elrsNativeBridge?: unknown;
}

/**
 * The browser's own version claim. `userAgentData.brands` is preferred because
 * it is structured and is not the frozen legacy string; the user-agent string
 * is only parsed as a fallback, and only for the browser name and version.
 */
function readBrowserVersion(navigatorObject: CapabilityGlobals["navigator"]) {
  const brands = navigatorObject?.userAgentData?.brands;
  if (Array.isArray(brands)) {
    const real = (brands as UserAgentBrand[]).find(
      (brand) =>
        typeof brand.brand === "string" &&
        // Chromium ships a deliberate decoy brand; it is not a browser.
        !/not.*a.*brand/iu.test(brand.brand),
    );
    if (real !== undefined) {
      return `${String(real.brand)} ${String(real.version ?? "")}`.trim();
    }
  }
  const agent = navigatorObject?.userAgent;
  if (typeof agent !== "string") return "";
  const match = /(Chrome|CriOS|Edg|OPR|Firefox|Version)\/(\d+[\d.]*)/u.exec(
    agent,
  );
  return match === null ? "" : `${match[1]} ${match[2]}`;
}

/**
 * Whether a permissions-policy-controlled feature is allowed for this
 * document. Returns null when the browser exposes no way to ask, rather than
 * guessing an answer.
 */
function readPolicyAllowance(
  global: CapabilityGlobals,
  feature: string,
): boolean | null {
  const policy =
    global.document?.permissionsPolicy ?? global.document?.featurePolicy;
  if (policy === undefined || typeof policy.allowsFeature !== "function") {
    return null;
  }
  try {
    return policy.allowsFeature(feature);
  } catch {
    return null;
  }
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
  const agent = navigatorObject?.userAgent;
  return Object.freeze({
    webSerial: navigatorObject?.serial !== undefined,
    webUsb: navigatorObject?.usb !== undefined,
    secureContext: global.isSecureContext === true,
    nativeBridge: global.elrsNativeBridge !== undefined,
    platformHint: typeof platform === "string" ? platform : "unknown",
    standalone,
    android:
      (typeof platform === "string" && /android/iu.test(platform)) ||
      (typeof agent === "string" && /android/iu.test(agent)),
    browserVersion: readBrowserVersion(navigatorObject),
    serialPolicyAllowed: readPolicyAllowance(global, "serial"),
    usbPolicyAllowed: readPolicyAllowance(global, "usb"),
    grantedSerialPorts: null,
    grantedUsbDevices: null,
  });
}

/**
 * Asks the browser how many devices this origin has already been granted.
 *
 * This is the closest a page can get to "is a device attached": neither Web
 * Serial nor WebUSB exposes OTG state or an unprompted device list, and both
 * deliberately return only what the user has already permitted. Zero is the
 * normal answer before a first grant and means nothing is wrong. It must be
 * awaited, so it is a separate call rather than part of the synchronous read.
 */
export async function readGrantedDevices(
  capabilities: PlatformCapabilities,
  scope: unknown = globalThis,
): Promise<PlatformCapabilities> {
  const navigatorObject = ((scope ?? {}) as CapabilityGlobals).navigator as
    | {
        serial?: { getPorts?: () => Promise<readonly unknown[]> };
        usb?: { getDevices?: () => Promise<readonly unknown[]> };
      }
    | undefined;
  async function count(
    list: (() => Promise<readonly unknown[]>) | undefined,
  ): Promise<number | null> {
    if (typeof list !== "function") return null;
    try {
      return (await list()).length;
    } catch {
      // A refusal is an answer we cannot report as a number.
      return null;
    }
  }
  return Object.freeze({
    ...capabilities,
    grantedSerialPorts: await count(
      navigatorObject?.serial?.getPorts?.bind(navigatorObject.serial),
    ),
    grantedUsbDevices: await count(
      navigatorObject?.usb?.getDevices?.bind(navigatorObject.usb),
    ),
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
