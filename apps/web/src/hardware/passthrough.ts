import { createLegacyBootloaderCommand } from "./crsf";
import type {
  HardwareSerialPort,
  HardwareSerialReader,
  HardwareSerialWriter,
} from "./serial";

export type PassthroughMethod = "edgetx" | "betaflight" | "passthru";

/**
 * The serial rates the pinned official flasher uses for each path
 * (`web-flasher/src/js/espflasher.js` `connect()`, `xmodem.js` `connect()`).
 *
 * They are not interchangeable. Behind a flight controller the receiver's own
 * CRSF UART runs at 420000 and the `bl` command has to arrive at that rate;
 * EdgeTX drives its module bay at 230400; a direct USB-UART adapter takes
 * 460800. Sending the bootloader command at the wrong rate is not a slower
 * flash, it is a receiver that never leaves its application firmware.
 */
export const PASSTHROUGH_FLASH_BAUD: Readonly<
  Record<PassthroughMethod, number>
> = Object.freeze({
  betaflight: 420_000,
  edgetx: 230_400,
  passthru: 230_400,
});

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
      | "MULTIPLE_DEVICES"
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
    if (name === "MULTIPLE_DEVICES") {
      throw new PassthroughError(
        "MULTIPLE_DEVICES",
        "More than one USB serial device is attached; connect only the device to be programmed",
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

/** What the receiver said between the `bl` command and its reboot. */
export interface PassthroughBootloaderResult {
  /**
   * The Target name the firmware prints before it reboots
   * (`rx_main.cpp` `reset_into_bootloader`: `println(&target_name[4])`), or
   * null when nothing plausible arrived inside the window. The official
   * flasher then flashes blindly; the caller decides what to do with null.
   */
  readonly target: string | null;
  /** Every non-empty line observed, in order, for the operator's log. */
  readonly lines: readonly string[];
  /**
   * Whether an STM32 bootloader printed `hold down button` and was answered
   * with the key sequence that keeps it in the bootloader
   * (`web-flasher/src/js/xmodem.js` `startBootloader`).
   */
  readonly bootloaderKeyed: boolean;
}

/** A line that can be a Target name: the same shape the direct-UART path accepts. */
const PLAUSIBLE_TARGET_LINE = /^[A-Za-z0-9_.-]{3,80}$/u;
const BOOTLOADER_LINE_WINDOW_MS = 2_000;
const BOOTLOADER_PAUSE_MS = 200;
const BOOTLOADER_WRITE_TIMEOUT_MS = 3_500;

function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(passthroughAborted());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Sends the CRSF bootloader command to a receiver that sits behind a flight
 * controller whose CLI has already been switched to `serialpassthrough`.
 *
 * This is the step the official flasher performs as
 * `Passthrough.reset_to_bootloader()` right after `betaflight()`, and without
 * it a receiver behind a flight controller never leaves its application: the
 * flight controller's passthrough is only a wire, and nothing on that wire
 * resets the receiver. The sequence is byte-for-byte the official one — the
 * `07 07 12 20` sync, a 32-byte `0x55` training run, 200 ms, the legacy
 * `[0xEC 0x04 0x32 'b' 'l' crc]` command — and it is sent at the receiver's
 * own CRSF rate (420000), because the command is parsed by the application
 * firmware, not by a bootloader that could auto-baud.
 *
 * The receiver answers with its Target name and reboots. That line is
 * returned for the caller to compare against the chosen Target; an STM32
 * bootloader that asks for the hold-down key is answered here, the way the
 * official XMODEM path does, so the caller's XMODEM handshake finds it waiting.
 *
 * The port is opened and closed here. Reading runs on its own task and is
 * buffered, so a line that arrives while no read is outstanding is not lost —
 * a timed-out `read()` that later resolves with the Target line would
 * otherwise swallow the one thing this function exists to observe.
 */
export async function requestReceiverBootloaderThroughPassthrough(input: {
  readonly port: HardwareSerialPort;
  readonly baudRate: number;
  readonly family: "esp" | "stm32";
  readonly signal?: AbortSignal;
}): Promise<PassthroughBootloaderResult> {
  throwIfAborted(input.signal);
  const port = input.port;
  try {
    await port.open({
      baudRate: input.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      bufferSize: 65_536,
      flowControl: "none",
    });
  } catch {
    throw new PassthroughError(
      "OPEN_FAILED",
      "The passthrough port could not be opened for the bootloader command",
    );
  }
  const readable = port.readable;
  const writable = port.writable;
  if (readable == null || writable == null) {
    if (!(await settleCleanupWithin(() => port.close()))) {
      throw new PassthroughError(
        "CLEANUP_UNCONFIRMED",
        "The passthrough port exposed no streams and could not be confirmed closed",
      );
    }
    throw new PassthroughError(
      "STREAMS_UNAVAILABLE",
      "The passthrough port does not expose readable and writable streams",
    );
  }

  const reader = readable.getReader();
  const writer = writable.getWriter();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const waiters = new Set<() => void>();
  let text = "";
  let reading = true;
  let writerNeedsAbort = false;
  let writerAbortReason: unknown;
  const readTask = (async () => {
    try {
      while (reading) {
        const result = await reader.read();
        if (result.done) break;
        if (result.value !== undefined) {
          text += decoder.decode(result.value, { stream: true });
          if (text.length > 65_536) text = text.slice(-32_768);
          for (const wake of [...waiters]) wake();
        }
      }
    } catch {
      // The observation window below times out on its own.
    }
  })();
  const waitForData = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, Math.max(1, ms));
      waiters.add(wake);
    });
  const write = async (bytes: Uint8Array): Promise<void> => {
    try {
      await writeWithDeadline(
        writer,
        bytes,
        BOOTLOADER_WRITE_TIMEOUT_MS,
        input.signal,
      );
    } catch (error: unknown) {
      writerNeedsAbort = true;
      writerAbortReason = error;
      throw error;
    }
  };
  const close = async (): Promise<boolean> => {
    reading = false;
    const abortWriter = (
      writer as HardwareSerialWriter & {
        abort?(reason?: unknown): Promise<void>;
      }
    ).abort;
    await Promise.all([
      settleCleanupWithin(() => reader.cancel()),
      writerNeedsAbort && typeof abortWriter === "function"
        ? settleCleanupWithin(() => abortWriter.call(writer, writerAbortReason))
        : Promise.resolve(true),
    ]);
    await settleCleanupWithin(() => readTask);
    try {
      reader.releaseLock();
    } catch {
      // The browser may already have released the lock.
    }
    try {
      writer.releaseLock();
    } catch {
      // The browser may already have released the lock.
    }
    return settleCleanupWithin(() => port.close());
  };

  try {
    await write(new Uint8Array([0x07, 0x07, 0x12, 0x20]));
    await write(new Uint8Array(32).fill(0x55));
    await delayWithAbort(BOOTLOADER_PAUSE_MS, input.signal);
    // Whatever the flight controller echoed before this point is CLI noise,
    // not a Target line.
    text = "";
    let consumed = 0;
    // The official frame carries no key: `[0xEC 0x04 0x32 'b' 'l' crc]`
    // (`Bootloader.get_init_seq('CRSF')`), and `RXEndpoint::handleRaw` matches
    // on the first two payload bytes alone.
    await write(createLegacyBootloaderCommand());

    const lines: string[] = [];
    let target: string | null = null;
    let bootloaderKeyed = false;
    const deadline = Date.now() + BOOTLOADER_LINE_WINDOW_MS;
    observe: while (Date.now() < deadline) {
      throwIfAborted(input.signal);
      let newline = text.indexOf("\n", consumed);
      while (newline !== -1) {
        const line = text.slice(consumed, newline).replace(/\r$/u, "").trim();
        consumed = newline + 1;
        newline = text.indexOf("\n", consumed);
        if (line.length === 0) continue;
        lines.push(line);
        if (/hold down button/iu.test(line)) {
          // The STM32 bootloader boots the application unless it is told to
          // stay; the official flasher answers with this exact sequence.
          await delayWithAbort(100, input.signal);
          await write(new TextEncoder().encode("bbbbbb"));
          bootloaderKeyed = true;
          continue;
        }
        if (line.includes("CCC")) break observe;
        if (target === null && PLAUSIBLE_TARGET_LINE.test(line)) {
          target = line;
          // An ESP receiver prints its Target and reboots into the ROM, which
          // then only speaks garbage at another rate; nothing more to read.
          if (input.family === "esp") break observe;
        }
      }
      // The XMODEM request is a run of `C` bytes with no line ending; the
      // official flasher watches for it as a delimiter of its own.
      if (text.slice(consumed).includes("CCC")) break observe;
      await waitForData(Math.min(250, deadline - Date.now()));
    }
    return Object.freeze({
      target,
      lines: Object.freeze(lines),
      bootloaderKeyed,
    });
  } finally {
    if (!(await close())) {
      throw new PassthroughError(
        "CLEANUP_UNCONFIRMED",
        "The bootloader command was sent, but the browser could not confirm that the port closed",
      );
    }
  }
}
