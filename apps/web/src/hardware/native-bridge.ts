import type { HardwareSerialPort } from "./serial";

/**
 * The seam a native host implements to make this application work where the
 * browser has no Web Serial.
 *
 * It is deliberately the narrowest useful contract: a Web Serial-shaped port
 * factory. The native side only has to open a USB serial device and move
 * bytes — everything above it (CRSF framing, identity, parameter reads and
 * writes, ESP flashing, XMODEM, passthrough, recovery) is the same code that
 * runs in a desktop browser, so a bridged session cannot drift away from the
 * behaviour that was reviewed and tested.
 *
 * A host injects it as `globalThis.elrsNativeBridge` before the application
 * loads. It is untrusted input: the shape is validated before it is used, and
 * a malformed bridge is ignored rather than half-trusted.
 */
export interface NativeHardwareBridge {
  readonly version: 1;
  readonly serial: {
    requestPort(options?: unknown): Promise<HardwareSerialPort>;
    getPorts?(): Promise<readonly HardwareSerialPort[]>;
  };
  /** What the host was built from. Absent on a host that does not report it. */
  readonly host?: NativeHostIdentity;
}

/**
 * The digests an installed native host was built from.
 *
 * A packaged host serves the web application from inside itself, so "which
 * build is this" cannot be answered from the URL the way it can in a browser.
 * These are recorded at build time and shown in diagnostics, so a report from
 * an installed APK names the exact web and native sources behind it.
 */
export interface NativeHostIdentity {
  /** Digest over every bundled web file. */
  readonly webBuildSha256: string | null;
  /** Digest over the host's own sources. */
  readonly nativeSourceSha256: string | null;
  /**
   * Whether the host could install its device bridge, and if not, exactly what
   * stopped it. An unavailable bridge stays visible with its reason rather than
   * appearing as a device that is simply never found.
   */
  readonly bridge: string | null;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

/**
 * Returns the injected bridge only when it declares a version this build
 * understands and exposes a usable port factory.
 */
export function readNativeHardwareBridge(
  scope: unknown = globalThis,
): NativeHardwareBridge | null {
  const candidate = (scope as { elrsNativeBridge?: unknown } | null | undefined)
    ?.elrsNativeBridge;
  if (candidate === null || typeof candidate !== "object") return null;
  const bridge = candidate as Partial<NativeHardwareBridge>;
  if (bridge.version !== 1) return null;
  const serial = bridge.serial;
  if (serial === undefined || typeof serial !== "object") return null;
  if (!isFunction((serial as { requestPort?: unknown }).requestPort)) {
    return null;
  }
  return bridge as NativeHardwareBridge;
}

function digestOrNull(value: unknown): string | null {
  // A digest is 64 lowercase hex characters, or the literal the build writes
  // when there was nothing to hash. Anything else is a host reporting garbage
  // and is dropped rather than displayed as though it identified something.
  if (typeof value !== "string") return null;
  if (value === "absent") return value;
  return /^[0-9a-f]{64}$/u.test(value) ? value : null;
}

/**
 * Reads the host's build identity, validating every field.
 *
 * The bridge is injected by the host and is therefore untrusted input in the
 * same way the rest of it is: a malformed identity is reported as unknown, not
 * rendered as fact.
 */
export function readNativeHostIdentity(
  scope: unknown = globalThis,
): NativeHostIdentity | null {
  const bridge = readNativeHardwareBridge(scope);
  if (bridge === null) return null;
  const host = bridge.host;
  if (host === undefined || typeof host !== "object") return null;
  const candidate = host as Partial<NativeHostIdentity>;
  const identity: NativeHostIdentity = Object.freeze({
    webBuildSha256: digestOrNull(candidate.webBuildSha256),
    nativeSourceSha256: digestOrNull(candidate.nativeSourceSha256),
    bridge:
      typeof candidate.bridge === "string" &&
      /^[A-Z_]{1,64}$/u.test(candidate.bridge)
        ? candidate.bridge
        : null,
  });
  // A host that reports nothing usable is the same as one that reports nothing.
  return identity.webBuildSha256 === null &&
    identity.nativeSourceSha256 === null &&
    identity.bridge === null
    ? null
    : identity;
}

/**
 * Adapts a bridge into the `navigatorObject` the session layer already accepts,
 * so the native path reuses every existing device code path rather than adding
 * a second one.
 */
export function nativeBridgeNavigator(bridge: NativeHardwareBridge): {
  readonly serial: NativeHardwareBridge["serial"];
} {
  return Object.freeze({ serial: bridge.serial });
}
