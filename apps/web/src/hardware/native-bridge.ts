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
