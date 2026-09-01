import { bytesToHex, md5Bytes } from "./bind-phrase";
import type { HardwareSerialPort } from "./serial";
import type {
  FirmwareFlashProgressListener,
  FirmwareSegment,
  OfficialTarget,
} from "./parity-types";

import { isAbortRequested } from "./byte-utils";
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
  public constructor(
    public readonly code:
      "PLATFORM_MISMATCH" | "BOOTLOADER" | "WRITE" | "RESET" | "ABORTED",
    message: string,
  ) {
    super(message);
    this.name = "EspFlashError";
  }
}

function expectedChip(platform: string): readonly string[] {
  const normalized = platform.toLocaleLowerCase("en-US");
  if (normalized.includes("8285") || normalized.includes("8266")) {
    return Object.freeze(["esp8266", "esp8285"]);
  }
  if (normalized.startsWith("esp32-c3")) return Object.freeze(["esp32-c3"]);
  if (normalized.startsWith("esp32-s3")) return Object.freeze(["esp32-s3"]);
  if (normalized.startsWith("esp32-s2")) return Object.freeze(["esp32-s2"]);
  if (normalized.startsWith("esp32")) return Object.freeze(["esp32"]);
  throw new EspFlashError(
    "PLATFORM_MISMATCH",
    `Target platform ${platform} is not an Espressif platform`,
  );
}

function chipMatches(platform: string, chipName: string): boolean {
  const actual = chipName.toLocaleLowerCase("en-US").replaceAll(" ", "-");
  return expectedChip(platform).some((expected) => actual.includes(expected));
}

function totalBytes(segments: readonly FirmwareSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.bytes.byteLength, 0);
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
}): Promise<Readonly<{ chipName: string; bytesWritten: number }>> {
  if (isAbortRequested(input.signal)) {
    throw new EspFlashError("ABORTED", "Firmware flashing was cancelled");
  }
  if (input.segments.length === 0) {
    throw new EspFlashError("WRITE", "Firmware package has no flash segments");
  }
  const byteCount = totalBytes(input.segments);
  input.onProgress?.({
    stage: "PRECHECK",
    writtenBytes: 0,
    totalBytes: byteCount,
    detail: "Validated firmware segment table",
  });

  const imported = (await import("esptool-js")) as unknown as EspToolModule;
  const transport = new imported.Transport(input.port, true);
  const loader = new imported.ESPLoader({
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

  try {
    input.onProgress?.({
      stage: "BOOTLOADER",
      writtenBytes: 0,
      totalBytes: byteCount,
      detail: "Connecting to the Espressif ROM bootloader",
    });
    let chipName: string;
    try {
      chipName = await loader.main(input.resetMode ?? "default_reset");
    } catch (error: unknown) {
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
      await loader.writeFlash({
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
      await loader.after("hard_reset");
    } catch (error: unknown) {
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
    return Object.freeze({ chipName, bytesWritten: byteCount });
  } finally {
    try {
      await transport.disconnect();
    } catch {
      // The device can disappear immediately after reset; disconnect is best effort.
    }
  }
}
