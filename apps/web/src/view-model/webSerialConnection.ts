export const webSerialReadOnlyBaudRate = 115_200 as const;

export interface WebSerialPortInfo {
  readonly usbVendorId: number | null;
  readonly usbProductId: number | null;
}

export interface WebSerialPort {
  ondisconnect?: ((event: Event) => void) | null;
  open(options: { readonly baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?(): {
    readonly usbVendorId?: number;
    readonly usbProductId?: number;
  };
}

interface WebSerialApi {
  requestPort(): Promise<WebSerialPort>;
}

interface NavigatorWithSerial {
  readonly serial?: WebSerialApi;
}

export type WebSerialConnectOutcome =
  | {
      readonly status: "CONNECTED";
      readonly port: WebSerialPort;
      readonly info: WebSerialPortInfo;
      readonly baudRate: number;
    }
  | {
      readonly status:
        | "UNSUPPORTED"
        | "INSECURE_CONTEXT"
        | "CANCELLED"
        | "PERMISSION_DENIED"
        | "OPEN_FAILED";
    };

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "";
}

function safeUsbIdentifier(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function readPortInfo(port: WebSerialPort): WebSerialPortInfo {
  if (typeof port.getInfo !== "function") {
    return Object.freeze({ usbVendorId: null, usbProductId: null });
  }

  try {
    const info = port.getInfo();
    return Object.freeze({
      usbVendorId: safeUsbIdentifier(info.usbVendorId),
      usbProductId: safeUsbIdentifier(info.usbProductId),
    });
  } catch {
    return Object.freeze({ usbVendorId: null, usbProductId: null });
  }
}

function normalizeBaudRate(value: unknown): number {
  return Number.isSafeInteger(value) &&
    (value as number) >= 1_200 &&
    (value as number) <= 4_000_000
    ? (value as number)
    : webSerialReadOnlyBaudRate;
}

/**
 * Opens a user-selected Web Serial port without writing a single byte.
 * Success proves only that the browser transport opened; it does not prove
 * that the selected device is ExpressLRS or that any target is compatible.
 */
export async function connectWebSerialReadOnly(input: {
  readonly navigatorObject?: unknown;
  readonly secureContext?: boolean;
  readonly baudRate?: number;
} = {}): Promise<WebSerialConnectOutcome> {
  const secureContext =
    input.secureContext ??
    (typeof globalThis.isSecureContext === "boolean"
      ? globalThis.isSecureContext
      : false);
  if (!secureContext) {
    return Object.freeze({ status: "INSECURE_CONTEXT" });
  }

  const navigatorObject =
    input.navigatorObject ??
    (typeof navigator === "undefined" ? undefined : navigator);
  if (navigatorObject === null || typeof navigatorObject !== "object") {
    return Object.freeze({ status: "UNSUPPORTED" });
  }

  let serial: WebSerialApi | undefined;
  try {
    serial = (navigatorObject as NavigatorWithSerial).serial;
  } catch {
    return Object.freeze({ status: "UNSUPPORTED" });
  }
  if (serial === undefined || typeof serial.requestPort !== "function") {
    return Object.freeze({ status: "UNSUPPORTED" });
  }

  let port: WebSerialPort;
  try {
    port = await serial.requestPort();
  } catch (error: unknown) {
    const name = errorName(error);
    if (name === "NotFoundError" || name === "AbortError") {
      return Object.freeze({ status: "CANCELLED" });
    }
    if (name === "SecurityError" || name === "NotAllowedError") {
      return Object.freeze({ status: "PERMISSION_DENIED" });
    }
    return Object.freeze({ status: "OPEN_FAILED" });
  }

  if (
    port === null ||
    typeof port !== "object" ||
    typeof port.open !== "function" ||
    typeof port.close !== "function"
  ) {
    return Object.freeze({ status: "OPEN_FAILED" });
  }

  const baudRate = normalizeBaudRate(input.baudRate);
  try {
    await port.open({ baudRate });
  } catch {
    return Object.freeze({ status: "OPEN_FAILED" });
  }

  return Object.freeze({
    status: "CONNECTED",
    port,
    info: readPortInfo(port),
    baudRate,
  });
}

export async function closeWebSerialPort(
  port: WebSerialPort,
): Promise<boolean> {
  try {
    await port.close();
    return true;
  } catch {
    return false;
  }
}
