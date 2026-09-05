import {
  maximumCompressedFirmwareArtifactSizeBytes,
  maximumFirmwareArtifactDecompressionChunks,
  maximumFirmwareArtifactDecompressionChunkSizeBytes,
  maximumFirmwareArtifactSizeBytes,
  type CancellationSignal,
  type FirmwareArtifactDecompressionChunkSink,
  type FirmwareArtifactDecompressionProvider,
} from "@elrs-easy/domain";

function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    const error = new Error("The Firmware decompression was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

function copyExactUint8Array(value: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    if (Object.getPrototypeOf(value) !== Uint8Array.prototype) {
      return null;
    }
    return Uint8Array.prototype.slice.call(value) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
}

type GzipDecompressionStreamFactory = () => DecompressionStream;

const gzipHeaderMinimumSize = 18 as const;
const gzipTrailerSize = 8 as const;
const crc32Polynomial = 0xedb88320 as const;

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new TypeError("BROWSER_GZIP_TRAILER_INVALID");
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(offset, true);
}

function validateGzipHeader(bytes: Uint8Array): void {
  const flags = bytes[3];
  if (
    bytes.byteLength < gzipHeaderMinimumSize ||
    bytes[0] !== 0x1f ||
    bytes[1] !== 0x8b ||
    bytes[2] !== 0x08 ||
    flags === undefined ||
    (flags & 0xe0) !== 0
  ) {
    throw new TypeError("BROWSER_GZIP_HEADER_INVALID");
  }
}

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let nextCrc = crc;
  for (const byte of bytes) {
    nextCrc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      nextCrc =
        (nextCrc & 1) !== 0 ? (nextCrc >>> 1) ^ crc32Polynomial : nextCrc >>> 1;
    }
  }
  return nextCrc >>> 0;
}

function defaultGzipDecompressionStreamFactory(): DecompressionStream {
  const Constructor = globalThis.DecompressionStream;
  if (typeof Constructor !== "function") {
    throw new TypeError("BROWSER_GZIP_DECOMPRESSION_UNAVAILABLE");
  }
  return new Constructor("gzip");
}

/**
 * Streaming Browser gzip primitive. Its assurance remains SYNTHETIC_ONLY until
 * a signed compressed-artifact schema and real executable parsers are admitted.
 */
export class BrowserGzipFirmwareArtifactDecompressionProvider implements FirmwareArtifactDecompressionProvider {
  public readonly assurance = "SYNTHETIC_ONLY" as const;
  readonly #createStream: GzipDecompressionStreamFactory;

  public constructor(
    input: {
      readonly createStream?: GzipDecompressionStreamFactory;
    } = {},
  ) {
    this.#createStream =
      input.createStream ?? defaultGzipDecompressionStreamFactory;
  }

  public async decompressGzip(
    compressedBytes: Uint8Array,
    emitChunk: FirmwareArtifactDecompressionChunkSink,
    signal?: CancellationSignal,
  ): Promise<void> {
    assertNotAborted(signal);
    const inputCopy = copyExactUint8Array(compressedBytes);
    if (
      inputCopy === null ||
      inputCopy.byteLength < gzipHeaderMinimumSize ||
      inputCopy.byteLength > maximumCompressedFirmwareArtifactSizeBytes ||
      typeof emitChunk !== "function"
    ) {
      throw new TypeError("BROWSER_GZIP_DECOMPRESSION_INPUT_INVALID");
    }
    validateGzipHeader(inputCopy);

    const trailerOffset = inputCopy.byteLength - gzipTrailerSize;
    const expectedCrc32 = readUint32LittleEndian(inputCopy, trailerOffset);
    const expectedSize = readUint32LittleEndian(inputCopy, trailerOffset + 4);

    let stream: DecompressionStream;
    try {
      stream = this.#createStream();
    } catch {
      throw new TypeError("BROWSER_GZIP_DECOMPRESSION_UNAVAILABLE");
    }

    const immutableInput = new Blob([inputCopy]);
    const reader = immutableInput.stream().pipeThrough(stream).getReader();
    let outputSizeBytes = 0;
    let emittedChunks = 0;
    let crc32 = 0xffffffff;

    try {
      while (true) {
        assertNotAborted(signal);
        const next = await reader.read();
        assertNotAborted(signal);
        if (next.done) {
          break;
        }
        const platformChunk = copyExactUint8Array(next.value);
        if (platformChunk === null || platformChunk.byteLength === 0) {
          throw new TypeError("BROWSER_GZIP_DECOMPRESSION_OUTPUT_INVALID");
        }

        for (
          let offset = 0;
          offset < platformChunk.byteLength;
          offset += maximumFirmwareArtifactDecompressionChunkSizeBytes
        ) {
          const chunk = platformChunk.slice(
            offset,
            offset + maximumFirmwareArtifactDecompressionChunkSizeBytes,
          );
          outputSizeBytes += chunk.byteLength;
          emittedChunks += 1;
          if (
            outputSizeBytes > maximumFirmwareArtifactSizeBytes ||
            emittedChunks > maximumFirmwareArtifactDecompressionChunks
          ) {
            throw new RangeError("BROWSER_GZIP_DECOMPRESSION_LIMIT_EXCEEDED");
          }
          crc32 = updateCrc32(crc32, chunk);
          emitChunk(chunk);
        }
      }
      const actualCrc32 = (crc32 ^ 0xffffffff) >>> 0;
      const actualSize = outputSizeBytes >>> 0;
      if (actualCrc32 !== expectedCrc32 || actualSize !== expectedSize) {
        throw new TypeError("BROWSER_GZIP_TRAILER_MISMATCH");
      }
    } catch (error: unknown) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the bounded, fixed-category failure from the read or sink.
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
}
