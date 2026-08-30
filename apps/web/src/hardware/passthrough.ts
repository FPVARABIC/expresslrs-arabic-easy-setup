import type { HardwareSerialPort } from "./serial";

export type PassthroughMethod = "edgetx" | "betaflight" | "passthru";

interface SerialApi {
  requestPort(): Promise<HardwareSerialPort>;
}

interface NavigatorWithSerial {
  readonly serial?: SerialApi;
}

export class PassthroughError extends Error {
  public constructor(
    public readonly code:
      | "UNSUPPORTED"
      | "CANCELLED"
      | "PERMISSION_DENIED"
      | "OPEN_FAILED"
      | "STREAMS_UNAVAILABLE"
      | "TIMEOUT"
      | "UNEXPECTED_RESPONSE"
      | "UART_NOT_FOUND"
      | "ABORTED",
    message: string,
  ) {
    super(message);
    this.name = "PassthroughError";
  }
}

function errorName(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name;
  }
  return error instanceof Error ? error.name : "";
}

export async function requestHardwarePort(
  navigatorObject: unknown = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<HardwareSerialPort> {
  if (navigatorObject === null || typeof navigatorObject !== "object") {
    throw new PassthroughError("UNSUPPORTED", "Web Serial is unavailable");
  }
  let serial: SerialApi | undefined;
  try {
    serial = (navigatorObject as NavigatorWithSerial).serial;
  } catch {
    throw new PassthroughError("UNSUPPORTED", "Web Serial is unavailable");
  }
  if (serial === undefined || typeof serial.requestPort !== "function") {
    throw new PassthroughError("UNSUPPORTED", "Web Serial is unavailable");
  }
  try {
    return await serial.requestPort();
  } catch (error: unknown) {
    const name = errorName(error);
    if (name === "NotFoundError" || name === "AbortError") {
      throw new PassthroughError("CANCELLED", "Port selection was cancelled");
    }
    if (name === "SecurityError" || name === "NotAllowedError") {
      throw new PassthroughError(
        "PERMISSION_DENIED",
        "Serial-port permission was denied",
      );
    }
    throw new PassthroughError("OPEN_FAILED", "Serial port could not be selected");
  }
}

class CliSerialTransport {
  readonly #port: HardwareSerialPort;
  #reader: ReturnType<NonNullable<HardwareSerialPort["readable"]>["getReader"]> | null =
    null;
  #writer: ReturnType<NonNullable<HardwareSerialPort["writable"]>["getWriter"]> | null =
    null;
  #buffer = "";
  #closed = false;

  public constructor(port: HardwareSerialPort) {
    this.#port = port;
  }

  public async open(baudRate: number): Promise<void> {
    try {
      await this.#port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        bufferSize: 65_536,
        flowControl: "none",
      });
    } catch {
      throw new PassthroughError("OPEN_FAILED", "Serial console could not be opened");
    }
    if (this.#port.readable == null || this.#port.writable == null) {
      try {
        await this.#port.close();
      } catch {
        // Preserve the more useful stream error.
      }
      throw new PassthroughError(
        "STREAMS_UNAVAILABLE",
        "Serial console does not expose readable and writable streams",
      );
    }
    this.#reader = this.#port.readable.getReader();
    this.#writer = this.#port.writable.getWriter();
  }

  public async write(value: string): Promise<void> {
    if (this.#closed || this.#writer === null) {
      throw new PassthroughError("OPEN_FAILED", "Serial console is closed");
    }
    await this.#writer.write(new TextEncoder().encode(value));
  }

  public async readUntil(
    matcher: RegExp,
    input: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
  ): Promise<string> {
    if (this.#closed || this.#reader === null) {
      throw new PassthroughError("OPEN_FAILED", "Serial console is closed");
    }
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 2_000, 100), 15_000);
    const deadline = Date.now() + timeoutMs;
    const decoder = new TextDecoder("utf-8", { fatal: false });
    while (Date.now() < deadline) {
      if (input.signal?.aborted === true) {
        throw new PassthroughError("ABORTED", "Passthrough setup was cancelled");
      }
      matcher.lastIndex = 0;
      if (matcher.test(this.#buffer)) return this.#buffer;
      const remaining = Math.max(1, deadline - Date.now());
      const result = await Promise.race([
        this.#reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new PassthroughError(
                  "TIMEOUT",
                  "Serial console did not answer before the deadline",
                ),
              ),
            remaining,
          ),
        ),
      ]);
      if (result.done) {
        throw new PassthroughError(
          "UNEXPECTED_RESPONSE",
          "Serial console ended before passthrough was ready",
        );
      }
      if (result.value !== undefined) {
        this.#buffer += decoder.decode(result.value, { stream: true });
        if (this.#buffer.length > 65_536) {
          this.#buffer = this.#buffer.slice(-32_768);
        }
      }
    }
    throw new PassthroughError(
      "TIMEOUT",
      "Serial console did not answer before the deadline",
    );
  }

  public clearBuffer(): void {
    this.#buffer = "";
  }

  public async command(
    value: string,
    matcher: RegExp,
    signal?: AbortSignal,
  ): Promise<string> {
    this.clearBuffer();
    await this.write(value);
    return this.readUntil(matcher, { timeoutMs: 3_500, signal });
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const reader = this.#reader;
    const writer = this.#writer;
    this.#reader = null;
    this.#writer = null;
    try {
      await reader?.cancel();
    } catch {
      // Cancellation is best effort.
    }
    try {
      reader?.releaseLock();
    } catch {
      // The browser may already have released the lock.
    }
    try {
      writer?.releaseLock();
    } catch {
      // The browser may already have released the lock.
    }
    try {
      await this.#port.close();
    } catch {
      // The port can disappear when passthrough switches modes.
    }
  }
}

function parseReceiverUart(serialOutput: string): number | null {
  for (const line of serialOutput.split(/\r?\n/u)) {
    const match = /^serial\s+(\d+)\s+(\d+)\b/iu.exec(line.trim());
    if (match === null) continue;
    const identifier = Number(match[1]);
    const functionMask = Number(match[2]);
    if (
      Number.isSafeInteger(identifier) &&
      Number.isSafeInteger(functionMask) &&
      (functionMask & 64) !== 0
    ) {
      return identifier;
    }
  }
  return null;
}

async function initializeEdgeTx(
  transport: CliSerialTransport,
  flashBaud: number,
  signal?: AbortSignal,
): Promise<void> {
  await transport.command("\r\n", />\s*$/mu, signal);
  for (const command of [
    "set pulses 0\r\n",
    "set rfmod 0 power off\r\n",
    "set rfmod 0 bootpin 1\r\n",
    "set rfmod 0 power on\r\n",
    "set rfmod 0 bootpin 0\r\n",
  ]) {
    await transport.command(command, />\s*$/mu, signal);
  }
  transport.clearBuffer();
  await transport.write(`serialpassthrough rfmod 0 ${flashBaud}\r\n`);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

async function initializeBetaflight(
  transport: CliSerialTransport,
  flashBaud: number,
  uartIdentifier: number | null,
  signal?: AbortSignal,
): Promise<void> {
  await transport.command("#\r\n", /#\s*$/mu, signal);
  let identifier = uartIdentifier;
  if (identifier === null) {
    const serialOutput = await transport.command("serial\r\n", /#\s*$/mu, signal);
    identifier = parseReceiverUart(serialOutput);
  }
  if (identifier === null || !Number.isSafeInteger(identifier) || identifier < 0) {
    throw new PassthroughError(
      "UART_NOT_FOUND",
      "Flight-controller CLI did not expose one RX_SERIAL UART",
    );
  }
  transport.clearBuffer();
  await transport.write(`serialpassthrough ${identifier} ${flashBaud}\r\n`);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

export async function initializeSerialPassthrough(input: {
  readonly method: PassthroughMethod;
  readonly port: HardwareSerialPort;
  readonly flashBaud: number;
  readonly uartIdentifier?: number | null;
  readonly signal?: AbortSignal;
}): Promise<HardwareSerialPort> {
  if (input.method === "passthru") return input.port;
  const transport = new CliSerialTransport(input.port);
  try {
    await transport.open(input.method === "edgetx" ? 115_200 : 115_200);
    if (input.method === "edgetx") {
      await initializeEdgeTx(transport, input.flashBaud, input.signal);
    } else {
      await initializeBetaflight(
        transport,
        input.flashBaud,
        input.uartIdentifier ?? null,
        input.signal,
      );
    }
  } finally {
    await transport.close();
  }
  return input.port;
}
