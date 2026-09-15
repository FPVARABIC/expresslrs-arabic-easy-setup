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
/** Attempts per block and for the final EOT before the transfer is given up. */
const MAX_RETRIES = 10;
/**
 * How long the receiver has to open the transfer with `C` or NAK. The
 * ExpressLRS bootloader prints its banner and then repeats `C` about once a
 * second; the official flasher waits up to 15 s for it after the reset.
 */
const HANDSHAKE_WINDOW_MS = 10_000;
/** How long one block or EOT waits for a decisive answer before it is re-sent. */
const ANSWER_TIMEOUT_MS = 3_000;
const WRITE_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 1_000;

/**
 * Which trailer the receiver asked for. XMODEM lets the *receiver* choose: a
 * `C` opens a CRC-16 transfer, a NAK opens the original 8-bit-checksum one,
 * and a sender that answers a NAK opening with CRC frames is rejected block
 * after block.
 */
export type XmodemMode = "crc" | "checksum";

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

function aborted(): XmodemError {
  return new XmodemError("ABORTED", "XMODEM transfer was cancelled");
}

function writeWithDeadline(
  writer: HardwareSerialWriter,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  if (isAbortRequested(signal)) {
    throw aborted();
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
    const onAbort = () => rejectOnce(aborted());
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

/** The original XMODEM trailer: the low byte of the sum of the 128 data bytes. */
export function xmodemChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const byte of bytes) sum = (sum + byte) & 0xff;
  return sum;
}

/**
 * One 128-byte block: SOH, block number, its complement, the data, and the
 * trailer the receiver asked for. Byte-identical every time it is re-sent.
 */
export function xmodemPacket(
  blockNumber: number,
  payload: Uint8Array,
  mode: XmodemMode,
): Uint8Array {
  if (payload.byteLength !== BLOCK_BYTES) {
    throw new RangeError("XMODEM payload must contain 128 bytes");
  }
  const trailerLength = mode === "crc" ? 2 : 1;
  const bytes = new Uint8Array(3 + BLOCK_BYTES + trailerLength);
  bytes[0] = SOH;
  bytes[1] = blockNumber & 0xff;
  bytes[2] = 0xff - (blockNumber & 0xff);
  bytes.set(payload, 3);
  if (mode === "crc") {
    const crc = crc16Xmodem(payload);
    bytes[3 + BLOCK_BYTES] = (crc >>> 8) & 0xff;
    bytes[4 + BLOCK_BYTES] = crc & 0xff;
  } else {
    bytes[3 + BLOCK_BYTES] = xmodemChecksum(payload);
  }
  return bytes;
}

class ByteInbox {
  readonly #bytes: number[] = [];
  readonly #waiters = new Set<() => void>();

  public push(chunk: Uint8Array): void {
    for (const byte of chunk) this.#bytes.push(byte);
    for (const wake of [...this.#waiters]) wake();
  }

  /**
   * The next byte, or a `TRANSFER_TIMEOUT` once `timeoutMs` has passed, or
   * `ABORTED` as soon as the signal fires — cancellation does not wait for
   * the next poll.
   */
  public async next(input: {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<number> {
    const deadline = Date.now() + input.timeoutMs;
    while (this.#bytes.length === 0) {
      if (isAbortRequested(input.signal)) throw aborted();
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
          input.signal?.removeEventListener("abort", wake);
          resolve();
        };
        const timer = setTimeout(wake, Math.min(remaining, 250));
        this.#waiters.add(wake);
        input.signal?.addEventListener("abort", wake, { once: true });
      });
    }
    return this.#bytes.shift() ?? 0;
  }
}

/** What the receiver said about one frame, once it said anything decisive. */
type Verdict = "ack" | "nak" | "silence";

export interface XmodemTransferResult {
  readonly bytesWritten: number;
  readonly blocks: number;
  /** The trailer the receiver negotiated, which is the only thing it verified per block. */
  readonly mode: XmodemMode;
  /** Per-frame acknowledgement is all this protocol offers: nothing is read back. */
  readonly verification: "RECEIVER_ACKNOWLEDGED_FRAMES";
}

export async function flashXmodemFirmware(input: {
  readonly port: HardwareSerialPort;
  readonly firmware: Uint8Array;
  readonly baudRate?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: FirmwareFlashProgressListener;
}): Promise<Readonly<XmodemTransferResult>> {
  if (
    input.firmware.byteLength === 0 ||
    input.firmware.byteLength > 4 * 1024 * 1024
  ) {
    throw new RangeError(
      "XMODEM firmware size is outside the 1-byte to 4-MiB limit",
    );
  }
  if (isAbortRequested(input.signal)) throw aborted();
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

  /**
   * Tells the receiver the transfer is over (two CANs, as the protocol
   * specifies) when this side gives up or is cancelled. Best effort and
   * bounded: a writer that is already stuck is not asked to do more.
   */
  let cancelNoticeSent = false;
  const notifyReceiverOfCancel = async (): Promise<void> => {
    if (writerNeedsAbort || cancelNoticeSent) return;
    cancelNoticeSent = true;
    const delivered = await cleanupWithin(() =>
      writer.write(new Uint8Array([CAN, CAN])),
    );
    if (!delivered) {
      writerNeedsAbort = true;
      writerAbortReason = aborted();
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

  /**
   * Waits for the receiver's verdict on the frame just sent. Only ACK, NAK
   * and CAN decide anything; a repeated handshake byte or line noise is
   * ignored rather than read as a rejection, and silence for the whole
   * window is reported as such so the caller can re-send.
   */
  const awaitVerdict = async (what: string): Promise<Verdict> => {
    const deadline = Date.now() + ANSWER_TIMEOUT_MS;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return "silence";
      let answer: number;
      try {
        answer = await inbox.next({
          timeoutMs: remaining,
          signal: input.signal,
        });
      } catch (error: unknown) {
        if (error instanceof XmodemError && error.code === "TRANSFER_TIMEOUT") {
          return "silence";
        }
        throw error;
      }
      if (answer === ACK) return "ack";
      if (answer === NAK) return "nak";
      if (answer === CAN) {
        throw new XmodemError(
          "TRANSFER_REJECTED",
          `Receiver cancelled ${what}`,
        );
      }
      // `C` again (the bootloader repeats it until the first block lands), or
      // anything else: not a verdict on this frame.
    }
  };

  try {
    input.onProgress?.({
      stage: "BOOTLOADER",
      writtenBytes: 0,
      totalBytes: input.firmware.byteLength,
      detail:
        "Waiting for the receiver's XMODEM handshake (C for CRC-16, NAK for checksum)",
    });
    let mode: XmodemMode | null = null;
    const handshakeDeadline = Date.now() + HANDSHAKE_WINDOW_MS;
    while (mode === null) {
      const remaining = handshakeDeadline - Date.now();
      if (remaining <= 0) break;
      let byte: number;
      try {
        byte = await inbox.next({ timeoutMs: remaining, signal: input.signal });
      } catch (error: unknown) {
        if (error instanceof XmodemError && error.code === "TRANSFER_TIMEOUT") {
          break;
        }
        throw error;
      }
      if (byte === CRC_REQUEST) mode = "crc";
      else if (byte === NAK) mode = "checksum";
      else if (byte === CAN) {
        throw new XmodemError(
          "TRANSFER_REJECTED",
          "Receiver cancelled the XMODEM transfer",
        );
      }
      // Banner text before the handshake is not a handshake.
    }
    if (mode === null) {
      throw new XmodemError(
        "HANDSHAKE_TIMEOUT",
        `Receiver did not request an XMODEM transfer within ${HANDSHAKE_WINDOW_MS / 1000} s`,
      );
    }
    const negotiatedMode: XmodemMode = mode;

    const blockCount = Math.ceil(input.firmware.byteLength / BLOCK_BYTES);
    input.onProgress?.({
      stage: "WRITE",
      writtenBytes: 0,
      totalBytes: input.firmware.byteLength,
      detail: `XMODEM ${negotiatedMode === "crc" ? "CRC-16" : "checksum"} transfer of ${blockCount} blocks started`,
    });
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      if (isAbortRequested(input.signal)) throw aborted();
      const payload = new Uint8Array(BLOCK_BYTES).fill(PAD);
      const start = blockIndex * BLOCK_BYTES;
      payload.set(input.firmware.slice(start, start + BLOCK_BYTES));
      const blockNumber = blockIndex + 1;
      const frame = xmodemPacket(blockNumber & 0xff, payload, negotiatedMode);
      let verdict: Verdict = "silence";
      let attempts = 0;
      while (verdict !== "ack" && attempts < MAX_RETRIES) {
        attempts += 1;
        // The same bytes every time: a lost ACK is answered by the identical
        // frame, which a receiver that did get it accepts as a duplicate.
        await write(frame);
        verdict = await awaitVerdict(`XMODEM block ${blockNumber}`);
      }
      if (verdict !== "ack") {
        await notifyReceiverOfCancel();
        throw verdict === "silence"
          ? new XmodemError(
              "TRANSFER_TIMEOUT",
              `Receiver did not acknowledge XMODEM block ${blockNumber} in ${attempts} attempts`,
            )
          : new XmodemError(
              "TRANSFER_REJECTED",
              `Receiver rejected XMODEM block ${blockNumber} after ${attempts} attempts`,
            );
      }
      input.onProgress?.({
        stage: "WRITE",
        writtenBytes: Math.min(
          blockNumber * BLOCK_BYTES,
          input.firmware.byteLength,
        ),
        totalBytes: input.firmware.byteLength,
        detail: `Receiver acknowledged XMODEM block ${blockNumber}/${blockCount}${attempts > 1 ? ` after ${attempts} attempts` : ""}`,
      });
    }

    let eotVerdict: Verdict = "silence";
    let eotAttempts = 0;
    while (eotVerdict !== "ack" && eotAttempts < MAX_RETRIES) {
      eotAttempts += 1;
      await write(new Uint8Array([EOT]));
      eotVerdict = await awaitVerdict("the XMODEM completion");
    }
    if (eotVerdict !== "ack") {
      await notifyReceiverOfCancel();
      throw new XmodemError(
        eotVerdict === "silence" ? "TRANSFER_TIMEOUT" : "TRANSFER_REJECTED",
        `Receiver did not acknowledge XMODEM completion in ${eotAttempts} attempts`,
      );
    }
    input.onProgress?.({
      stage: "VERIFY",
      writtenBytes: input.firmware.byteLength,
      totalBytes: input.firmware.byteLength,
      detail: `Receiver acknowledged every block (${negotiatedMode === "crc" ? "CRC-16" : "checksum"} checked by the receiver) and the final EOT; nothing was read back`,
    });
    return Object.freeze({
      bytesWritten: input.firmware.byteLength,
      blocks: blockCount,
      mode: negotiatedMode,
      verification: "RECEIVER_ACKNOWLEDGED_FRAMES",
    });
  } catch (error: unknown) {
    if (error instanceof XmodemError && error.code === "ABORTED") {
      await notifyReceiverOfCancel();
    }
    throw error;
  } finally {
    if (!(await close())) {
      throw new XmodemError(
        "CLEANUP_UNCONFIRMED",
        "XMODEM ended, but the serial port could not be confirmed closed",
      );
    }
  }
}
