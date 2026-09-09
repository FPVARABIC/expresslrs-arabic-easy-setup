import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeSerialPassthrough } from "./passthrough";
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
        "serial 0 1 115200 57600 0 115200\r\nserial 3 64 115200 57600 0 115200\r\n#\r\n",
      ],
    });
    const operation = initializeSerialPassthrough({
      method: "betaflight",
      port: serial.port,
      flashBaud: 420_000,
    });

    await flushUntil(() => serial.writes.length === 3);
    await vi.advanceTimersByTimeAsync(350);

    await expect(operation).resolves.toBe(serial.port);
    expect(serial.writes).toEqual([
      "#\r\n",
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
    const serial = fakeSerial({ responses: ["#\r\n"] });
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

    await flushUntil(() => serial.writes.length === 2);
    controller.abort();

    await rejection;
    expect(serial.writes).toEqual(["#\r\n", "serialpassthrough 2 420000\r\n"]);
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
      responses: ["#\r\n"],
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

    await flushUntil(() => serial.writes.length === 2);
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
