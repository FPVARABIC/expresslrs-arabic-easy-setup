import type {
  HardwareSerialPort,
  HardwareSerialReader,
  HardwareSerialWriter,
} from "./serial";

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
      | "CLEANUP_UNCONFIRMED"
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

function passthroughAborted(): PassthroughError {
  return new PassthroughError("ABORTED", "Passthrough setup was cancelled");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw passthroughAborted();
  }
}

function readWithDeadline(
  reader: HardwareSerialReader,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Readonly<{ done: boolean; value?: Uint8Array }>> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const resolveOnce = (
      result: Readonly<{ done: boolean; value?: Uint8Array }>,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => rejectOnce(passthroughAborted());
    const timer = setTimeout(
      () =>
        rejectOnce(
          new PassthroughError(
            "TIMEOUT",
            "Serial console did not answer before the deadline",
          ),
        ),
      timeoutMs,
    );

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
      return;
    }

    let read: Promise<Readonly<{ done: boolean; value?: Uint8Array }>>;
    try {
      read = reader.read();
    } catch (error: unknown) {
      rejectOnce(error);
      return;
    }
    void read.then(resolveOnce, rejectOnce);
  });
}

function writeWithDeadline(
  writer: HardwareSerialWriter,
  bytes: Uint8Array,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => rejectOnce(passthroughAborted());
    const timer = setTimeout(
      () =>
        rejectOnce(
          new PassthroughError(
            "TIMEOUT",
            "Serial console could not write before the deadline",
          ),
        ),
      timeoutMs,
    );

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
      return;
    }

    let write: Promise<void>;
    try {
      write = writer.write(bytes);
    } catch (error: unknown) {
      rejectOnce(error);
      return;
    }
    // Both handlers remain attached after a timeout or abort so that a late
    // stream settlement cannot become an unhandled rejection.
    void write.then(resolveOnce, rejectOnce);
  });
}

function settleCleanupWithin(
  operation: () => Promise<unknown>,
  timeoutMs = 1_000,
): Promise<boolean> {
  let task: Promise<unknown>;
  try {
    task = operation();
  } catch {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(confirmed);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    // Keep both handlers attached when the deadline wins. This lets browser
    // cleanup finish later without an unhandled rejection.
    void task.then(
      () => finish(true),
      () => finish(false),
    );
  });
}

function waitForPassthroughReady(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(passthroughAborted());
    };
    const timer = setTimeout(resolveOnce, 350);

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
    }
  });
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
    throw new PassthroughError(
      "OPEN_FAILED",
      "Serial port could not be selected",
    );
  }
}

class CliSerialTransport {
  readonly #port: HardwareSerialPort;
  #reader: ReturnType<
    NonNullable<HardwareSerialPort["readable"]>["getReader"]
  > | null = null;
  #writer: ReturnType<
    NonNullable<HardwareSerialPort["writable"]>["getWriter"]
  > | null = null;
  #buffer = "";
  #closed = false;
  #closeTask: Promise<boolean> | null = null;
  #writerNeedsAbort = false;
  #writerAbortReason: unknown;

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
      throw new PassthroughError(
        "OPEN_FAILED",
        "Serial console could not be opened",
      );
    }
    if (this.#port.readable == null || this.#port.writable == null) {
      throw new PassthroughError(
        "STREAMS_UNAVAILABLE",
        "Serial console does not expose readable and writable streams",
      );
    }
    this.#reader = this.#port.readable.getReader();
    this.#writer = this.#port.writable.getWriter();
  }

  public async write(value: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.#closed || this.#writer === null) {
      throw new PassthroughError("OPEN_FAILED", "Serial console is closed");
    }
    try {
      await writeWithDeadline(
        this.#writer,
        new TextEncoder().encode(value),
        3_500,
        signal,
      );
      throwIfAborted(signal);
    } catch (error: unknown) {
      this.#writerNeedsAbort = true;
      this.#writerAbortReason = error;
      throw error;
    }
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
      throwIfAborted(input.signal);
      matcher.lastIndex = 0;
      if (matcher.test(this.#buffer)) return this.#buffer;
      const remaining = Math.max(1, deadline - Date.now());
      const result = await readWithDeadline(
        this.#reader,
        remaining,
        input.signal,
      );
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
    throwIfAborted(signal);
    this.clearBuffer();
    await this.write(value, signal);
    return this.readUntil(matcher, { timeoutMs: 3_500, signal });
  }

  public close(): Promise<boolean> {
    if (this.#closeTask !== null) return this.#closeTask;
    this.#closed = true;
    const reader = this.#reader;
    const writer = this.#writer;
    const writerNeedsAbort = this.#writerNeedsAbort;
    const writerAbortReason = this.#writerAbortReason;
    this.#reader = null;
    this.#writer = null;
    this.#closeTask = (async () => {
      const abortWriter = (
        writer as
          | (HardwareSerialWriter & {
              abort?(reason?: unknown): Promise<void>;
            })
          | null
      )?.abort;
      await Promise.all([
        settleCleanupWithin(() => reader?.cancel() ?? Promise.resolve()),
        writerNeedsAbort && typeof abortWriter === "function"
          ? settleCleanupWithin(() =>
              abortWriter.call(writer, writerAbortReason),
            )
          : Promise.resolve(),
      ]);
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
      return settleCleanupWithin(() => this.#port.close());
    })();
    return this.#closeTask;
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
  await transport.write(`serialpassthrough rfmod 0 ${flashBaud}\r\n`, signal);
  await waitForPassthroughReady(signal);
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
    const serialOutput = await transport.command(
      "serial\r\n",
      /#\s*$/mu,
      signal,
    );
    identifier = parseReceiverUart(serialOutput);
  }
  if (
    identifier === null ||
    !Number.isSafeInteger(identifier) ||
    identifier < 0
  ) {
    throw new PassthroughError(
      "UART_NOT_FOUND",
      "Flight-controller CLI did not expose one RX_SERIAL UART",
    );
  }
  transport.clearBuffer();
  await transport.write(
    `serialpassthrough ${identifier} ${flashBaud}\r\n`,
    signal,
  );
  await waitForPassthroughReady(signal);
}

export async function initializeSerialPassthrough(input: {
  readonly method: PassthroughMethod;
  readonly port: HardwareSerialPort;
  readonly flashBaud: number;
  readonly uartIdentifier?: number | null;
  readonly signal?: AbortSignal;
}): Promise<HardwareSerialPort> {
  throwIfAborted(input.signal);
  if (input.method === "passthru") return input.port;
  const transport = new CliSerialTransport(input.port);
  try {
    await transport.open(input.method === "edgetx" ? 115_200 : 115_200);
    throwIfAborted(input.signal);
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
    throwIfAborted(input.signal);
  } finally {
    const cleanupConfirmed = await transport.close();
    if (!cleanupConfirmed) {
      throw new PassthroughError(
        "CLEANUP_UNCONFIRMED",
        "Serial passthrough ended, but the browser could not confirm that its port closed",
      );
    }
  }
  return input.port;
}
