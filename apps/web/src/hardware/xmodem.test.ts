import { afterEach, describe, expect, it, vi } from "vitest";

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

    expect(result).toEqual({
      bytesWritten: 129,
      blocks: 2,
      mode: "crc",
      verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
    });
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

// ---------------------------------------------------------------------------
// Round L: negotiation, the handshake window, retransmission and cancellation.
// Each test below was written against the previous driver and failed there.
// ---------------------------------------------------------------------------

const SOH = 0x01;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;
const CAN = 0x18;
const CRC_REQUEST = 0x43;

/** The exact bytes a 128-byte block must carry in each mode. */
function expectedFrame(
  block: number,
  payload: Uint8Array,
  mode: "crc" | "checksum",
): Uint8Array {
  if (payload.byteLength !== 128)
    throw new Error("test payload must be 128 bytes");
  const trailer =
    mode === "crc"
      ? [(crc16Xmodem(payload) >>> 8) & 0xff, crc16Xmodem(payload) & 0xff]
      : [payload.reduce((sum, byte) => (sum + byte) & 0xff, 0)];
  return new Uint8Array([
    SOH,
    block & 0xff,
    0xff - (block & 0xff),
    ...payload,
    ...trailer,
  ]);
}

function padded(bytes: Uint8Array, start: number): Uint8Array {
  const out = new Uint8Array(128).fill(0x1a);
  out.set(bytes.slice(start, start + 128));
  return out;
}

/**
 * A receiver whose every answer is scripted per written frame, so silence,
 * NAKs, stray handshake bytes and cancellation can each be produced exactly.
 */
function scriptedPort(script: {
  readonly opening?: readonly number[];
  readonly answer?: (
    frame: Uint8Array,
    index: number,
  ) => readonly number[] | null;
}): {
  readonly port: HardwareSerialPort;
  readonly writes: Uint8Array[];
  readonly deliver: (bytes: readonly number[]) => void;
  readonly writer: HardwareSerialWriter & {
    readonly write: ReturnType<typeof vi.fn>;
    readonly abort: ReturnType<typeof vi.fn>;
  };
  readonly readerCancelled: () => boolean;
} {
  const queue = new Queue();
  const writes: Uint8Array[] = [];
  let index = 0;
  let cancelled = false;
  if (script.opening !== undefined) queue.push(new Uint8Array(script.opening));
  const reader: HardwareSerialReader = {
    read: () => queue.read(),
    cancel: async () => {
      cancelled = true;
      queue.close();
    },
    releaseLock: vi.fn(),
  };
  const writer = {
    write: vi.fn(async (data: Uint8Array) => {
      writes.push(data.slice());
      const reply = script.answer?.(data, index);
      index += 1;
      if (reply !== null && reply !== undefined && reply.length > 0) {
        queue.push(new Uint8Array(reply));
      }
    }),
    abort: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };
  return {
    writes,
    writer,
    deliver: (bytes) => queue.push(new Uint8Array(bytes)),
    readerCancelled: () => cancelled,
    port: {
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
  };
}

const isFrame = (data: Uint8Array) => data[0] === SOH;
const isEot = (data: Uint8Array) => data.byteLength === 1 && data[0] === EOT;

async function settle<T>(
  operation: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return operation.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

describe("XMODEM negotiation: the receiver's opening byte selects the trailer", () => {
  it("answers a NAK opening with 132-byte checksum packets and a C opening with 133-byte CRC packets", async () => {
    const firmware = new Uint8Array(200).map(
      (_, index) => (index * 7 + 3) & 0xff,
    );

    const checksum = scriptedPort({
      opening: [NAK],
      answer: (data) => (isFrame(data) || isEot(data) ? [ACK] : null),
    });
    await expect(
      flashXmodemFirmware({ port: checksum.port, firmware }),
    ).resolves.toEqual({
      bytesWritten: 200,
      blocks: 2,
      mode: "checksum",
      verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
    });
    expect(checksum.writes).toEqual([
      expectedFrame(1, padded(firmware, 0), "checksum"),
      expectedFrame(2, padded(firmware, 128), "checksum"),
      new Uint8Array([EOT]),
    ]);
    expect(checksum.writes[0]?.byteLength).toBe(132);

    const crc = scriptedPort({
      opening: [CRC_REQUEST],
      answer: (data) => (isFrame(data) || isEot(data) ? [ACK] : null),
    });
    await expect(
      flashXmodemFirmware({ port: crc.port, firmware }),
    ).resolves.toEqual({
      bytesWritten: 200,
      blocks: 2,
      mode: "crc",
      verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
    });
    expect(crc.writes).toEqual([
      expectedFrame(1, padded(firmware, 0), "crc"),
      expectedFrame(2, padded(firmware, 128), "crc"),
      new Uint8Array([EOT]),
    ]);
    expect(crc.writes[0]?.byteLength).toBe(133);
  });

  it("ignores the handshake bytes a receiver keeps repeating after the first block went out", async () => {
    // The ExpressLRS bootloader prints `C` once a second until the first
    // block arrives; the ones already queued must not be read as NAKs.
    const hardware = scriptedPort({
      opening: [CRC_REQUEST, CRC_REQUEST, CRC_REQUEST],
      answer: (data) => (isFrame(data) || isEot(data) ? [ACK] : null),
    });
    await expect(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([9]),
      }),
    ).resolves.toEqual({
      bytesWritten: 1,
      blocks: 1,
      mode: "crc",
      verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
    });
    expect(hardware.writes.filter(isFrame)).toHaveLength(1);
  });
});

describe("XMODEM handshake window", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a handshake that arrives after 1.2 s of silence", async () => {
    vi.useFakeTimers();
    const hardware = scriptedPort({
      answer: (data) => (isFrame(data) || isEot(data) ? [ACK] : null),
    });
    const outcome = settle(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([1, 2, 3]),
      }),
    );
    await vi.advanceTimersByTimeAsync(1_200);
    expect(hardware.writes).toHaveLength(0);
    hardware.deliver([CRC_REQUEST]);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome).toEqual({
      ok: true,
      value: {
        bytesWritten: 3,
        blocks: 1,
        mode: "crc",
        verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
      },
    });
  });

  it("accepts a late handshake that is still inside the window", async () => {
    vi.useFakeTimers();
    const hardware = scriptedPort({
      answer: (data) => (isFrame(data) || isEot(data) ? [ACK] : null),
    });
    const outcome = settle(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([1]),
      }),
    );
    await vi.advanceTimersByTimeAsync(9_500);
    expect(hardware.writes).toHaveLength(0);
    hardware.deliver([NAK]);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome).toEqual({
      ok: true,
      value: {
        bytesWritten: 1,
        blocks: 1,
        mode: "checksum",
        verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
      },
    });
  });

  it("names the handshake as the failure once the whole window has passed in silence", async () => {
    vi.useFakeTimers();
    const hardware = scriptedPort({});
    const outcome = settle(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([1]),
      }),
    );
    await vi.advanceTimersByTimeAsync(9_900);
    hardware.deliver([0x41]); // text, not a handshake: does not count
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "HANDSHAKE_TIMEOUT" } });
    expect(hardware.writes).toHaveLength(0);
    expect(hardware.port.close).toHaveBeenCalledTimes(1);
  });
});

describe("XMODEM retransmission, completion and cancellation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retransmits the identical block when its ACK is lost, then finishes", async () => {
    vi.useFakeTimers();
    let blockSends = 0;
    const hardware = scriptedPort({
      opening: [CRC_REQUEST],
      answer: (data) => {
        if (isFrame(data)) {
          blockSends += 1;
          return blockSends === 1 ? null : [ACK];
        }
        return isEot(data) ? [ACK] : null;
      },
    });
    const outcome = settle(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([5, 6]),
      }),
    );
    await vi.advanceTimersByTimeAsync(3_100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toEqual({
      ok: true,
      value: {
        bytesWritten: 2,
        blocks: 1,
        mode: "crc",
        verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
      },
    });
    const frames = hardware.writes.filter(isFrame);
    expect(frames).toHaveLength(2);
    expect(frames[1]).toEqual(frames[0]);
    expect(hardware.writes.at(-1)).toEqual(new Uint8Array([EOT]));
  });

  it("gives up after the retry limit, tells the receiver, and names the block and the count", async () => {
    vi.useFakeTimers();
    const hardware = scriptedPort({ opening: [CRC_REQUEST] });
    const outcome = settle(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([1]),
      }),
    );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await vi.advanceTimersByTimeAsync(3_100);
    }
    await vi.advanceTimersByTimeAsync(100);
    const result = await outcome;
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: {
        code: "TRANSFER_TIMEOUT",
        message: expect.stringMatching(/block 1 .*10 attempts/u),
      },
    });
    const frames = hardware.writes.filter(isFrame);
    expect(frames).toHaveLength(10);
    expect(new Set(frames.map((frame) => frame.join(","))).size).toBe(1);
    expect(hardware.writes.at(-1)).toEqual(new Uint8Array([CAN, CAN]));
    expect(hardware.port.close).toHaveBeenCalledTimes(1);
  });

  it("re-sends EOT when the receiver NAKs it or stays silent, and completes on its ACK", async () => {
    vi.useFakeTimers();
    let eots = 0;
    const hardware = scriptedPort({
      opening: [CRC_REQUEST],
      answer: (data) => {
        if (isFrame(data)) return [ACK];
        if (isEot(data)) {
          eots += 1;
          if (eots === 1) return [NAK];
          if (eots === 2) return null;
          return [ACK];
        }
        return null;
      },
    });
    const outcome = settle(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([1]),
      }),
    );
    await vi.advanceTimersByTimeAsync(3_100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toEqual({
      ok: true,
      value: {
        bytesWritten: 1,
        blocks: 1,
        mode: "crc",
        verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
      },
    });
    expect(hardware.writes.filter(isEot)).toHaveLength(3);
  });

  it("cancels a transfer the receiver has gone quiet on: CAN goes out, the reader is cancelled, the port closes", async () => {
    vi.useFakeTimers();
    const hardware = scriptedPort({ opening: [CRC_REQUEST] });
    const controller = new AbortController();
    const outcome = settle(
      flashXmodemFirmware({
        port: hardware.port,
        firmware: new Uint8Array([1]),
        signal: controller.signal,
      }),
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(hardware.writes.filter(isFrame)).toHaveLength(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    const result = await outcome;
    expect(result).toMatchObject({ ok: false, error: { code: "ABORTED" } });
    expect(hardware.writes.at(-1)).toEqual(new Uint8Array([CAN, CAN]));
    expect(hardware.readerCancelled()).toBe(true);
    expect(hardware.writer.releaseLock).toHaveBeenCalled();
    expect(hardware.port.close).toHaveBeenCalledTimes(1);
  });
});
