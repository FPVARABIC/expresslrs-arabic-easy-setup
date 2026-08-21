import {
  currentArtifactManifestTrustStatus,
  maximumCompressedFirmwareArtifactSizeBytes,
  maximumFirmwareArtifactDecompressionChunks,
  maximumFirmwareArtifactDecompressionChunkSizeBytes,
  maximumFirmwareArtifactSizeBytes,
  syntheticCompressedFirmwareArtifactSchemaVersion,
  syntheticCompressedFirmwareArtifactType,
  syntheticFirmwareExecutableByteForm,
  syntheticFirmwareExecutableFormat,
  type CancellationSignal,
  type FirmwareArtifactByteVerification,
  type FirmwareArtifactDecompressionProvider,
  type FirmwareArtifactDigestProvider,
  type SyntheticCompressedFirmwareArtifactDescriptorV1,
  type SyntheticFirmwareExecutableIdentityV1,
} from "@elrs-easy/domain";

import {
  snapshotFirmwareArtifactBytes,
  verifyFirmwareArtifactBytes,
  type FirmwareArtifactByteBlockReason,
} from "./firmware-artifact-bytes.js";
import {
  assertNotAborted,
  copyExactUint8Array,
  isAbortError,
  readDataMethod,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const syntheticCompressedFirmwareArtifactBlockReasons = [
  "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
  "SYNTHETIC_COMPRESSED_ARTIFACT_SIZE_LIMIT_EXCEEDED",
  "SYNTHETIC_DECOMPRESSED_ARTIFACT_SIZE_LIMIT_EXCEEDED",
  "SYNTHETIC_GZIP_HEADER_INVALID",
  "FIRMWARE_ARTIFACT_DECOMPRESSION_PROVIDER_INVALID",
  "FIRMWARE_ARTIFACT_DECOMPRESSION_FAILED",
  "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_INVALID",
  "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED",
  "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_LIMIT_EXCEEDED",
  "FIRMWARE_ARTIFACT_DECOMPRESSED_SIZE_MISMATCH",
  "SYNTHETIC_EXECUTABLE_FORMAT_INVALID",
  "SYNTHETIC_EXECUTABLE_TARGET_INVALID",
  "SYNTHETIC_EXECUTABLE_TARGET_MISMATCH",
] as const;

export type SyntheticCompressedFirmwareArtifactBlockReason =
  | (typeof syntheticCompressedFirmwareArtifactBlockReasons)[number]
  | FirmwareArtifactByteBlockReason;

export type SyntheticCompressedFirmwareArtifactValidationStage =
  | "DESCRIPTOR"
  | "COMPRESSED_INPUT"
  | "DECOMPRESSION"
  | "DECOMPRESSED_OUTPUT"
  | "EXECUTABLE_IDENTITY";

export type SyntheticCompressedFirmwareArtifactValidation =
  | {
      readonly status: "VERIFIED_SYNTHETIC_FIXTURE";
      readonly validationLevel: "SYNTHETIC_ONLY";
      readonly trustStatus: typeof currentArtifactManifestTrustStatus;
      readonly writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
      readonly descriptor: SyntheticCompressedFirmwareArtifactDescriptorV1;
      readonly compressedVerification: FirmwareArtifactByteVerification;
      readonly decompressedVerification: FirmwareArtifactByteVerification;
      readonly executableIdentity: SyntheticFirmwareExecutableIdentityV1;
    }
  | {
      readonly status: "BLOCKED";
      readonly stage: SyntheticCompressedFirmwareArtifactValidationStage;
      readonly reason: SyntheticCompressedFirmwareArtifactBlockReason;
    };

export type SyntheticFirmwareExecutableInspection =
  | {
      readonly status: "IDENTIFIED_SYNTHETIC_FIXTURE";
      readonly identity: SyntheticFirmwareExecutableIdentityV1;
    }
  | {
      readonly status: "BLOCKED";
      readonly reason:
        | "SYNTHETIC_EXECUTABLE_FORMAT_INVALID"
        | "SYNTHETIC_EXECUTABLE_TARGET_INVALID";
    };

const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const targetIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const gzipMagic = Object.freeze([0x1f, 0x8b, 0x08] as const);
const syntheticExecutableMagic = Object.freeze(
  Array.from("ELRSEASYFWIMAGE!", (character) => character.charCodeAt(0)),
);
const syntheticExecutableFixedHeaderSizeBytes = 22;
const syntheticExecutableMinimumSizeBytes =
  syntheticExecutableFixedHeaderSizeBytes + 2;
const descriptorKeys = Object.freeze([
  "schemaVersion",
  "artifactType",
  "compression",
  "decompressedByteForm",
  "executableFormat",
  "targetIdentifier",
  "compressedSizeBytes",
  "compressedSha256",
  "decompressedSizeBytes",
  "decompressedSha256",
] as const);

function blocked(
  stage: SyntheticCompressedFirmwareArtifactValidationStage,
  reason: SyntheticCompressedFirmwareArtifactBlockReason,
): SyntheticCompressedFirmwareArtifactValidation {
  return Object.freeze({ status: "BLOCKED", stage, reason });
}

function hasExactDataProperties(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== descriptorKeys.length ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !descriptorKeys.includes(key as (typeof descriptorKeys)[number]),
      )
    ) {
      return false;
    }
    return descriptorKeys.every((key) => {
      const descriptor = descriptors[key];
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        descriptor.enumerable === true
      );
    });
  } catch {
    return false;
  }
}

function snapshotDescriptor(value: unknown):
  | {
      readonly status: "READY";
      readonly descriptor: SyntheticCompressedFirmwareArtifactDescriptorV1;
    }
  | {
      readonly status: "BLOCKED";
      readonly reason: SyntheticCompressedFirmwareArtifactBlockReason;
    } {
  if (!hasExactDataProperties(value)) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
    });
  }

  const schemaVersion = readOwnDataProperty(value, "schemaVersion");
  const artifactType = readOwnDataProperty(value, "artifactType");
  const compression = readOwnDataProperty(value, "compression");
  const decompressedByteForm = readOwnDataProperty(
    value,
    "decompressedByteForm",
  );
  const executableFormat = readOwnDataProperty(value, "executableFormat");
  const targetIdentifier = readOwnDataProperty(value, "targetIdentifier");
  const compressedSizeBytes = readOwnDataProperty(value, "compressedSizeBytes");
  const compressedSha256 = readOwnDataProperty(value, "compressedSha256");
  const decompressedSizeBytes = readOwnDataProperty(
    value,
    "decompressedSizeBytes",
  );
  const decompressedSha256 = readOwnDataProperty(value, "decompressedSha256");

  if (
    schemaVersion !== syntheticCompressedFirmwareArtifactSchemaVersion ||
    artifactType !== syntheticCompressedFirmwareArtifactType ||
    compression !== "gzip" ||
    decompressedByteForm !== syntheticFirmwareExecutableByteForm ||
    executableFormat !== syntheticFirmwareExecutableFormat ||
    typeof targetIdentifier !== "string" ||
    !targetIdentifierPattern.test(targetIdentifier) ||
    typeof compressedSizeBytes !== "number" ||
    !Number.isSafeInteger(compressedSizeBytes) ||
    compressedSizeBytes < 18 ||
    typeof compressedSha256 !== "string" ||
    !canonicalSha256Pattern.test(compressedSha256) ||
    typeof decompressedSizeBytes !== "number" ||
    !Number.isSafeInteger(decompressedSizeBytes) ||
    decompressedSizeBytes < syntheticExecutableMinimumSizeBytes ||
    typeof decompressedSha256 !== "string" ||
    !canonicalSha256Pattern.test(decompressedSha256)
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_COMPRESSED_ARTIFACT_DESCRIPTOR_INVALID",
    });
  }
  if (compressedSizeBytes > maximumCompressedFirmwareArtifactSizeBytes) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_COMPRESSED_ARTIFACT_SIZE_LIMIT_EXCEEDED",
    });
  }
  if (decompressedSizeBytes > maximumFirmwareArtifactSizeBytes) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_DECOMPRESSED_ARTIFACT_SIZE_LIMIT_EXCEEDED",
    });
  }

  return Object.freeze({
    status: "READY",
    descriptor: Object.freeze({
      schemaVersion,
      artifactType,
      compression,
      decompressedByteForm,
      executableFormat,
      targetIdentifier,
      compressedSizeBytes,
      compressedSha256,
      decompressedSizeBytes,
      decompressedSha256,
    }),
  });
}

function hasGzipMagic(bytes: Uint8Array): boolean {
  return gzipMagic.every((value, index) => bytes[index] === value);
}

async function decompressBounded(input: {
  readonly compressedBytes: Uint8Array;
  readonly expectedDecompressedSizeBytes: number;
  readonly provider: FirmwareArtifactDecompressionProvider;
  readonly signal?: CancellationSignal;
}): Promise<
  | { readonly status: "READY"; readonly bytes: Uint8Array }
  | {
      readonly status: "BLOCKED";
      readonly reason: SyntheticCompressedFirmwareArtifactBlockReason;
    }
> {
  const assurance = readOwnDataProperty(input.provider, "assurance");
  const method = readDataMethod(input.provider, "decompressGzip");
  if (assurance !== "SYNTHETIC_ONLY" || method === null) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DECOMPRESSION_PROVIDER_INVALID",
    });
  }

  const chunks: Uint8Array[] = [];
  const sinkAbort = Object.freeze({});
  let accepting = true;
  let chunkCount = 0;
  let byteLength = 0;
  let sinkFailure: SyntheticCompressedFirmwareArtifactBlockReason | null = null;
  const emitChunk = (value: Uint8Array): void => {
    if (!accepting) {
      return;
    }
    assertNotAborted(input.signal);
    if (sinkFailure !== null) {
      throw sinkAbort;
    }
    const chunk = copyExactUint8Array(value);
    if (chunk === null || chunk.byteLength === 0) {
      sinkFailure = "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_INVALID";
      throw sinkAbort;
    }
    if (chunk.byteLength > maximumFirmwareArtifactDecompressionChunkSizeBytes) {
      sinkFailure = "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    chunkCount += 1;
    if (chunkCount > maximumFirmwareArtifactDecompressionChunks) {
      sinkFailure = "FIRMWARE_ARTIFACT_DECOMPRESSION_CHUNK_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    const nextByteLength = byteLength + chunk.byteLength;
    if (nextByteLength > input.expectedDecompressedSizeBytes) {
      sinkFailure = "FIRMWARE_ARTIFACT_DECOMPRESSED_SIZE_MISMATCH";
      throw sinkAbort;
    }
    chunks.push(chunk);
    byteLength = nextByteLength;
  };

  try {
    assertNotAborted(input.signal);
    await Reflect.apply(method, input.provider, [
      input.compressedBytes.slice(),
      emitChunk,
      input.signal,
    ]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    accepting = false;
    if (isAbortError(error)) {
      throw error;
    }
    return Object.freeze({
      status: "BLOCKED",
      reason: sinkFailure ?? "FIRMWARE_ARTIFACT_DECOMPRESSION_FAILED",
    });
  }
  accepting = false;

  if (sinkFailure !== null) {
    return Object.freeze({ status: "BLOCKED", reason: sinkFailure });
  }
  if (byteLength !== input.expectedDecompressedSizeBytes) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DECOMPRESSED_SIZE_MISMATCH",
    });
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Object.freeze({ status: "READY", bytes });
}

/**
 * Parses the exact Synthetic executable-fixture container. This deliberately
 * rejects real Firmware images and never returns the contained payload bytes.
 */
export function inspectSyntheticFirmwareExecutable(
  value: unknown,
): SyntheticFirmwareExecutableInspection {
  const bytes = copyExactUint8Array(value);
  if (
    bytes === null ||
    bytes.byteLength < syntheticExecutableMinimumSizeBytes ||
    bytes.byteLength > maximumFirmwareArtifactSizeBytes
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_FORMAT_INVALID",
    });
  }
  if (
    !syntheticExecutableMagic.every(
      (expected, index) => bytes[index] === expected,
    ) ||
    bytes[16] !== 1
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_FORMAT_INVALID",
    });
  }

  const targetLength = bytes[17];
  if (targetLength === undefined || targetLength < 1 || targetLength > 128) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_FORMAT_INVALID",
    });
  }
  const payloadLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(18, false);
  if (
    payloadLength < 1 ||
    syntheticExecutableFixedHeaderSizeBytes + targetLength + payloadLength !==
      bytes.byteLength
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_FORMAT_INVALID",
    });
  }

  let targetIdentifier = "";
  for (
    let index = syntheticExecutableFixedHeaderSizeBytes;
    index < syntheticExecutableFixedHeaderSizeBytes + targetLength;
    index += 1
  ) {
    const byte = bytes[index];
    if (byte === undefined || byte > 0x7f) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "SYNTHETIC_EXECUTABLE_TARGET_INVALID",
      });
    }
    targetIdentifier += String.fromCharCode(byte);
  }
  if (!targetIdentifierPattern.test(targetIdentifier)) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_EXECUTABLE_TARGET_INVALID",
    });
  }

  return Object.freeze({
    status: "IDENTIFIED_SYNTHETIC_FIXTURE",
    identity: Object.freeze({
      format: syntheticFirmwareExecutableFormat,
      schemaVersion: "1",
      targetIdentifier,
      containerSizeBytes: bytes.byteLength,
      executablePayloadSizeBytes: payloadLength,
    }),
  });
}

/**
 * Validates both named byte forms before inspecting the embedded Synthetic
 * Target. The result is evidence only and cannot authorize Firmware writing.
 */
export async function validateSyntheticCompressedFirmwareArtifact(input: {
  readonly descriptor: unknown;
  readonly compressedBytes: unknown;
  readonly digestProvider: FirmwareArtifactDigestProvider;
  readonly decompressionProvider: FirmwareArtifactDecompressionProvider;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticCompressedFirmwareArtifactValidation> {
  const descriptorSnapshot = snapshotDescriptor(input.descriptor);
  if (descriptorSnapshot.status === "BLOCKED") {
    return blocked("DESCRIPTOR", descriptorSnapshot.reason);
  }
  const descriptor = descriptorSnapshot.descriptor;

  const compressedSnapshot = snapshotFirmwareArtifactBytes(
    input.compressedBytes,
  );
  const compressed = await verifyFirmwareArtifactBytes({
    snapshot: compressedSnapshot,
    expectedByteLength: descriptor.compressedSizeBytes,
    expectedSha256: descriptor.compressedSha256,
    digestProvider: input.digestProvider,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (compressed.status === "BLOCKED") {
    return blocked("COMPRESSED_INPUT", compressed.reason);
  }
  const compressedBytes = compressed.copyBytes();
  if (!hasGzipMagic(compressedBytes)) {
    return blocked("COMPRESSED_INPUT", "SYNTHETIC_GZIP_HEADER_INVALID");
  }

  const decompressed = await decompressBounded({
    compressedBytes,
    expectedDecompressedSizeBytes: descriptor.decompressedSizeBytes,
    provider: input.decompressionProvider,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (decompressed.status === "BLOCKED") {
    return blocked("DECOMPRESSION", decompressed.reason);
  }

  const decompressedVerification = await verifyFirmwareArtifactBytes({
    snapshot: snapshotFirmwareArtifactBytes(decompressed.bytes),
    expectedByteLength: descriptor.decompressedSizeBytes,
    expectedSha256: descriptor.decompressedSha256,
    digestProvider: input.digestProvider,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (decompressedVerification.status === "BLOCKED") {
    return blocked("DECOMPRESSED_OUTPUT", decompressedVerification.reason);
  }

  const executable = inspectSyntheticFirmwareExecutable(
    decompressedVerification.copyBytes(),
  );
  if (executable.status === "BLOCKED") {
    return blocked("EXECUTABLE_IDENTITY", executable.reason);
  }
  if (executable.identity.targetIdentifier !== descriptor.targetIdentifier) {
    return blocked(
      "EXECUTABLE_IDENTITY",
      "SYNTHETIC_EXECUTABLE_TARGET_MISMATCH",
    );
  }

  return Object.freeze({
    status: "VERIFIED_SYNTHETIC_FIXTURE",
    validationLevel: "SYNTHETIC_ONLY",
    trustStatus: currentArtifactManifestTrustStatus,
    writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
    descriptor,
    compressedVerification: compressed.verification,
    decompressedVerification: decompressedVerification.verification,
    executableIdentity: executable.identity,
  });
}
