import { CrsfStreamParser, type CrsfFrame } from "./crsf";

export const EXPRESSLRS_CRSF_BAUD_RATE = 420_000 as const;
const HARDWARE_SERIAL_CLEANUP_TIMEOUT_MS = 1_000;

export interface HardwareSerialPortInfo {
  readonly usbVendorId: number | null;
  readonly usbProductId: number | null;
}

export interface HardwareSerialReader {
  read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

export interface HardwareSerialWriter {
  write(data: Uint8Array): Promise<void>;
  releaseLock(): void;
}

export interface HardwareSerialPort {
  readonly readable?: { getReader(): HardwareSerialReader } | null;
  readonly writable?: { getWriter(): HardwareSerialWriter } | null;
  ondisconnect?: ((event: Event) => void) | null;
  open(options: {
    readonly baudRate: number;
    readonly dataBits?: 7 | 8;
    readonly stopBits?: 1 | 2;
    readonly parity?: "none" | "even" | "odd";
    readonly bufferSize?: number;
    readonly flowControl?: "none" | "hardware";
  }): Promise<void>;
  close(): Promise<void>;
  forget?(): Promise<void>;
  getInfo?(): {
    readonly usbVendorId?: number;
    readonly usbProductId?: number;
  };
  setSignals?(signals: {
    readonly dataTerminalReady?: boolean;
    readonly requestToSend?: boolean;
    readonly break?: boolean;
  }): Promise<void>;
}

interface HardwareSerialApi {
  requestPort(options?: {
    readonly filters?: readonly {
      readonly usbVendorId?: number;
      readonly usbProductId?: number;
    }[];
  }): Promise<HardwareSerialPort>;
}

interface NavigatorWithSerial {
  readonly serial?: HardwareSerialApi;
}

export type HardwareSerialOpenFailure =
  | "UNSUPPORTED"
  | "INSECURE_CONTEXT"
  | "CANCELLED"
  | "PERMISSION_DENIED"
  | "OPEN_FAILED"
  | "STREAMS_UNAVAILABLE"
  | "CLEANUP_UNCONFIRMED";

export type HardwareSerialOpenOutcome =
  | Readonly<{
      status: "OPEN";
      port: HardwareSerialPort;
      info: HardwareSerialPortInfo;
      baudRate: number;
    }>
  | Readonly<{ status: HardwareSerialOpenFailure }>;

function errorName(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name;
  }
  return error instanceof Error ? error.name : "";
}

function safeIdentifier(value: unknown): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 0xffff
    ? (value as number)
    : null;
}

function confirmHardwareSerialPortClosed(
  port: HardwareSerialPort,
): Promise<boolean> {
  let closeTask: Promise<void>;
  try {
    closeTask = port.close();
  } catch {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(closed);
    };
    const timer = setTimeout(
      () => finish(false),
      HARDWARE_SERIAL_CLEANUP_TIMEOUT_MS,
    );

    // Keep both handlers attached if the deadline wins so a late browser
    // settlement cannot become an unhandled rejection.
    void closeTask.then(
      () => finish(true),
      () => finish(false),
    );
  });
}

export function readHardwareSerialPortInfo(
  port: HardwareSerialPort,
): HardwareSerialPortInfo {
  try {
    const info = port.getInfo?.();
    return Object.freeze({
      usbVendorId: safeIdentifier(info?.usbVendorId),
      usbProductId: safeIdentifier(info?.usbProductId),
    });
  } catch {
    return Object.freeze({ usbVendorId: null, usbProductId: null });
  }
}

export async function requestAndOpenHardwareSerial(
  input: {
    readonly navigatorObject?: unknown;
    readonly secureContext?: boolean;
    readonly baudRate?: number;
  } = {},
): Promise<HardwareSerialOpenOutcome> {
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

  let serial: HardwareSerialApi | undefined;
  try {
    serial = (navigatorObject as NavigatorWithSerial).serial;
  } catch {
    return Object.freeze({ status: "UNSUPPORTED" });
  }
  if (serial === undefined || typeof serial.requestPort !== "function") {
    return Object.freeze({ status: "UNSUPPORTED" });
  }

  let port: HardwareSerialPort;
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

  const baudRate =
    Number.isSafeInteger(input.baudRate) &&
    (input.baudRate ?? 0) >= 1_200 &&
    (input.baudRate ?? 0) <= 4_000_000
      ? (input.baudRate as number)
      : EXPRESSLRS_CRSF_BAUD_RATE;
  try {
    await port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      bufferSize: 65_536,
      flowControl: "none",
    });
  } catch {
    return Object.freeze({ status: "OPEN_FAILED" });
  }

  if (port.readable == null || port.writable == null) {
    if (!(await confirmHardwareSerialPortClosed(port))) {
      return Object.freeze({ status: "CLEANUP_UNCONFIRMED" });
    }
    return Object.freeze({ status: "STREAMS_UNAVAILABLE" });
  }

  return Object.freeze({
    status: "OPEN",
    port,
    info: readHardwareSerialPortInfo(port),
    baudRate,
  });
}

export class HardwareSerialError extends Error {
  public constructor(
    public readonly code:
      "CLOSED" | "READ_FAILED" | "WRITE_FAILED" | "TIMEOUT" | "ABORTED",
    message: string,
  ) {
    super(message);
    this.name = "HardwareSerialError";
  }
}

type FramePredicate = (frame: CrsfFrame) => boolean;

interface PendingFrame {
  readonly predicate: FramePredicate;
  readonly resolve: (frame: CrsfFrame) => void;
  readonly reject: (error: HardwareSerialError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

export class CrsfSerialLink {
  readonly #parser = new CrsfStreamParser();
  readonly #pending = new Set<PendingFrame>();
  readonly #listeners = new Set<(frame: CrsfFrame) => void>();
  readonly #rawListeners = new Set<(chunk: Uint8Array) => void>();
  readonly #port: HardwareSerialPort;
  #reader: HardwareSerialReader | null = null;
  #writer: HardwareSerialWriter | null = null;
  #readTask: Promise<void> | null = null;
  #cleanupTask: Promise<void> | null = null;
  #portCloseTask: Promise<boolean> | null = null;
  #portClosed = false;
  #closed = false;

  public constructor(port: HardwareSerialPort) {
    this.#port = port;
  }

  public get port(): HardwareSerialPort {
    return this.#port;
  }

  public get closed(): boolean {
    return this.#closed;
  }

  public start(): void {
    if (this.#closed) {
      throw new HardwareSerialError(
        "CLOSED",
        "Cannot start a closed serial link",
      );
    }
    if (this.#readTask !== null) {
      return;
    }
    const readable = this.#port.readable;
    const writable = this.#port.writable;
    if (readable == null || writable == null) {
      throw new HardwareSerialError(
        "CLOSED",
        "The selected serial port does not expose readable and writable streams",
      );
    }
    let reader: HardwareSerialReader;
    try {
      reader = readable.getReader();
    } catch {
      throw new HardwareSerialError(
        "CLOSED",
        "The selected serial reader could not be acquired",
      );
    }

    let writer: HardwareSerialWriter;
    try {
      writer = writable.getWriter();
    } catch {
      try {
        reader.releaseLock();
      } catch {
        // The reader acquisition is rolled back on a best-effort basis.
      }
      throw new HardwareSerialError(
        "CLOSED",
        "The selected serial writer could not be acquired",
      );
    }

    this.#reader = reader;
    this.#writer = writer;
    this.#readTask = this.#readLoop();
  }

  public subscribe(listener: (frame: CrsfFrame) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public subscribeRaw(listener: (chunk: Uint8Array) => void): () => void {
    this.#rawListeners.add(listener);
    return () => this.#rawListeners.delete(listener);
  }

  public async write(bytes: Uint8Array): Promise<void> {
    if (this.#closed || this.#writer === null) {
      throw new HardwareSerialError("CLOSED", "The serial link is not open");
    }
    try {
      await this.#writer.write(bytes);
    } catch {
      throw new HardwareSerialError(
        "WRITE_FAILED",
        "Writing to the serial port failed",
      );
    }
  }

  public async request(
    bytes: Uint8Array,
    predicate: FramePredicate,
    input: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
  ): Promise<CrsfFrame> {
    const waiting = this.waitForFrame(predicate, input);
    try {
      await this.write(bytes);
    } catch (error: unknown) {
      waiting.cancel();
      await waiting.promise.catch(() => undefined);
      throw error;
    }
    return waiting.promise;
  }

  public waitForFrame(
    predicate: FramePredicate,
    input: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
  ): { readonly promise: Promise<CrsfFrame>; readonly cancel: () => void } {
    if (this.#closed) {
      const error = new HardwareSerialError(
        "CLOSED",
        "The serial link is closed",
      );
      return Object.freeze({
        promise: Promise.reject(error),
        cancel: () => undefined,
      });
    }
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 1_500, 50), 30_000);
    let pending: PendingFrame;
    const promise = new Promise<CrsfFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#removePending(pending);
        reject(
          new HardwareSerialError(
            "TIMEOUT",
            "The device did not answer before the deadline",
          ),
        );
      }, timeoutMs);
      const onAbort = input.signal
        ? () => {
            this.#removePending(pending);
            reject(
              new HardwareSerialError(
                "ABORTED",
                "The device request was cancelled",
              ),
            );
          }
        : undefined;
      pending = {
        predicate,
        resolve,
        reject,
        timer,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(onAbort === undefined ? {} : { onAbort }),
      };
      this.#pending.add(pending);
      input.signal?.addEventListener("abort", onAbort as EventListener, {
        once: true,
      });
      if (input.signal?.aborted === true) {
        onAbort?.();
      }
    });
    return Object.freeze({
      promise,
      cancel: () => {
        if (this.#pending.has(pending)) {
          this.#removePending(pending);
          pending.reject(
            new HardwareSerialError(
              "ABORTED",
              "The device request was cancelled",
            ),
          );
        }
      },
    });
  }

  public async close(
    input: { readonly closePort?: boolean } = {},
  ): Promise<boolean> {
    this.#closed = true;
    this.#rejectAll(
      new HardwareSerialError("CLOSED", "The serial link was closed"),
    );

    await this.#cleanupResources();

    if (input.closePort === false || this.#portClosed) {
      return true;
    }
    if (this.#portCloseTask === null) {
      const closeTask = this.#port
        .close()
        .then(() => {
          this.#portClosed = true;
          return true;
        })
        .catch(() => false)
        .finally(() => {
          if (!this.#portClosed && this.#portCloseTask === closeTask) {
            this.#portCloseTask = null;
          }
        });
      this.#portCloseTask = closeTask;
    }
    return this.#portCloseTask;
  }

  #cleanupResources(): Promise<void> {
    if (this.#cleanupTask !== null) {
      return this.#cleanupTask;
    }
    const reader = this.#reader;
    const writer = this.#writer;
    const readTask = this.#readTask;
    this.#reader = null;
    this.#writer = null;
    this.#readTask = null;

    this.#cleanupTask = (async () => {
      try {
        await reader?.cancel();
      } catch {
        // Reader cancellation is best effort; locks are still released below.
      }
      try {
        await readTask;
      } catch {
        // The read loop already mapped the failure to pending operations.
      }
      try {
        reader?.releaseLock();
      } catch {
        // A browser may already have released a disconnected reader lock.
      }
      try {
        writer?.releaseLock();
      } catch {
        // A browser may already have released a disconnected writer lock.
      }
    })();
    return this.#cleanupTask;
  }

  async #readLoop(): Promise<void> {
    const reader = this.#reader;
    if (reader === null) {
      return;
    }
    try {
      while (!this.#closed) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        if (result.value === undefined || result.value.byteLength === 0) {
          continue;
        }
        for (const listener of this.#rawListeners) {
          try {
            listener(result.value);
          } catch {
            // Raw observers cannot interrupt protocol delivery.
          }
        }
        for (const frame of this.#parser.push(result.value)) {
          this.#dispatch(frame);
        }
      }
      if (!this.#closed) {
        this.#closed = true;
        this.#rejectAll(
          new HardwareSerialError(
            "READ_FAILED",
            "The device serial stream ended unexpectedly",
          ),
        );
        queueMicrotask(() => {
          void this.close();
        });
      }
    } catch {
      if (!this.#closed) {
        this.#closed = true;
        this.#rejectAll(
          new HardwareSerialError(
            "READ_FAILED",
            "Reading from the serial port failed",
          ),
        );
        queueMicrotask(() => {
          void this.close();
        });
      }
    }
  }

  #dispatch(frame: CrsfFrame): void {
    for (const listener of this.#listeners) {
      try {
        listener(frame);
      } catch {
        // Observers cannot interrupt protocol delivery.
      }
    }
    for (const pending of this.#pending) {
      let matches = false;
      try {
        matches = pending.predicate(frame);
      } catch {
        matches = false;
      }
      if (matches) {
        this.#removePending(pending);
        pending.resolve(frame);
        break;
      }
    }
  }

  #removePending(pending: PendingFrame): void {
    if (!this.#pending.delete(pending)) {
      return;
    }
    clearTimeout(pending.timer);
    if (pending.signal !== undefined && pending.onAbort !== undefined) {
      pending.signal.removeEventListener(
        "abort",
        pending.onAbort as EventListener,
      );
    }
  }

  #rejectAll(error: HardwareSerialError): void {
    for (const pending of [...this.#pending]) {
      this.#removePending(pending);
      pending.reject(error);
    }
  }
}
