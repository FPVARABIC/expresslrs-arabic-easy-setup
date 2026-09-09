import {
  maximumCompressedFirmwareArtifactSizeBytes,
  maximumFirmwareArtifactDecompressionChunks,
  maximumFirmwareArtifactDecompressionChunkSizeBytes,
  maximumFirmwareArtifactSizeBytes,
  syntheticCompressedFirmwareArtifactSchemaVersion,
  syntheticCompressedFirmwareArtifactType,
  syntheticFirmwareExecutableByteForm,
  syntheticFirmwareExecutableFormat,
  type FirmwareArtifactDecompressionChunkSink,
  type FirmwareArtifactDecompressionProvider,
  type FirmwareArtifactDigestProvider,
  type SyntheticCompressedFirmwareArtifactDescriptorV1,
} from "@elrs-easy/domain";
import { describe, expect, it, vi } from "vitest";

import {
  inspectSyntheticFirmwareExecutable,
  validateSyntheticCompressedFirmwareArtifact,
} from "./firmware-compressed-artifact.js";

const textEncoder = new TextEncoder();
const executableMagic = textEncoder.encode("ELRSEASYFWIMAGE!");

function buildSyntheticExecutable(
  input: {
    readonly targetIdentifier?: string;
    readonly payload?: Uint8Array;
  } = {},
): Uint8Array {
  const target = textEncoder.encode(
    input.targetIdentifier ?? "synthetic.tx.2g4",
  );
  const payload = input.payload ?? new Uint8Array([0x10, 0x20, 0x30, 0x40]);
  const bytes = new Uint8Array(22 + target.byteLength + payload.byteLength);
  bytes.set(executableMagic, 0);
  bytes[16] = 1;
  bytes[17] = target.byteLength;
  new DataView(bytes.buffer).setUint32(18, payload.byteLength, false);
  bytes.set(target, 22);
  bytes.set(payload, 22 + target.byteLength);
  return bytes;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

/** Builds a deterministic gzip fixture using only uncompressed DEFLATE blocks. */
function gzip(bytes: Uint8Array): Uint8Array {
  const blockCount = Math.ceil(bytes.byteLength / 0xffff);
  const output = new Uint8Array(10 + blockCount * 5 + bytes.byteLength + 8);
  output.set([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0xff]);
  const view = new DataView(output.buffer);
  let inputOffset = 0;
  let outputOffset = 10;
  while (inputOffset < bytes.byteLength) {
    const blockLength = Math.min(0xffff, bytes.byteLength - inputOffset);
    const finalBlock = inputOffset + blockLength === bytes.byteLength;
    output[outputOffset] = finalBlock ? 1 : 0;
    view.setUint16(outputOffset + 1, blockLength, true);
    view.setUint16(outputOffset + 3, ~blockLength & 0xffff, true);
    output.set(
      bytes.subarray(inputOffset, inputOffset + blockLength),
      outputOffset + 5,
    );
    inputOffset += blockLength;
    outputOffset += 5 + blockLength;
  }
  view.setUint32(outputOffset, crc32(bytes), true);
  view.setUint32(outputOffset + 4, bytes.byteLength >>> 0, true);
  return output;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes.slice()),
  );
  return Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function cryptographicDigestProvider(): FirmwareArtifactDigestProvider {
  return Object.freeze({
    assurance: "CRYPTOGRAPHIC",
    digestSha256: sha256,
  });
}

function scriptedDecompressionProvider(
  run: (
    compressedBytes: Uint8Array,
    emitChunk: FirmwareArtifactDecompressionChunkSink,
  ) => void | Promise<void>,
): {
  readonly provider: FirmwareArtifactDecompressionProvider;
  readonly decompressGzip: ReturnType<typeof vi.fn>;
} {
  const decompressGzip = vi.fn(
    async (
      compressedBytes: Uint8Array,
      emitChunk: FirmwareArtifactDecompressionChunkSink,
    ) => {
      await run(compressedBytes, emitChunk);
    },
  );
  return {
    provider: {
      assurance: "SYNTHETIC_ONLY",
      decompressGzip,
    },
    decompressGzip,
  };
}

interface SyntheticFixture {
  readonly compressedBytes: Uint8Array;
  readonly decompressedBytes: Uint8Array;
  readonly descriptor: SyntheticCompressedFirmwareArtifactDescriptorV1;
}

async function createFixture(
  input: {
    readonly descriptorTargetIdentifier?: string;
    readonly embeddedTargetIdentifier?: string;
    readonly payload?: Uint8Array;
  } = {},
): Promise<SyntheticFixture> {
  const decompressedBytes = buildSyntheticExecutable({
    targetIdentifier: input.embeddedTargetIdentifier ?? "synthetic.tx.2g4",
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  });
  const compressedBytes = gzip(decompressedBytes);
  return {
    compressedBytes,
    decompressedBytes,
    descriptor: {
      schemaVersion: syntheticCompressedFirmwareArtifactSchemaVersion,
      artifactType: syntheticCompressedFirmwareArtifactType,
      compression: "gzip",
      decompressedByteForm: syntheticFirmwareExecutableByteForm,
      executableFormat: syntheticFirmwareExecutableFormat,
      targetIdentifier: input.descriptorTargetIdentifier ?? "synthetic.tx.2g4",
      compressedSizeBytes: compressedBytes.byteLength,
      compressedSha256: await sha256(compressedBytes),
      decompressedSizeBytes: decompressedBytes.byteLength,
      decompressedSha256: await sha256(decompressedBytes),
    },
  };
}

function providerForBytes(bytes: Uint8Array): {
  readonly provider: FirmwareArtifactDecompressionProvider;
  readonly decompressGzip: ReturnType<typeof vi.fn>;
} {
  const snapshot = bytes.slice();
  return scriptedDecompressionProvider((_compressedBytes, emitChunk) => {
    const split = Math.max(1, Math.floor(snapshot.byteLength / 2));
    emitChunk(snapshot.slice(0, split));
    emitChunk(snapshot.slice(split));
  });
}

async function validateFixture(
  fixture: SyntheticFixture,
  provider: FirmwareArtifactDecompressionProvider,
  digestProvider: FirmwareArtifactDigestProvider = cryptographicDigestProvider(),
) {
  return validateSyntheticCompressedFirmwareArtifact({
    descriptor: fixture.descriptor,
    compressedBytes: fixture.compressedBytes,
    digestProvider,
    decompressionProvider: provider,
  });
}

describe("Synthetic compressed Firmware artifact validation", () => {
  it("verifies both byte forms and the embedded Target without exposing bytes", async () => {
    const fixture = await createFixture();
    let providerInput: Uint8Array | undefined;
    const { provider, decompressGzip } = scriptedDecompressionProvider(
      (compressedBytes, emitChunk) => {
        providerInput = compressedBytes;
        compressedBytes.fill(0);
        const firstChunk = fixture.decompressedBytes.slice(0, 17);
        const secondChunk = fixture.decompressedBytes.slice(17);
        emitChunk(firstChunk);
        firstChunk.fill(0);
        emitChunk(secondChunk);
        secondChunk.fill(0);
      },
    );

    const result = await validateFixture(fixture, provider);

    expect(result).toMatchObject({
      status: "VERIFIED_SYNTHETIC_FIXTURE",
      validationLevel: "SYNTHETIC_ONLY",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      compressedVerification: {
        status: "VERIFIED",
        assurance: "CRYPTOGRAPHIC",
        byteLength: fixture.compressedBytes.byteLength,
      },
      decompressedVerification: {
        status: "VERIFIED",
        assurance: "CRYPTOGRAPHIC",
        byteLength: fixture.decompressedBytes.byteLength,
      },
      executableIdentity: {
        format: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1",
        schemaVersion: "1",
        targetIdentifier: "synthetic.tx.2g4",
        containerSizeBytes: fixture.decompressedBytes.byteLength,
        executablePayloadSizeBytes: 4,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status === "VERIFIED_SYNTHETIC_FIXTURE") {
      expect(Object.isFrozen(result.descriptor)).toBe(true);
      expect(Object.isFrozen(result.executableIdentity)).toBe(true);
      expect("copyBytes" in result).toBe(false);
    }
    expect(decompressGzip).toHaveBeenCalledOnce();
    expect(providerInput).not.toBe(fixture.compressedBytes);
  });

  it("snapshots compressed bytes before the first asynchronous digest completes", async () => {
    const fixture = await createFixture();
    const original = fixture.compressedBytes.slice();
    let releaseDigest: (() => void) | undefined;
    const firstDigestWait = new Promise<void>((resolve) => {
      releaseDigest = resolve;
    });
    let digestCalls = 0;
    const digestProvider: FirmwareArtifactDigestProvider = {
      assurance: "CRYPTOGRAPHIC",
      async digestSha256(bytes) {
        digestCalls += 1;
        if (digestCalls === 1) {
          await firstDigestWait;
          expect([...bytes]).toEqual([...original]);
        }
        return sha256(bytes);
      },
    };
    const { provider } = providerForBytes(fixture.decompressedBytes);

    const validation = validateFixture(fixture, provider, digestProvider);
    fixture.compressedBytes.fill(0);
    releaseDigest?.();

    await expect(validation).resolves.toMatchObject({
      status: "VERIFIED_SYNTHETIC_FIXTURE",
    });
  });

  it("rejects unknown fields and accessor-backed descriptor values", async () => {
    const fixture = await createFixture();
    const { provider, decompressGzip } = providerForBytes(
      fixture.decompressedBytes,
    );
    const withUnknownField = {
      ...fixture.descriptor,
      downloadUrl: "https://attacker.invalid/firmware.gz",
    };
    let getterCalls = 0;
    const withAccessor = { ...fixture.descriptor };
    Object.defineProperty(withAccessor, "targetIdentifier", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "synthetic.tx.2g4";
      },
    });

    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: withUnknownField,
        compressedBytes: fixture.compressedBytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DESCRIPTOR",
      reason: "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
    });
    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: withAccessor,
        compressedBytes: fixture.compressedBytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DESCRIPTOR",
      reason: "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
    });
    expect(getterCalls).toBe(0);
    expect(decompressGzip).not.toHaveBeenCalled();
  });

  it.each([
    [
      { compression: "deflate" },
      "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
    ],
    [
      { decompressedByteForm: "RAW_TO_WRITE" },
      "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
    ],
    [
      { targetIdentifier: "REAL TARGET" },
      "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
    ],
    [
      {
        compressedSizeBytes: maximumCompressedFirmwareArtifactSizeBytes + 1,
      },
      "SYNTHETIC_COMPRESSED_ARTIFACT_SIZE_LIMIT_EXCEEDED",
    ],
    [
      { decompressedSizeBytes: maximumFirmwareArtifactSizeBytes + 1 },
      "SYNTHETIC_DECOMPRESSED_ARTIFACT_SIZE_LIMIT_EXCEEDED",
    ],
  ] as const)("blocks descriptor override %o", async (override, reason) => {
    const fixture = await createFixture();
    const { provider, decompressGzip } = providerForBytes(
      fixture.decompressedBytes,
    );

    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: { ...fixture.descriptor, ...override },
        compressedBytes: fixture.compressedBytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
      }),
    ).resolves.toEqual({ status: "BLOCKED", stage: "DESCRIPTOR", reason });
    expect(decompressGzip).not.toHaveBeenCalled();
  });

  it("verifies compressed size and digest before invoking decompression", async () => {
    const fixture = await createFixture();
    const { provider, decompressGzip } = providerForBytes(
      fixture.decompressedBytes,
    );

    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: {
          ...fixture.descriptor,
          compressedSizeBytes: fixture.compressedBytes.byteLength + 1,
        },
        compressedBytes: fixture.compressedBytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "COMPRESSED_INPUT",
      reason: "FIRMWARE_ARTIFACT_SIZE_MISMATCH",
    });
    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: { ...fixture.descriptor, compressedSha256: "f".repeat(64) },
        compressedBytes: fixture.compressedBytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "COMPRESSED_INPUT",
      reason: "FIRMWARE_ARTIFACT_DIGEST_MISMATCH",
    });
    expect(decompressGzip).not.toHaveBeenCalled();
  });

  it("requires gzip magic even when the named compressed digest matches", async () => {
    const fixture = await createFixture();
    const bytes = fixture.compressedBytes.slice();
    bytes[0] = 0;
    const { provider, decompressGzip } = providerForBytes(
      fixture.decompressedBytes,
    );

    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: {
          ...fixture.descriptor,
          compressedSha256: await sha256(bytes),
        },
        compressedBytes: bytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "COMPRESSED_INPUT",
      reason: "SYNTHETIC_GZIP_HEADER_INVALID",
    });
    expect(decompressGzip).not.toHaveBeenCalled();
  });

  it("rejects unadmitted or accessor-backed decompression providers", async () => {
    const fixture = await createFixture();
    const run = vi.fn(
      async (
        _bytes: Uint8Array,
        emitChunk: FirmwareArtifactDecompressionChunkSink,
      ) => emitChunk(fixture.decompressedBytes),
    );
    let assuranceGetterCalls = 0;
    const assuranceAccessor = Object.defineProperty(
      { decompressGzip: run },
      "assurance",
      {
        enumerable: true,
        get() {
          assuranceGetterCalls += 1;
          return "SYNTHETIC_ONLY";
        },
      },
    ) as unknown as FirmwareArtifactDecompressionProvider;
    let methodGetterCalls = 0;
    const methodAccessor = Object.defineProperty(
      { assurance: "SYNTHETIC_ONLY" },
      "decompressGzip",
      {
        get() {
          methodGetterCalls += 1;
          return run;
        },
      },
    ) as FirmwareArtifactDecompressionProvider;
    const unadmitted = {
      assurance: "CRYPTOGRAPHIC",
      decompressGzip: run,
    } as unknown as FirmwareArtifactDecompressionProvider;

    for (const provider of [assuranceAccessor, methodAccessor, unadmitted]) {
      await expect(validateFixture(fixture, provider)).resolves.toEqual({
        status: "BLOCKED",
        stage: "DECOMPRESSION",
        reason: "FIRMWARE_ARTIFACT_DECOMPRESSION_PROVIDER_INVALID",
      });
    }
    expect(assuranceGetterCalls).toBe(0);
    expect(methodGetterCalls).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it("admits a prototype data method without executing accessors", async () => {
    const fixture = await createFixture();
    class FixtureProvider implements FirmwareArtifactDecompressionProvider {
      public readonly assurance = "SYNTHETIC_ONLY" as const;

      public async decompressGzip(
        _compressedBytes: Uint8Array,
        emitChunk: FirmwareArtifactDecompressionChunkSink,
      ): Promise<void> {
        emitChunk(fixture.decompressedBytes);
      }
    }

    await expect(
      validateFixture(fixture, new FixtureProvider()),
    ).resolves.toMatchObject({ status: "VERIFIED_SYNTHETIC_FIXTURE" });
  });

  it("sanitizes provider failure and preserves cancellation", async () => {
    const fixture = await createFixture();
    const failed = scriptedDecompressionProvider(() => {
      throw new Error("private-provider-detail");
    });
    const cancelled = scriptedDecompressionProvider(() => {
      const error = new Error("cancelled-private-detail");
      error.name = "AbortError";
      throw error;
    });

    await expect(validateFixture(fixture, failed.provider)).resolves.toEqual({
      status: "BLOCKED",
      stage: "DECOMPRESSION",
      reason: "FIRMWARE_ARTIFACT_DECOMPRESSION_FAILED",
    });
    await expect(
      validateFixture(fixture, cancelled.provider),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each([
    [
      "empty",
      (_bytes: Uint8Array, emit: FirmwareArtifactDecompressionChunkSink) =>
        emit(new Uint8Array()),
      "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_INVALID",
    ],
    [
      "wrong-view",
      (_bytes: Uint8Array, emit: FirmwareArtifactDecompressionChunkSink) =>
        emit(new Uint16Array([1]) as unknown as Uint8Array),
      "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_INVALID",
    ],
    [
      "oversized-chunk",
      (_bytes: Uint8Array, emit: FirmwareArtifactDecompressionChunkSink) =>
        emit(
          new Uint8Array(
            maximumFirmwareArtifactDecompressionChunkSizeBytes + 1,
          ),
        ),
      "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED",
    ],
  ] as const)("blocks %s decompression output", async (_name, run, reason) => {
    const fixture = await createFixture();
    const { provider } = scriptedDecompressionProvider(run);
    await expect(validateFixture(fixture, provider)).resolves.toEqual({
      status: "BLOCKED",
      stage: "DECOMPRESSION",
      reason,
    });
  });

  it("caps the number of accepted output chunks", async () => {
    const fixture = await createFixture({
      payload: new Uint8Array(maximumFirmwareArtifactDecompressionChunks + 8),
    });
    const { provider } = scriptedDecompressionProvider((_bytes, emitChunk) => {
      for (const byte of fixture.decompressedBytes) {
        emitChunk(new Uint8Array([byte]));
      }
    });

    await expect(validateFixture(fixture, provider)).resolves.toEqual({
      status: "BLOCKED",
      stage: "DECOMPRESSION",
      reason: "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_LIMIT_EXCEEDED",
    });
  });

  it("rejects decompressed output that underflows or exceeds the declared size", async () => {
    const fixture = await createFixture();
    const underflow = scriptedDecompressionProvider((_bytes, emitChunk) => {
      emitChunk(fixture.decompressedBytes.slice(0, -1));
    });
    const overflow = scriptedDecompressionProvider((_bytes, emitChunk) => {
      emitChunk(fixture.decompressedBytes);
      emitChunk(new Uint8Array([0]));
    });

    for (const provider of [underflow.provider, overflow.provider]) {
      await expect(validateFixture(fixture, provider)).resolves.toEqual({
        status: "BLOCKED",
        stage: "DECOMPRESSION",
        reason: "FIRMWARE_ARTIFACT_DECOMPRESSED_SIZE_MISMATCH",
      });
    }
  });

  it("hashes the complete decompressed form before identity parsing", async () => {
    const fixture = await createFixture();
    const { provider } = providerForBytes(fixture.decompressedBytes);

    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: {
          ...fixture.descriptor,
          decompressedSha256: "f".repeat(64),
        },
        compressedBytes: fixture.compressedBytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DECOMPRESSED_OUTPUT",
      reason: "FIRMWARE_ARTIFACT_DIGEST_MISMATCH",
    });
  });

  it("blocks an embedded Target that differs from the descriptor", async () => {
    const fixture = await createFixture({
      descriptorTargetIdentifier: "synthetic.tx.2g4",
      embeddedTargetIdentifier: "synthetic.rx.2g4",
    });
    const { provider } = providerForBytes(fixture.decompressedBytes);

    await expect(validateFixture(fixture, provider)).resolves.toEqual({
      status: "BLOCKED",
      stage: "EXECUTABLE_IDENTITY",
      reason: "SYNTHETIC_EXECUTABLE_TARGET_MISMATCH",
    });
  });

  it("ignores emissions after the provider has completed", async () => {
    const fixture = await createFixture();
    let lateEmit: FirmwareArtifactDecompressionChunkSink | undefined;
    const { provider } = scriptedDecompressionProvider((_bytes, emitChunk) => {
      lateEmit = emitChunk;
      emitChunk(fixture.decompressedBytes);
    });

    const result = await validateFixture(fixture, provider);
    expect(result.status).toBe("VERIFIED_SYNTHETIC_FIXTURE");
    expect(() => lateEmit?.(new Uint8Array([0]))).not.toThrow();
  });

  it("fails closed when cancellation is active before decompression", async () => {
    const fixture = await createFixture();
    const { provider, decompressGzip } = providerForBytes(
      fixture.decompressedBytes,
    );

    await expect(
      validateSyntheticCompressedFirmwareArtifact({
        descriptor: fixture.descriptor,
        compressedBytes: fixture.compressedBytes,
        digestProvider: cryptographicDigestProvider(),
        decompressionProvider: provider,
        signal: { aborted: true },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(decompressGzip).not.toHaveBeenCalled();
  });
});

describe("Synthetic executable identity parser", () => {
  it("returns immutable identity evidence without exposing payload bytes", () => {
    const bytes = buildSyntheticExecutable();
    const result = inspectSyntheticFirmwareExecutable(bytes);
    bytes.fill(0);

    expect(result).toEqual({
      status: "IDENTIFIED_SYNTHETIC_FIXTURE",
      identity: {
        format: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1",
        schemaVersion: "1",
        targetIdentifier: "synthetic.tx.2g4",
        containerSizeBytes: 42,
        executablePayloadSizeBytes: 4,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status === "IDENTIFIED_SYNTHETIC_FIXTURE") {
      expect(Object.isFrozen(result.identity)).toBe(true);
      expect("payload" in result.identity).toBe(false);
    }
  });

  it.each([
    [
      "bad-magic",
      (bytes: Uint8Array) => {
        bytes[0] = 0;
      },
    ],
    [
      "bad-version",
      (bytes: Uint8Array) => {
        bytes[16] = 2;
      },
    ],
    [
      "empty-target",
      (bytes: Uint8Array) => {
        bytes[17] = 0;
      },
    ],
    [
      "empty-payload",
      (bytes: Uint8Array) => {
        new DataView(bytes.buffer).setUint32(18, 0, false);
      },
    ],
    [
      "trailing-byte",
      (bytes: Uint8Array) => {
        const withTrailingByte = new Uint8Array(bytes.byteLength + 1);
        withTrailingByte.set(bytes);
        return withTrailingByte;
      },
    ],
  ] as const)("rejects %s fixture framing", (_name, mutate) => {
    const bytes = buildSyntheticExecutable();
    const replacement = mutate(bytes);
    expect(inspectSyntheticFirmwareExecutable(replacement ?? bytes)).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_FORMAT_INVALID",
    });
  });

  it.each([
    ["uppercase", 0x41],
    ["non-ascii", 0xff],
    ["space", 0x20],
  ] as const)("rejects %s Target bytes", (_name, value) => {
    const bytes = buildSyntheticExecutable();
    bytes[22] = value;
    expect(inspectSyntheticFirmwareExecutable(bytes)).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_TARGET_INVALID",
    });
  });

  it("rejects non-exact byte views", () => {
    expect(
      inspectSyntheticFirmwareExecutable(new Uint16Array([1, 2, 3])),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_FORMAT_INVALID",
    });
  });
});
