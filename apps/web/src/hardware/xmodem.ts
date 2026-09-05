import type { HardwareSerialPort, HardwareSerialWriter } from "./serial";
import type { FirmwareFlashProgressListener } from "./parity-types";

import { isAbortRequested } from "./byte-utils";
const SOH = 0x01;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;
const CAN = 0x18;
const CRC_REQUEST = 0x43;
const PAD = 0x1a;
const BLOCK_BYTES = 128;
const MAX_RETRIES = 10;
const WRITE_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 1_000;

export class XmodemError extends Error {
  public constructor(
    public readonly code:
      | "OPEN_FAILED"
      | "STREAMS_UNAVAILABLE"
      | "HANDSHAKE_TIMEOUT"
      | "TRANSFER_REJECTED"
      | "TRANSFER_TIMEOUT"
      | "CLEANUP_UNCONFIRMED"
      | "ABORTED",
    message: string,
  ) {
    super(message);
    this.name = "XmodemError";
  }
}

function writeWithDeadline(
  writer: HardwareSerialWriter,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  if (isAbortRequested(signal)) {
    throw new XmodemError("ABORTED", "XMODEM transfer was cancelled");
  }
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
    const onAbort = () =>
      rejectOnce(new XmodemError("ABORTED", "XMODEM transfer was cancelled"));
    const timer = setTimeout(
      () =>
        rejectOnce(
          new XmodemError(
            "TRANSFER_TIMEOUT",
            "XMODEM serial write did not settle before the deadline",
          ),
        ),
      WRITE_TIMEOUT_MS,
    );

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
      return;
    }

    let task: Promise<void>;
    try {
      task = writer.write(bytes);
    } catch (error: unknown) {
      rejectOnce(error);
      return;
    }
    // Keep handlers attached if timeout/Abort wins so late stream settlement
    // cannot become an unhandled rejection.
    void task.then(resolveOnce, rejectOnce);
  });
}

function cleanupWithin(operation: () => Promise<unknown>): Promise<boolean> {
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
    const timer = setTimeout(() => finish(false), CLEANUP_TIMEOUT_MS);
    void task.then(
      () => finish(true),
      () => finish(false),
    );
  });
}

export function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function packet(blockNumber: number, payload: Uint8Array): Uint8Array {
  if (payload.byteLength !== BLOCK_BYTES) {
    throw new RangeError("XMODEM payload must contain 128 bytes");
  }
  const crc = crc16Xmodem(payload);
  const bytes = new Uint8Array(3 + BLOCK_BYTES + 2);
  bytes[0] = SOH;
  bytes[1] = blockNumber & 0xff;
  bytes[2] = 0xff - (blockNumber & 0xff);
  bytes.set(payload, 3);
  bytes[3 + BLOCK_BYTES] = (crc >>> 8) & 0xff;
  bytes[4 + BLOCK_BYTES] = crc & 0xff;
  return bytes;
}

class ByteInbox {
  readonly #bytes: number[] = [];
  readonly #waiters = new Set<() => void>();

  public push(chunk: Uint8Array): void {
    for (const byte of chunk) this.#bytes.push(byte);
    for (const wake of [...this.#waiters]) wake();
  }

  public async next(input: {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<number> {
    const deadline = Date.now() + input.timeoutMs;
    while (this.#bytes.length === 0) {
      if (isAbortRequested(input.signal)) {
        throw new XmodemError("ABORTED", "XMODEM transfer was cancelled");
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new XmodemError(
          "TRANSFER_TIMEOUT",
          "XMODEM receiver did not answer before the deadline",
        );
      }
      await new Promise<void>((resolve) => {
        const wake = () => {
          clearTimeout(timer);
          this.#waiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, Math.min(remaining, 250));
        this.#waiters.add(wake);
      });
    }
    return this.#bytes.shift() ?? 0;
  }
}

export async function flashXmodemFirmware(input: {
  readonly port: HardwareSerialPort;
  readonly firmware: Uint8Array;
  readonly baudRate?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: FirmwareFlashProgressListener;
}): Promise<Readonly<{ bytesWritten: number; blocks: number }>> {
  if (
    input.firmware.byteLength === 0 ||
    input.firmware.byteLength > 4 * 1024 * 1024
  ) {
    throw new RangeError(
      "XMODEM firmware size is outside the 1-byte to 4-MiB limit",
    );
  }
  if (isAbortRequested(input.signal)) {
    throw new XmodemError("ABORTED", "XMODEM transfer was cancelled");
  }
  try {
    await input.port.open({
      baudRate: input.baudRate ?? 420_000,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      bufferSize: 65_536,
      flowControl: "none",
    });
  } catch {
    throw new XmodemError(
      "OPEN_FAILED",
      "XMODEM serial port could not be opened",
    );
  }
  const readable = input.port.readable;
  const writable = input.port.writable;
  if (readable == null || writable == null) {
    if (!(await cleanupWithin(() => input.port.close()))) {
      throw new XmodemError(
        "CLEANUP_UNCONFIRMED",
        "XMODEM streams were unavailable and the serial port could not be confirmed closed",
      );
    }
    throw new XmodemError(
      "STREAMS_UNAVAILABLE",
      "XMODEM port does not expose readable and writable streams",
    );
  }
  const reader = readable.getReader();
  const writer = writable.getWriter();
  const inbox = new ByteInbox();
  let reading = true;
  let writerNeedsAbort = false;
  let writerAbortReason: unknown;
  const readTask = (async () => {
    try {
      while (reading) {
        const result = await reader.read();
        if (result.done) break;
        if (result.value !== undefined) inbox.push(result.value);
      }
    } catch {
      // The transfer loop will time out or observe cancellation.
    }
  })();

  const write = async (bytes: Uint8Array): Promise<void> => {
    try {
      await writeWithDeadline(writer, bytes, input.signal);
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
      cleanupWithin(() => reader.cancel()),
      writerNeedsAbort && typeof abortWriter === "function"
        ? cleanupWithin(() => abortWriter.call(writer, writerAbortReason))
        : Promise.resolve(true),
    ]);
    await cleanupWithin(() => readTask);
    try {
      reader.releaseLock();
    } catch {
      // Best effort.
    }
    try {
      writer.releaseLock();
    } catch {
      // Best effort.
    }
    return cleanupWithin(() => input.port.close());
  };

  try {
    input.onProgress?.({
      stage: "BOOTLOADER",
      writtenBytes: 0,
      totalBytes: input.firmware.byteLength,
      detail: "Waiting for XMODEM-CRC receiver handshake",
    });
    let handshake = -1;
    const handshakeDeadline = Date.now() + 10_000;
    while (Date.now() < handshakeDeadline) {
      const byte = await inbox.next({ timeoutMs: 1_000, signal: input.signal });
      if (byte === CRC_REQUEST || byte === NAK) {
        handshake = byte;
        break;
      }
      if (byte === CAN) {
        throw new XmodemError(
          "TRANSFER_REJECTED",
          "Receiver cancelled the XMODEM transfer",
        );
      }
    }
    if (handshake < 0) {
      throw new XmodemError(
        "HANDSHAKE_TIMEOUT",
        "Receiver did not request an XMODEM transfer",
      );
    }

    const blockCount = Math.ceil(input.firmware.byteLength / BLOCK_BYTES);
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      if (isAbortRequested(input.signal)) {
        throw new XmodemError("ABORTED", "XMODEM transfer was cancelled");
      }
      const payload = new Uint8Array(BLOCK_BYTES).fill(PAD);
      const start = blockIndex * BLOCK_BYTES;
      payload.set(input.firmware.slice(start, start + BLOCK_BYTES));
      const frame = packet((blockIndex + 1) & 0xff, payload);
      let accepted = false;
      for (let attempt = 0; attempt < MAX_RETRIES && !accepted; attempt += 1) {
        await write(frame);
        const answer = await inbox.next({
          timeoutMs: 3_000,
          signal: input.signal,
        });
        if (answer === ACK) {
          accepted = true;
          break;
        }
        if (answer === CAN) {
          throw new XmodemError(
            "TRANSFER_REJECTED",
            `Receiver cancelled XMODEM block ${blockIndex + 1}`,
          );
        }
        if (answer !== NAK && answer !== CRC_REQUEST) {
          continue;
        }
      }
      if (!accepted) {
        await write(new Uint8Array([CAN, CAN]));
        throw new XmodemError(
          "TRANSFER_REJECTED",
          `Receiver rejected XMODEM block ${blockIndex + 1} after ${MAX_RETRIES} attempts`,
        );
      }
      input.onProgress?.({
        stage: "WRITE",
        writtenBytes: Math.min(
          (blockIndex + 1) * BLOCK_BYTES,
          input.firmware.byteLength,
        ),
        totalBytes: input.firmware.byteLength,
        detail: `Transferred XMODEM block ${blockIndex + 1}/${blockCount}`,
      });
    }

    let eotAccepted = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !eotAccepted; attempt += 1) {
      await write(new Uint8Array([EOT]));
      const answer = await inbox.next({
        timeoutMs: 3_000,
        signal: input.signal,
      });
      if (answer === ACK) eotAccepted = true;
      if (answer === CAN) {
        throw new XmodemError(
          "TRANSFER_REJECTED",
          "Receiver cancelled the XMODEM completion",
        );
      }
    }
    if (!eotAccepted) {
      throw new XmodemError(
        "TRANSFER_REJECTED",
        "Receiver did not acknowledge XMODEM completion",
      );
    }
    input.onProgress?.({
      stage: "VERIFY",
      writtenBytes: input.firmware.byteLength,
      totalBytes: input.firmware.byteLength,
      detail: "Receiver acknowledged every block and the final EOT",
    });
    return Object.freeze({
      bytesWritten: input.firmware.byteLength,
      blocks: blockCount,
    });
  } finally {
    if (!(await close())) {
      throw new XmodemError(
        "CLEANUP_UNCONFIRMED",
        "XMODEM ended, but the serial port could not be confirmed closed",
      );
    }
  }
}
