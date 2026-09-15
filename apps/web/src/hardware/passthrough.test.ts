import { afterEach, describe, expect, it, vi } from "vitest";

import { createLegacyBootloaderCommand } from "./crsf";
import {
  initializeSerialPassthrough,
  PASSTHROUGH_FLASH_BAUD,
  requestReceiverBootloaderThroughPassthrough,
} from "./passthrough";
import type {
  HardwareSerialPort,
  HardwareSerialReader,
  HardwareSerialWriter,
} from "./serial";

type ReadResult = Readonly<{ done: boolean; value?: Uint8Array }>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeSerial(
  input: {
    readonly responses?: Array<string | Error | null>;
    readonly writeOperation?: (bytes: Uint8Array) => Promise<void>;
    readonly writerAbortOperation?: (reason?: unknown) => Promise<void>;
    readonly closeOperation?: () => Promise<void>;
    readonly cancelError?: Error;
    readonly readerReleaseError?: Error;
    readonly closeError?: Error;
  } = {},
) {
  const responses = [...(input.responses ?? [])];
  const writes: string[] = [];
  let pendingRead: ReturnType<typeof deferred<ReadResult>> | null = null;
  const read = vi.fn(() => {
    const response = responses.shift();
    if (typeof response === "string") {
      return Promise.resolve({
        done: false,
        value: new TextEncoder().encode(response),
      });
    }
    if (response === null) {
      return Promise.resolve({ done: true });
    }
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    pendingRead = deferred<ReadResult>();
    return pendingRead.promise;
  });
  const reader: HardwareSerialReader = {
    read,
    cancel: vi.fn(async () => {
      if (input.cancelError !== undefined) {
        throw input.cancelError;
      }
      pendingRead?.resolve({ done: true });
    }),
    releaseLock: vi.fn(() => {
      if (input.readerReleaseError !== undefined) {
        throw input.readerReleaseError;
      }
    }),
  };
  const abortWriter =
    input.writerAbortOperation === undefined
      ? undefined
      : vi.fn(input.writerAbortOperation);
  const write = vi.fn(async (bytes: Uint8Array) => {
    writes.push(new TextDecoder().decode(bytes));
    await input.writeOperation?.(bytes);
  });
  const writer: HardwareSerialWriter & {
    abort?(reason?: unknown): Promise<void>;
  } = {
    write,
    releaseLock: vi.fn(),
    ...(abortWriter === undefined ? {} : { abort: abortWriter }),
  };
  const close = vi.fn(async () => {
    if (input.closeError !== undefined) {
      throw input.closeError;
    }
    await input.closeOperation?.();
  });
  const port: HardwareSerialPort = {
    readable: { getReader: () => reader },
    writable: { getWriter: () => writer },
    open: vi.fn().mockResolvedValue(undefined),
    close,
  };
  return { port, reader, writer, read, write, abortWriter, close, writes };
}

async function flushUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Async passthrough step did not become ready");
}

function expectClosed(serial: ReturnType<typeof fakeSerial>): void {
  expect(serial.reader.cancel).toHaveBeenCalledTimes(1);
  expect(serial.reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(serial.writer.releaseLock).toHaveBeenCalledTimes(1);
  expect(serial.close).toHaveBeenCalledTimes(1);
}

afterEach(() => {
  vi.useRealTimers();
});

/** What a correctly configured Betaflight answers to the three `get` checks. */
const CRSF_SERIALRX_ANSWERS = [
  "serialrx_provider = CRSF\r\nAllowed values: NONE, SPEK1024, SBUS, CRSF, GHST\r\n\r\n# ",
  "serialrx_inverted = OFF\r\nAllowed values: OFF, ON\r\n\r\n# ",
  "serialrx_halfduplex = OFF\r\nAllowed values: OFF, ON, AUTO\r\n\r\n# ",
] as const;

describe("Betaflight receiver-UART sanity checks (the official flasher's `serialrx_*` refusals)", () => {
  async function refusal(input: {
    readonly answers: readonly string[];
    readonly spiAnswer?: string;
  }) {
    const serial = fakeSerial({
      responses: [
        "#\r\n",
        ...input.answers,
        ...(input.spiAnswer === undefined ? [] : [input.spiAnswer]),
        "serial 0 1 115200 57600 0 115200\r\nserial 3 64 115200 57600 0 115200\r\n#\r\n",
      ],
    });
    const outcome = await initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    return { serial, outcome };
  }

  it("refuses a flight controller whose serial receiver protocol is not CRSF, before any passthrough command", async () => {
    const { serial, outcome } = await refusal({
      answers: [
        "serialrx_provider = SBUS\r\nAllowed values: NONE, SBUS, CRSF\r\n\r\n# ",
        CRSF_SERIALRX_ANSWERS[1],
        CRSF_SERIALRX_ANSWERS[2],
      ],
      spiAnswer: "rx_spi_protocol = NONE\r\n\r\n# ",
    });
    expect(outcome).toMatchObject({
      name: "PassthroughError",
      code: "SERIALRX_PROVIDER",
      detail: {
        setting: "serialrx_provider",
        observed: "SBUS",
        expected: "CRSF",
      },
    });
    expect(
      serial.writes.some((line) => line.startsWith("serialpassthrough")),
    ).toBe(false);
    expect(serial.writes).toContain("get rx_spi_protocol\r\n");
    expectClosed(serial);
  });

  it("refuses an inverted receiver UART by name", async () => {
    const { outcome } = await refusal({
      answers: [
        CRSF_SERIALRX_ANSWERS[0],
        "serialrx_inverted = ON\r\nAllowed values: OFF, ON\r\n\r\n# ",
        CRSF_SERIALRX_ANSWERS[2],
      ],
      spiAnswer: "rx_spi_protocol = NONE\r\n\r\n# ",
    });
    expect(outcome).toMatchObject({
      code: "SERIALRX_INVERTED",
      detail: { setting: "serialrx_inverted", observed: "ON", expected: "OFF" },
    });
  });

  it("refuses a half-duplex receiver UART by name, and accepts AUTO", async () => {
    const { outcome } = await refusal({
      answers: [
        CRSF_SERIALRX_ANSWERS[0],
        CRSF_SERIALRX_ANSWERS[1],
        "serialrx_halfduplex = ON\r\nAllowed values: OFF, ON, AUTO\r\n\r\n# ",
      ],
      spiAnswer: "rx_spi_protocol = NONE\r\n\r\n# ",
    });
    expect(outcome).toMatchObject({
      code: "SERIALRX_HALFDUPLEX",
      detail: {
        setting: "serialrx_halfduplex",
        observed: "ON",
        expected: "OFF or AUTO",
      },
    });

    const auto = fakeSerial({
      responses: [
        "#\r\n",
        CRSF_SERIALRX_ANSWERS[0],
        CRSF_SERIALRX_ANSWERS[1],
        "serialrx_halfduplex = AUTO\r\nAllowed values: OFF, ON, AUTO\r\n\r\n# ",
        "serial 3 64 115200 57600 0 115200\r\n#\r\n",
      ],
    });
    vi.useFakeTimers();
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: auto.port,
      flashBaud: 420_000,
    });
    await flushUntil(() => auto.writes.length === 6);
    await vi.advanceTimersByTimeAsync(350);
    await expect(operation).resolves.toBe(auto.port);
  });

  it("names an SPI receiver built into the flight controller, which this passthrough cannot update", async () => {
    const { outcome } = await refusal({
      answers: [
        "serialrx_provider = NONE\r\nAllowed values: NONE, SBUS, CRSF\r\n\r\n# ",
        CRSF_SERIALRX_ANSWERS[1],
        CRSF_SERIALRX_ANSWERS[2],
      ],
      spiAnswer:
        "rx_spi_protocol = EXPRESSLRS\r\nAllowed values: NONE, EXPRESSLRS\r\n\r\n# ",
    });
    expect(outcome).toMatchObject({ code: "SPI_RECEIVER" });
  });

  it("treats a setting the flight controller cannot report as a failed check, not as a pass", async () => {
    const { outcome } = await refusal({
      answers: [
        "Invalid name\r\n\r\n# ",
        CRSF_SERIALRX_ANSWERS[1],
        CRSF_SERIALRX_ANSWERS[2],
      ],
      spiAnswer: "Invalid name\r\n\r\n# ",
    });
    expect(outcome).toMatchObject({
      code: "SERIALRX_PROVIDER",
      detail: { setting: "serialrx_provider", observed: "", expected: "CRSF" },
    });
  });
});

describe("serial passthrough protocol and resource safety", () => {
  it("rejects a pre-aborted direct passthrough without touching the port", async () => {
    const serial = fakeSerial();
    const controller = new AbortController();
    controller.abort();

    await expect(
      initializeSerialPassthrough({
        method: "passthru",
        port: serial.port,
        flashBaud: 460_800,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(serial.port.open).not.toHaveBeenCalled();
    expect(serial.close).not.toHaveBeenCalled();
  });

  it("preserves the exact EdgeTX command sequence and serial settings", async () => {
    vi.useFakeTimers();
    const serial = fakeSerial({
      responses: [">\r\n", ">\r\n", ">\r\n", ">\r\n", ">\r\n", ">\r\n"],
    });
    const operation = initializeSerialPassthrough({
      method: "edgetx",
      port: serial.port,
      flashBaud: 460_800,
    });

    await flushUntil(() => serial.writes.length === 7);
    await vi.advanceTimersByTimeAsync(350);

    await expect(operation).resolves.toBe(serial.port);
    expect(serial.port.open).toHaveBeenCalledWith({
      baudRate: 115_200,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      bufferSize: 65_536,
      flowControl: "none",
    });
    expect(serial.writes).toEqual([
      "\r\n",
      "set pulses 0\r\n",
      "set rfmod 0 power off\r\n",
      "set rfmod 0 bootpin 1\r\n",
      "set rfmod 0 power on\r\n",
      "set rfmod 0 bootpin 0\r\n",
      "serialpassthrough rfmod 0 460800\r\n",
    ]);
    expectClosed(serial);
  });

  it("discovers RX_SERIAL and preserves the Betaflight command sequence", async () => {
    vi.useFakeTimers();
    const serial = fakeSerial({
      responses: [
        "#\r\n",
        ...CRSF_SERIALRX_ANSWERS,
        "serial 0 1 115200 57600 0 115200\r\nserial 3 64 115200 57600 0 115200\r\n#\r\n",
      ],
    });
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
    });

    await flushUntil(() => serial.writes.length === 6);
    await vi.advanceTimersByTimeAsync(350);

    await expect(operation).resolves.toBe(serial.port);
    // The official flasher's order: enter the CLI, prove the receiver UART is
    // configured for CRSF, find it, then open the passthrough.
    expect(serial.writes).toEqual([
      "#\r\n",
      "get serialrx_provider\r\n",
      "get serialrx_inverted\r\n",
      "get serialrx_halfduplex\r\n",
      "serial\r\n",
      "serialpassthrough 3 420000\r\n",
    ]);
    expectClosed(serial);
  });

  it("aborts a blocked prompt read immediately and releases all resources", async () => {
    const serial = fakeSerial();
    const controller = new AbortController();
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
      uartIdentifier: 2,
      signal: controller.signal,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: "ABORTED",
    });

    await flushUntil(() => serial.read.mock.calls.length === 1);
    controller.abort();

    await rejection;
    expectClosed(serial);
  });

  it("bounds a blocked prompt read and closes after timeout", async () => {
    vi.useFakeTimers();
    const serial = fakeSerial();
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
      uartIdentifier: 2,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: "TIMEOUT",
    });

    await flushUntil(() => serial.read.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(3_500);

    await rejection;
    expectClosed(serial);
  });

  it("bounds a blocked serial write and handles its late rejection", async () => {
    vi.useFakeTimers();
    const pendingWrite = deferred<void>();
    const serial = fakeSerial({
      writeOperation: () => pendingWrite.promise,
    });
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
      uartIdentifier: 2,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: "TIMEOUT",
    });

    await flushUntil(() => serial.write.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(3_500);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    expectClosed(serial);

    pendingWrite.reject(new Error("late serial failure"));
    await Promise.resolve();
  });

  it("aborts a blocked serial write and removes its deadline", async () => {
    vi.useFakeTimers();
    const pendingWrite = deferred<void>();
    const serial = fakeSerial({
      writeOperation: () => pendingWrite.promise,
    });
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(
      controller.signal,
      "removeEventListener",
    );
    const operation = initializeSerialPassthrough({
      method: "edgetx",
      port: serial.port,
      flashBaud: 460_800,
      signal: controller.signal,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: "ABORTED",
    });

    await flushUntil(() => serial.write.mock.calls.length === 1);
    controller.abort();

    await rejection;
    expect(removeAbortListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
    expectClosed(serial);

    pendingWrite.resolve();
    await Promise.resolve();
  });

  it("bounds a hanging port close after write timeout and keeps late cleanup safe", async () => {
    vi.useFakeTimers();
    const pendingWrite = deferred<void>();
    const pendingClose = deferred<void>();
    const serial = fakeSerial({
      writeOperation: () => pendingWrite.promise,
      writerAbortOperation: () => Promise.resolve(),
      closeOperation: () => pendingClose.promise,
    });
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
      uartIdentifier: 2,
    });
    let operationSettled = false;
    void operation.then(
      () => {
        operationSettled = true;
      },
      () => {
        operationSettled = true;
      },
    );
    const rejection = expect(operation).rejects.toMatchObject({
      code: "CLEANUP_UNCONFIRMED",
    });

    await flushUntil(() => serial.write.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(3_500);
    await flushUntil(() => serial.close.mock.calls.length === 1);

    expect(serial.abortWriter).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TIMEOUT" }),
    );
    expect(operationSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(operationSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await rejection;
    expect(operationSettled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expectClosed(serial);

    pendingWrite.reject(new Error("late write failure"));
    pendingClose.reject(new Error("late close failure"));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("makes the final passthrough-ready wait cancellation-aware", async () => {
    const serial = fakeSerial({
      responses: ["#\r\n", ...CRSF_SERIALRX_ANSWERS],
    });
    const controller = new AbortController();
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
      uartIdentifier: 2,
      signal: controller.signal,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: "ABORTED",
    });

    await flushUntil(() => serial.writes.length === 5);
    controller.abort();

    await rejection;
    expect(serial.writes).toEqual([
      "#\r\n",
      "get serialrx_provider\r\n",
      "get serialrx_inverted\r\n",
      "get serialrx_halfduplex\r\n",
      "serialpassthrough 2 420000\r\n",
    ]);
    expectClosed(serial);
  });

  it("closes and releases locks on unexpected EOF", async () => {
    const serial = fakeSerial({ responses: [null] });
    const operation = initializeSerialPassthrough({
      method: "edgetx",
      port: serial.port,
      flashBaud: 460_800,
    });

    await expect(operation).rejects.toMatchObject({
      code: "UNEXPECTED_RESPONSE",
    });
    expectClosed(serial);
  });

  it("continues cleanup when reading, cancellation, or lock release fails", async () => {
    const readError = new Error("device disconnected");
    const serial = fakeSerial({
      responses: [readError],
      cancelError: new Error("cancel failed"),
      readerReleaseError: new Error("reader already unlocked"),
      closeError: new Error("port disappeared"),
    });
    const operation = initializeSerialPassthrough({
      method: "edgetx",
      port: serial.port,
      flashBaud: 460_800,
    });

    await expect(operation).rejects.toMatchObject({
      code: "CLEANUP_UNCONFIRMED",
    });
    expectClosed(serial);
  });

  it("fails closed when a successful passthrough setup cannot confirm port cleanup", async () => {
    vi.useFakeTimers();
    const serial = fakeSerial({
      responses: ["#\r\n", ...CRSF_SERIALRX_ANSWERS],
      closeError: new Error("close failed"),
    });
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
      uartIdentifier: 2,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: "CLEANUP_UNCONFIRMED",
    });

    await flushUntil(() => serial.writes.length === 5);
    await vi.advanceTimersByTimeAsync(350);

    await rejection;
    expectClosed(serial);
  });

  it("closes the opened port once when streams are unavailable", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const port: HardwareSerialPort = {
      readable: null,
      writable: null,
      open: vi.fn().mockResolvedValue(undefined),
      close,
    };

    await expect(
      initializeSerialPassthrough({
        method: "betaflight",
        port,
        flashBaud: 420_000,
      }),
    ).rejects.toMatchObject({
      code: "STREAMS_UNAVAILABLE",
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

/**
 * A port whose reads are delivered on demand, so a line can arrive *after* a
 * particular write the way a receiver answers a command, and whose writes are
 * kept as bytes rather than decoded text.
 */
function bootloaderPort() {
  const rawWrites: Uint8Array[] = [];
  const queue: Uint8Array[] = [];
  let pending: ((result: ReadResult) => void) | null = null;
  let cancelled = false;
  let onWrite: ((bytes: Uint8Array) => void) | null = null;
  const deliver = (text: string) => {
    const value = new TextEncoder().encode(text);
    if (pending !== null) {
      const resolve = pending;
      pending = null;
      resolve({ done: false, value });
    } else {
      queue.push(value);
    }
  };
  const reader: HardwareSerialReader = {
    read: vi.fn((): Promise<ReadResult> => {
      if (cancelled) return Promise.resolve({ done: true });
      const next = queue.shift();
      if (next !== undefined)
        return Promise.resolve({ done: false, value: next });
      return new Promise<ReadResult>((resolve) => {
        pending = resolve;
      });
    }),
    cancel: vi.fn(async () => {
      cancelled = true;
      pending?.({ done: true });
      pending = null;
    }),
    releaseLock: vi.fn(),
  };
  const writer: HardwareSerialWriter = {
    write: vi.fn(async (bytes: Uint8Array) => {
      rawWrites.push(new Uint8Array(bytes));
      onWrite?.(bytes);
    }),
    releaseLock: vi.fn(),
  };
  const port: HardwareSerialPort = {
    readable: { getReader: () => reader },
    writable: { getWriter: () => writer },
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    port,
    reader,
    writer,
    rawWrites,
    deliver,
    whenWritten(handler: (bytes: Uint8Array) => void) {
      onWrite = handler;
    },
  };
}

const OFFICIAL_BOOTLOADER_FRAME = createLegacyBootloaderCommand();

describe("receiver bootloader entry through a flight-controller passthrough", () => {
  it("pins the official rates per path", () => {
    // web-flasher espflasher.js connect(): betaflight 420000, etx 230400
    // (main firmware), passthru 230400.
    expect(PASSTHROUGH_FLASH_BAUD).toEqual({
      betaflight: 420_000,
      edgetx: 230_400,
      passthru: 230_400,
    });
  });

  it("sends the official sync, training run, pause and key-less bl frame, then returns the Target line", async () => {
    vi.useFakeTimers();
    const serial = bootloaderPort();
    serial.whenWritten((bytes) => {
      // The receiver answers the command, not the training run.
      if (bytes[0] === 0xec) serial.deliver("Unified_ESP8285_2400_RX\r\n");
    });

    const operation = requestReceiverBootloaderThroughPassthrough({
      port: serial.port,
      baudRate: 420_000,
      family: "esp",
    });
    await flushUntil(() => serial.rawWrites.length === 2);
    expect(serial.port.open).toHaveBeenCalledWith(
      expect.objectContaining({ baudRate: 420_000, flowControl: "none" }),
    );
    expect([...serial.rawWrites[0]!]).toEqual([0x07, 0x07, 0x12, 0x20]);
    expect([...serial.rawWrites[1]!]).toEqual(new Array<number>(32).fill(0x55));
    // Nothing else goes out before the official 200 ms pause has elapsed.
    await vi.advanceTimersByTimeAsync(199);
    expect(serial.rawWrites).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await flushUntil(() => serial.rawWrites.length === 3);
    // [0xEC, 0x04, 0x32, 'b', 'l', crc]: the frame the official flasher
    // sends, with no key appended.
    expect([...serial.rawWrites[2]!]).toEqual([...OFFICIAL_BOOTLOADER_FRAME]);
    expect(OFFICIAL_BOOTLOADER_FRAME).toHaveLength(6);

    await vi.advanceTimersByTimeAsync(10);
    const result = await operation;
    expect(result.target).toBe("Unified_ESP8285_2400_RX");
    expect(result.lines).toEqual(["Unified_ESP8285_2400_RX"]);
    expect(result.bootloaderKeyed).toBe(false);
    expect(serial.reader.cancel).toHaveBeenCalledTimes(1);
    expect(serial.reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(serial.writer.releaseLock).toHaveBeenCalledTimes(1);
    expect(serial.port.close).toHaveBeenCalledTimes(1);
  });

  it("does not mistake CLI noise echoed before the command for a Target line", async () => {
    vi.useFakeTimers();
    const serial = bootloaderPort();
    serial.deliver("# serialpassthrough 1 420000\r\n");
    serial.whenWritten((bytes) => {
      if (bytes[0] === 0xec) serial.deliver("VENDOR_ESP_RX\n");
    });

    const operation = requestReceiverBootloaderThroughPassthrough({
      port: serial.port,
      baudRate: 420_000,
      family: "esp",
    });
    await vi.advanceTimersByTimeAsync(210);
    await flushUntil(() => serial.rawWrites.length === 3);
    await vi.advanceTimersByTimeAsync(10);

    const result = await operation;
    expect(result.target).toBe("VENDOR_ESP_RX");
    expect(result.lines).toEqual(["VENDOR_ESP_RX"]);
  });

  it("answers an STM32 bootloader's hold-down prompt and keeps reading until the XMODEM request", async () => {
    vi.useFakeTimers();
    const serial = bootloaderPort();
    serial.whenWritten((bytes) => {
      if (bytes[0] === 0xec) {
        serial.deliver("DIY_2400_RX_STM32_CCG_Nano_v0_5\n");
        serial.deliver("BL_TYPE=UART\n=== v1.3 ===\nhold down button\n");
      }
      if (new TextDecoder().decode(bytes) === "bbbbbb") {
        serial.deliver("CCC");
      }
    });

    const operation = requestReceiverBootloaderThroughPassthrough({
      port: serial.port,
      baudRate: 420_000,
      family: "stm32",
    });
    await vi.advanceTimersByTimeAsync(210);
    await flushUntil(() => serial.rawWrites.length === 3);
    // The key sequence follows the prompt after the official 100 ms.
    await vi.advanceTimersByTimeAsync(100);
    await flushUntil(() => serial.rawWrites.length === 4);
    expect(new TextDecoder().decode(serial.rawWrites[3])).toBe("bbbbbb");
    // "CCC" arrives without a newline; the 250 ms poll picks it up.
    await vi.advanceTimersByTimeAsync(260);

    const result = await operation;
    expect(result.target).toBe("DIY_2400_RX_STM32_CCG_Nano_v0_5");
    expect(result.bootloaderKeyed).toBe(true);
    expect(result.lines).toEqual([
      "DIY_2400_RX_STM32_CCG_Nano_v0_5",
      "BL_TYPE=UART",
      "=== v1.3 ===",
      "hold down button",
    ]);
    expect(serial.port.close).toHaveBeenCalledTimes(1);
  });

  it("returns no Target when the receiver stays silent, and still releases the port", async () => {
    vi.useFakeTimers();
    const serial = bootloaderPort();

    const operation = requestReceiverBootloaderThroughPassthrough({
      port: serial.port,
      baudRate: 420_000,
      family: "esp",
    });
    await vi.advanceTimersByTimeAsync(200 + 2_000 + 250);

    const result = await operation;
    expect(result.target).toBeNull();
    expect(result.lines).toEqual([]);
    expect(serial.rawWrites).toHaveLength(3);
    expect(serial.reader.cancel).toHaveBeenCalledTimes(1);
    expect(serial.port.close).toHaveBeenCalledTimes(1);
  });

  it("rejects a pre-aborted request without opening the port", async () => {
    const serial = bootloaderPort();
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestReceiverBootloaderThroughPassthrough({
        port: serial.port,
        baudRate: 420_000,
        family: "esp",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(serial.port.open).not.toHaveBeenCalled();
  });

  it("stops during the pause when cancelled, before the bl frame goes out", async () => {
    vi.useFakeTimers();
    const serial = bootloaderPort();
    const controller = new AbortController();

    const operation = requestReceiverBootloaderThroughPassthrough({
      port: serial.port,
      baudRate: 420_000,
      family: "esp",
      signal: controller.signal,
    });
    await flushUntil(() => serial.rawWrites.length === 2);
    controller.abort();

    await expect(operation).rejects.toMatchObject({ code: "ABORTED" });
    expect(serial.rawWrites).toHaveLength(2);
    expect(serial.port.close).toHaveBeenCalledTimes(1);
  });

  it("reports a port that exposes no streams and confirms the close", async () => {
    const port: HardwareSerialPort = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      requestReceiverBootloaderThroughPassthrough({
        port,
        baudRate: 420_000,
        family: "esp",
      }),
    ).rejects.toMatchObject({ code: "STREAMS_UNAVAILABLE" });
    expect(port.close).toHaveBeenCalledTimes(1);
  });
});
