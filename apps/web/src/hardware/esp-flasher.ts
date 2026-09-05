import { bytesToHex, md5Bytes } from "./bind-phrase";
import type { HardwareSerialPort } from "./serial";
import type {
  FirmwareFlashProgressListener,
  FirmwareSegment,
  OfficialTarget,
} from "./parity-types";

import { isAbortRequested } from "./byte-utils";

const BOOTLOADER_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 180_000;
const RESET_TIMEOUT_MS = 15_000;
const CLEANUP_TIMEOUT_MS = 2_000;
const ESP8266_FLASH_BYTES = 0x10_0000;
const ESP32_FLASH_BYTES = 0x40_0000;

interface EspToolTransport {
  disconnect(): Promise<void>;
}

interface EspToolLoader {
  main(resetMode?: string): Promise<string>;
  writeFlash(options: {
    readonly fileArray: readonly Readonly<{
      readonly data: Uint8Array;
      readonly address: number;
    }>[];
    readonly flashSize: string;
    readonly flashMode: string;
    readonly flashFreq: string;
    readonly eraseAll: boolean;
    readonly compress: boolean;
    readonly reportProgress: (
      fileIndex: number,
      written: number,
      total: number,
    ) => void;
    readonly calculateMD5Hash: (image: Uint8Array) => string;
  }): Promise<void>;
  after(resetMode: string): Promise<void>;
}

interface EspToolModule {
  readonly Transport: new (
    port: unknown,
    tracing?: boolean,
  ) => EspToolTransport;
  readonly ESPLoader: new (options: {
    readonly transport: EspToolTransport;
    readonly baudrate: number;
    readonly romBaudrate?: number;
    readonly debugLogging?: boolean;
    readonly terminal: {
      clean(): void;
      writeLine(data: string): void;
      write(data: string): void;
    };
  }) => EspToolLoader;
}

export class EspFlashError extends Error {
  public cleanupVerified = true;

  public constructor(
    public readonly code:
      "PLATFORM_MISMATCH" | "BOOTLOADER" | "WRITE" | "RESET" | "ABORTED",
    message: string,
  ) {
    super(message);
    this.name = "EspFlashError";
  }
}

function markCleanupUnverified(error: unknown): void {
  if (error instanceof EspFlashError) {
    error.cleanupVerified = false;
    return;
  }
  if (
    error === null ||
    typeof error !== "object" ||
    !Object.isExtensible(error)
  )
    return;
  try {
    Object.defineProperty(error, "cleanupVerified", {
      value: false,
      enumerable: true,
    });
  } catch {
    // The primary failure still causes the caller to enter recovery mode.
  }
}

function runBoundedOperation<T>(input: {
  readonly operation: () => Promise<T>;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  readonly timeoutError: EspFlashError;
}): Promise<T> {
  if (isAbortRequested(input.signal)) {
    return Promise.reject(
      new EspFlashError("ABORTED", "Firmware flashing was cancelled"),
    );
  }
  let task: Promise<T>;
  try {
    task = input.operation();
  } catch (error: unknown) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    };
    const resolveOnce = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () =>
      rejectOnce(
        new EspFlashError("ABORTED", "Firmware flashing was cancelled"),
      );
    const timer = setTimeout(
      () => rejectOnce(input.timeoutError),
      input.timeoutMs,
    );
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted === true) onAbort();
    void task.then(resolveOnce, rejectOnce);
  });
}

function settleCleanupWithin(
  operation: () => Promise<unknown>,
  timeoutMs = CLEANUP_TIMEOUT_MS,
): Promise<boolean> {
  let task: Promise<unknown>;
  try {
    task = operation();
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (verified: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(verified);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    void task.then(
      () => finish(true),
      () => finish(false),
    );
  });
}

type EspChipFamily = "esp8266" | "esp32" | "esp32-c3" | "esp32-s2" | "esp32-s3";

function expectedChip(platform: string): EspChipFamily {
  const normalized = platform.toLocaleLowerCase("en-US");
  if (normalized.includes("8285") || normalized.includes("8266")) {
    return "esp8266";
  }
  if (normalized.startsWith("esp32-c3")) return "esp32-c3";
  if (normalized.startsWith("esp32-s3")) return "esp32-s3";
  if (normalized.startsWith("esp32-s2")) return "esp32-s2";
  if (normalized === "esp32") return "esp32";
  throw new EspFlashError(
    "PLATFORM_MISMATCH",
    `Target platform ${platform} is not an Espressif platform`,
  );
}

function detectedChip(chipName: string): EspChipFamily | null {
  const normalized = chipName
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (/^esp32-c3(?:$|-)/u.test(normalized)) return "esp32-c3";
  if (/^esp32-s3(?:$|-)/u.test(normalized)) return "esp32-s3";
  if (/^esp32-s2(?:$|-)/u.test(normalized)) return "esp32-s2";
  if (/^esp32-(?:c|s|h|p)\d(?:$|-)/u.test(normalized)) return null;
  if (/^esp32(?:$|-)/u.test(normalized)) return "esp32";
  if (/^esp8285(?:$|-)/u.test(normalized)) return "esp8266";
  if (/^esp8266(?:ex)?(?:$|-)/u.test(normalized)) return "esp8266";
  return null;
}

function chipMatches(platform: string, chipName: string): boolean {
  return detectedChip(chipName) === expectedChip(platform);
}

function maximumFlashBytes(platform: string): number {
  return expectedChip(platform) === "esp8266"
    ? ESP8266_FLASH_BYTES
    : ESP32_FLASH_BYTES;
}

function validatedTotalBytes(
  segments: readonly FirmwareSegment[],
  platform: string,
): number {
  if (segments.length === 0) {
    throw new EspFlashError("WRITE", "Firmware package has no flash segments");
  }

  const flashBytes = maximumFlashBytes(platform);
  const seenAddresses = new Set<number>();
  const ranges: Array<Readonly<{ start: number; end: number; name: string }>> =
    [];
  let total = 0;
  for (const segment of segments) {
    if (segment.bytes.byteLength === 0) {
      throw new EspFlashError(
        "WRITE",
        `Firmware segment ${segment.name} contains no data`,
      );
    }
    if (
      !Number.isSafeInteger(segment.address) ||
      segment.address < 0 ||
      segment.address > 0xffff_ffff
    ) {
      throw new EspFlashError(
        "WRITE",
        `Firmware segment ${segment.name} has an invalid flash address`,
      );
    }
    if (seenAddresses.has(segment.address)) {
      throw new EspFlashError(
        "WRITE",
        `Firmware segment ${segment.name} duplicates a flash address`,
      );
    }

    const endAddress = segment.address + segment.bytes.byteLength - 1;
    if (!Number.isSafeInteger(endAddress) || endAddress > 0xffff_ffff) {
      throw new EspFlashError(
        "WRITE",
        `Firmware segment ${segment.name} exceeds the flash address range`,
      );
    }
    if (endAddress >= flashBytes) {
      throw new EspFlashError(
        "WRITE",
        `Firmware segment ${segment.name} exceeds the target flash capacity`,
      );
    }
    const nextTotal = total + segment.bytes.byteLength;
    if (!Number.isSafeInteger(nextTotal)) {
      throw new EspFlashError(
        "WRITE",
        "Firmware package byte count is not safe to process",
      );
    }
    seenAddresses.add(segment.address);
    ranges.push({
      start: segment.address,
      end: endAddress,
      name: segment.name,
    });
    total = nextTotal;
  }

  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      current.start <= previous.end
    ) {
      throw new EspFlashError(
        "WRITE",
        `Firmware segment ${current.name} overlaps ${previous.name}`,
      );
    }
  }
  return total;
}

export async function flashEspFirmware(input: {
  readonly port: HardwareSerialPort;
  readonly target: OfficialTarget;
  readonly segments: readonly FirmwareSegment[];
  readonly baudRate?: number;
  readonly resetMode?: "default_reset" | "no_reset" | "hard_reset";
  readonly eraseAll?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: FirmwareFlashProgressListener;
  readonly onLog?: (line: string) => void;
}): Promise<
  Readonly<{
    chipName: string;
    bytesWritten: number;
    cleanupVerified: boolean;
  }>
> {
  if (isAbortRequested(input.signal)) {
    throw new EspFlashError("ABORTED", "Firmware flashing was cancelled");
  }
  const byteCount = validatedTotalBytes(
    input.segments,
    input.target.config.platform,
  );
  input.onProgress?.({
    stage: "PRECHECK",
    writtenBytes: 0,
    totalBytes: byteCount,
    detail: "Validated firmware segment table",
  });

  const imported = (await import("esptool-js")) as unknown as EspToolModule;
  const transport = new imported.Transport(input.port, true);
  let completion: {
    chipName: string;
    bytesWritten: number;
    cleanupVerified: boolean;
  } | null = null;
  let operationFailure: unknown = null;

  try {
    let loader: EspToolLoader;
    try {
      loader = new imported.ESPLoader({
        transport,
        baudrate: input.baudRate ?? 460_800,
        romBaudrate: 115_200,
        debugLogging: false,
        terminal: {
          clean() {
            input.onLog?.("");
          },
          writeLine(data) {
            input.onLog?.(data);
          },
          write(data) {
            input.onLog?.(data);
          },
        },
      });
    } catch (error: unknown) {
      throw new EspFlashError(
        "BOOTLOADER",
        error instanceof Error
          ? error.message
          : "Espressif loader could not be created",
      );
    }

    input.onProgress?.({
      stage: "BOOTLOADER",
      writtenBytes: 0,
      totalBytes: byteCount,
      detail: "Connecting to the Espressif ROM bootloader",
    });
    let chipName: string;
    try {
      chipName = await runBoundedOperation({
        operation: () => loader.main(input.resetMode ?? "default_reset"),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        timeoutMs: BOOTLOADER_TIMEOUT_MS,
        timeoutError: new EspFlashError(
          "BOOTLOADER",
          "Espressif ROM bootloader connection timed out",
        ),
      });
    } catch (error: unknown) {
      if (error instanceof EspFlashError) throw error;
      throw new EspFlashError(
        "BOOTLOADER",
        error instanceof Error
          ? error.message
          : "Espressif ROM bootloader did not answer",
      );
    }
    if (!chipMatches(input.target.config.platform, chipName)) {
      throw new EspFlashError(
        "PLATFORM_MISMATCH",
        `Connected chip ${chipName} does not match ${input.target.config.platform}`,
      );
    }
    if (isAbortRequested(input.signal)) {
      throw new EspFlashError("ABORTED", "Firmware flashing was cancelled");
    }

    input.onProgress?.({
      stage: input.eraseAll === true ? "ERASE" : "WRITE",
      writtenBytes: 0,
      totalBytes: byteCount,
      detail:
        input.eraseAll === true
          ? "Erasing flash before writing"
          : "Starting verified firmware transfer",
    });
    const completedByFile = new Map<number, number>();
    try {
      await runBoundedOperation({
        operation: () =>
          loader.writeFlash({
            fileArray: input.segments.map((segment) => ({
              data: segment.bytes,
              address: segment.address,
            })),
            flashSize: "keep",
            flashMode: "keep",
            flashFreq: "keep",
            eraseAll: input.eraseAll === true,
            compress: true,
            reportProgress(fileIndex, written, total) {
              if (isAbortRequested(input.signal)) {
                throw new EspFlashError(
                  "ABORTED",
                  "Firmware flashing was cancelled",
                );
              }
              completedByFile.set(fileIndex, Math.min(written, total));
              const writtenBytes = [...completedByFile.values()].reduce(
                (sum, value) => sum + value,
                0,
              );
              input.onProgress?.({
                stage: "WRITE",
                writtenBytes: Math.min(writtenBytes, byteCount),
                totalBytes: byteCount,
                detail: `Writing segment ${fileIndex + 1}/${input.segments.length}`,
              });
            },
            calculateMD5Hash(image) {
              return bytesToHex(md5Bytes(image));
            },
          }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        timeoutMs: WRITE_TIMEOUT_MS,
        timeoutError: new EspFlashError(
          "WRITE",
          "Espressif firmware write timed out",
        ),
      });
    } catch (error: unknown) {
      if (error instanceof EspFlashError) throw error;
      throw new EspFlashError(
        "WRITE",
        error instanceof Error ? error.message : "Firmware write failed",
      );
    }

    input.onProgress?.({
      stage: "VERIFY",
      writtenBytes: byteCount,
      totalBytes: byteCount,
      detail: "Bootloader accepted the verified image checksums",
    });
    try {
      await runBoundedOperation({
        operation: () => loader.after("hard_reset"),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        timeoutMs: RESET_TIMEOUT_MS,
        timeoutError: new EspFlashError("RESET", "Device reset timed out"),
      });
    } catch (error: unknown) {
      if (error instanceof EspFlashError) throw error;
      throw new EspFlashError(
        "RESET",
        error instanceof Error ? error.message : "Device reset failed",
      );
    }
    input.onProgress?.({
      stage: "RESET",
      writtenBytes: byteCount,
      totalBytes: byteCount,
      detail: "Device reset requested",
    });
    completion = { chipName, bytesWritten: byteCount, cleanupVerified: true };
    return completion;
  } catch (error: unknown) {
    operationFailure = error;
    throw error;
  } finally {
    const cleanupVerified = await settleCleanupWithin(() =>
      transport.disconnect(),
    );
    if (!cleanupVerified) {
      if (completion !== null) {
        completion.cleanupVerified = false;
      } else {
        markCleanupUnverified(operationFailure);
      }
    }
    if (completion !== null) Object.freeze(completion);
  }
}
