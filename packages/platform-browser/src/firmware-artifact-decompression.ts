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
      inputCopy.byteLength < 18 ||
      inputCopy.byteLength > maximumCompressedFirmwareArtifactSizeBytes ||
      typeof emitChunk !== "function"
    ) {
      throw new TypeError("BROWSER_GZIP_DECOMPRESSION_INPUT_INVALID");
    }

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
          emitChunk(chunk);
        }
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
