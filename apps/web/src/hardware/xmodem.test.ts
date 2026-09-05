import { describe, expect, it, vi } from "vitest";

import type {
  HardwareSerialPort,
  HardwareSerialReader,
  HardwareSerialWriter,
} from "./serial";
import { crc16Xmodem, flashXmodemFirmware } from "./xmodem";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Async XMODEM step did not become ready");
}

class Queue {
  readonly #values: Uint8Array[] = [];
  #resolve:
    ((value: Readonly<{ done: boolean; value?: Uint8Array }>) => void) | null =
    null;

  public push(value: Uint8Array): void {
    if (this.#resolve !== null) {
      const resolve = this.#resolve;
      this.#resolve = null;
      resolve({ done: false, value });
    } else {
      this.#values.push(value);
    }
  }

  public read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>> {
    const value = this.#values.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    return new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  public close(): void {
    this.#resolve?.({ done: true });
    this.#resolve = null;
  }
}

function fakePort(): {
  readonly port: HardwareSerialPort;
  readonly writes: Uint8Array[];
  readonly writer: HardwareSerialWriter & {
    readonly write: ReturnType<typeof vi.fn>;
    readonly abort: ReturnType<typeof vi.fn>;
  };
} {
  const queue = new Queue();
  const writes: Uint8Array[] = [];
  queue.push(new Uint8Array([0x43]));
  const reader: HardwareSerialReader = {
    read: () => queue.read(),
    cancel: async () => queue.close(),
    releaseLock: vi.fn(),
  };
  const writer = {
    write: vi.fn(async (data: Uint8Array) => {
      writes.push(data.slice());
      if (data[0] === 0x01 || data[0] === 0x04) {
        queue.push(new Uint8Array([0x06]));
      }
    }),
    abort: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };
  return {
    writes,
    writer,
    port: {
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("XMODEM-CRC flasher", () => {
  it("matches the standard CRC-16/XMODEM check vector", () => {
    expect(crc16Xmodem(new TextEncoder().encode("123456789"))).toBe(0x31c3);
  });

  it("transfers padded blocks and only succeeds after each ACK and final EOT ACK", async () => {
    const hardware = fakePort();
    const firmware = new Uint8Array(129).map((_, index) => index & 0xff);

    const result = await flashXmodemFirmware({
      port: hardware.port,
      firmware,
    });

    expect(result).toEqual({ bytesWritten: 129, blocks: 2 });
    expect(hardware.writes).toHaveLength(3);
    expect(hardware.writes[0]?.byteLength).toBe(133);
    expect(hardware.writes[1]?.byteLength).toBe(133);
    expect(hardware.writes[2]).toEqual(new Uint8Array([0x04]));
  });

  it("aborts a hanging serial write and still confirms port cleanup", async () => {
    const hardware = fakePort();
    const pendingWrite = deferred<void>();
    hardware.writer.write.mockImplementation(() => pendingWrite.promise);
    const controller = new AbortController();
    const operation = flashXmodemFirmware({
      port: hardware.port,
      firmware: new Uint8Array([1]),
      signal: controller.signal,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: "ABORTED",
    });

    await flushUntil(() => hardware.writer.write.mock.calls.length === 1);
    controller.abort();

    await rejection;
    expect(hardware.writer.abort).toHaveBeenCalledTimes(1);
    expect(hardware.port.close).toHaveBeenCalledTimes(1);

    pendingWrite.reject(new Error("late write failure"));
    await Promise.resolve();
  });

  it("fails closed when the serial port cannot be confirmed closed", async () => {
    const hardware = fakePort();
    vi.mocked(hardware.port.close).mockRejectedValue(new Error("close failed"));

    await expect(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: "CLEANUP_UNCONFIRMED" });
  });
});
