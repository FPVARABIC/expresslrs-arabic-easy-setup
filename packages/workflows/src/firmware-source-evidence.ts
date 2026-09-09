import {
  currentArtifactManifestTrustStatus,
  firmwareArtifactDigestAssurances,
  maximumFirmwareArtifactDecompressionChunks,
  maximumFirmwareArtifactDecompressionChunkSizeBytes,
  maximumSyntheticNoticeBundleSizeBytes,
  maximumSyntheticNoticeEntries,
  maximumSyntheticSourceArchiveDecompressedSizeBytes,
  maximumSyntheticSourceArchiveEntries,
  maximumSyntheticSourceInventoryBytes,
  syntheticCorrespondingSourceInventorySchemaVersion,
  syntheticCorrespondingSourceInventoryType,
  syntheticDeclaredBuildInputIds,
  syntheticFirmwareNoticeSchemaVersion,
  syntheticFirmwareNoticeType,
  syntheticSourceInventoryEntryRoles,
  type CancellationSignal,
  type FirmwareArtifactDecompressionProvider,
  type FirmwareArtifactDigestAssurance,
  type FirmwareArtifactDigestProvider,
  type SyntheticCorrespondingSourceInventoryV1,
  type SyntheticDeclaredBuildInputId,
  type SyntheticFirmwareNoticeEntryV1,
  type SyntheticFirmwareNoticesV1,
  type SyntheticSourceInventoryEntryRole,
  type SyntheticSourceInventoryEntryV1,
} from "@elrs-easy/domain";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonFailureCode,
  type BoundedJsonLimits,
  type BoundedJsonValue,
} from "./bounded-json.js";
import type { SyntheticFirmwareDistributionCandidateEvidenceResult } from "./firmware-distribution-candidate.js";
import type { SyntheticFirmwareDistributionManifestRootVerificationResult } from "./firmware-root-metadata.js";
import {
  syntheticDistributionManifestRootVerificationRecords,
  syntheticFirmwareDistributionCandidateRecords,
  syntheticFirmwareSourceReviewRecords,
  syntheticNoticeInspectionRecords,
  syntheticSourceInventoryInspectionRecords,
  type SyntheticSourceInventoryEntryRecord,
} from "./firmware-trust-internals.js";
import {
  assertNotAborted,
  copyExactUint8Array,
  isAbortError,
  readDataMethod,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const syntheticSourceInventoryArchivePath =
  "ELRS-EASY-SOURCE-INVENTORY.json" as const;
export const syntheticSourceArchiveFormat = "RESTRICTED_USTAR_GZIP_V1" as const;

export const syntheticSourceInventoryInspectionBlockReasons = [
  "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
  "SYNTHETIC_SOURCE_ARCHIVE_BYTES_INVALID",
  "SYNTHETIC_SOURCE_ARCHIVE_SIZE_MISMATCH",
  "SYNTHETIC_EVIDENCE_DIGEST_PROVIDER_INVALID",
  "SYNTHETIC_EVIDENCE_DIGEST_FAILED",
  "SYNTHETIC_EVIDENCE_DIGEST_INVALID",
  "SYNTHETIC_SOURCE_ARCHIVE_DIGEST_MISMATCH",
  "SYNTHETIC_SOURCE_GZIP_HEADER_INVALID",
  "SYNTHETIC_SOURCE_DECOMPRESSION_PROVIDER_INVALID",
  "SYNTHETIC_SOURCE_DECOMPRESSION_FAILED",
  "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_INVALID",
  "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED",
  "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_LIMIT_EXCEEDED",
  "SYNTHETIC_SOURCE_DECOMPRESSED_SIZE_LIMIT_EXCEEDED",
  "SYNTHETIC_SOURCE_GZIP_TRAILER_MISMATCH",
  "SYNTHETIC_SOURCE_TAR_INVALID",
  "SYNTHETIC_SOURCE_TAR_ENTRY_LIMIT_EXCEEDED",
  "SYNTHETIC_SOURCE_TAR_PATH_INVALID",
  "SYNTHETIC_SOURCE_TAR_DUPLICATE_PATH",
  "SYNTHETIC_SOURCE_INVENTORY_JSON_INVALID",
  "SYNTHETIC_SOURCE_INVENTORY_DUPLICATE_KEY",
  "SYNTHETIC_SOURCE_INVENTORY_LIMIT_EXCEEDED",
  "SYNTHETIC_SOURCE_INVENTORY_UNSAFE_NUMBER",
  "SYNTHETIC_SOURCE_INVENTORY_INVALID_UNICODE",
  "SYNTHETIC_SOURCE_INVENTORY_NOT_CANONICAL",
  "SYNTHETIC_SOURCE_INVENTORY_SCHEMA_INVALID",
  "SYNTHETIC_SOURCE_INVENTORY_RELEASE_MISMATCH",
  "SYNTHETIC_SOURCE_INVENTORY_ARCHIVE_MISMATCH",
  "SYNTHETIC_SOURCE_ENTRY_DIGEST_MISMATCH",
] as const;

export type SyntheticSourceInventoryInspectionBlockReason =
  (typeof syntheticSourceInventoryInspectionBlockReasons)[number];

export type SyntheticSourceInventoryInspectionStage =
  | "DISTRIBUTION_EVIDENCE"
  | "COMPRESSED_INPUT"
  | "DECOMPRESSION"
  | "ARCHIVE"
  | "INVENTORY"
  | "ENTRY_DIGEST";

export type SyntheticSourceInventoryInspectionResult =
  | Readonly<{
      status: "VERIFIED_SYNTHETIC_SOURCE_INVENTORY";
      validationLevel: "SYNTHETIC_ONLY";
      trustStatus: typeof currentArtifactManifestTrustStatus;
      sourceArchiveFormat: typeof syntheticSourceArchiveFormat;
      sourceArchiveSha256: string;
      inventoryPath: typeof syntheticSourceInventoryArchivePath;
      inventoryCanonicalization: "RFC8785";
      decompressionLinkage: "GZIP_CRC32_AND_ISIZE_MATCHED_SYNTHETIC_ONLY";
      sourceEntryCount: number;
      buildInputCount: number;
      licenseEntryCount: number;
      buildInputDisposition: "EXACT_DECLARED_INPUTS_LINKED_TO_ARCHIVE_ENTRIES";
      sourceCompleteness: "NOT_PROVEN";
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
    }>
  | Readonly<{
      status: "BLOCKED";
      stage: SyntheticSourceInventoryInspectionStage;
      reason: SyntheticSourceInventoryInspectionBlockReason;
    }>;

export const syntheticNoticeInspectionBlockReasons = [
  "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
  "SYNTHETIC_SOURCE_INVENTORY_INSPECTION_NOT_PROVEN",
  "SYNTHETIC_NOTICE_SOURCE_ROOT_MISMATCH",
  "SYNTHETIC_NOTICE_BYTES_INVALID",
  "SYNTHETIC_NOTICE_SIZE_MISMATCH",
  "SYNTHETIC_EVIDENCE_DIGEST_PROVIDER_INVALID",
  "SYNTHETIC_EVIDENCE_DIGEST_FAILED",
  "SYNTHETIC_EVIDENCE_DIGEST_INVALID",
  "SYNTHETIC_NOTICE_DIGEST_MISMATCH",
  "SYNTHETIC_NOTICE_JSON_INVALID",
  "SYNTHETIC_NOTICE_DUPLICATE_KEY",
  "SYNTHETIC_NOTICE_LIMIT_EXCEEDED",
  "SYNTHETIC_NOTICE_UNSAFE_NUMBER",
  "SYNTHETIC_NOTICE_INVALID_UNICODE",
  "SYNTHETIC_NOTICE_NOT_CANONICAL",
  "SYNTHETIC_NOTICE_SCHEMA_INVALID",
  "SYNTHETIC_NOTICE_RELEASE_MISMATCH",
  "SYNTHETIC_NOTICE_SOURCE_LINK_MISMATCH",
] as const;

export type SyntheticNoticeInspectionBlockReason =
  (typeof syntheticNoticeInspectionBlockReasons)[number];

export type SyntheticNoticeInspectionStage =
  | "DISTRIBUTION_EVIDENCE"
  | "SOURCE_EVIDENCE"
  | "NOTICE_INPUT"
  | "NOTICE_SCHEMA"
  | "SOURCE_LINKAGE";

export type SyntheticNoticeInspectionResult =
  | Readonly<{
      status: "VERIFIED_SYNTHETIC_NOTICE_SCHEMA";
      validationLevel: "SYNTHETIC_ONLY";
      trustStatus: typeof currentArtifactManifestTrustStatus;
      noticesSha256: string;
      noticeCanonicalization: "RFC8785";
      noticeEntryCount: number;
      sourceLinkDisposition: "EXACT_LICENSE_ENTRIES_LINKED_BY_PATH_AND_SHA256";
      legalCompleteness: "NOT_PROVEN";
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
    }>
  | Readonly<{
      status: "BLOCKED";
      stage: SyntheticNoticeInspectionStage;
      reason: SyntheticNoticeInspectionBlockReason;
    }>;

export const syntheticFirmwareSourceReviewBlockReasons = [
  "SYNTHETIC_DISTRIBUTION_CANDIDATE_NOT_PROVEN",
  "SYNTHETIC_SOURCE_INVENTORY_INSPECTION_NOT_PROVEN",
  "SYNTHETIC_NOTICE_INSPECTION_NOT_PROVEN",
  "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_MISMATCH",
] as const;

export type SyntheticFirmwareSourceReviewBlockReason =
  (typeof syntheticFirmwareSourceReviewBlockReasons)[number];

export type SyntheticFirmwareSourceReviewEvidenceResult =
  | Readonly<{
      status: "SYNTHETIC_FIRMWARE_SOURCE_REVIEW_EVIDENCE";
      validationLevel: "SYNTHETIC_ONLY";
      distributionStatus: "SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE";
      sourceStatus: "VERIFIED_SYNTHETIC_SOURCE_INVENTORY";
      noticesStatus: "VERIFIED_SYNTHETIC_NOTICE_SCHEMA";
      trustStatus: typeof currentArtifactManifestTrustStatus;
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC";
      buildInputDisposition: "EXACT_DECLARED_INPUTS_LINKED_TO_ARCHIVE_ENTRIES";
      correspondingSourceDisposition: "BOUNDED_INVENTORY_INSPECTED_COMPLETENESS_UNPROVEN";
      noticesDisposition: "SCHEMA_AND_SOURCE_LINKS_INSPECTED_LEGAL_COMPLETENESS_UNPROVEN";
      reproducibilityDisposition: "NOT_PROVEN";
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
      targetIdentifier: string;
      rootVersion: number;
      releaseSequence: number;
      artifactSha256: string;
      correspondingSourceSha256: string;
      noticesSha256: string;
      sourceEntryCount: number;
      buildInputCount: number;
      noticeEntryCount: number;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareSourceReviewBlockReason;
    }>;

const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const targetIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const archivePathPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$/u;
const componentIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const syntheticLicenseExpressionPattern =
  /^LicenseRef-Synthetic-[A-Za-z0-9][A-Za-z0-9.-]{0,95}$/u;
const tarBlockSizeBytes = 512;
const gzipHeaderSizeBytes = 10;
const gzipTrailerSizeBytes = 8;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const sourceInventoryLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSyntheticSourceInventoryBytes,
  maximumDepth: 6,
  maximumStringCodeUnits: 256,
  maximumArrayElements: maximumSyntheticSourceArchiveEntries - 1,
  maximumObjectMembers: 8,
  maximumTotalValues: 1_024,
});

const noticeLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSyntheticNoticeBundleSizeBytes,
  maximumDepth: 6,
  maximumStringCodeUnits: 256,
  maximumArrayElements: maximumSyntheticNoticeEntries,
  maximumObjectMembers: 8,
  maximumTotalValues: 1_024,
});

const sourceInventoryFields = [
  "sourceInventorySchema",
  "inventoryType",
  "targetIdentifier",
  "releaseSequence",
  "artifactSha256",
  "entries",
] as const;
const sourceInventoryEntryFields = [
  "path",
  "role",
  "buildInputId",
  "sizeBytes",
  "sha256",
] as const;
const noticeFields = [
  "noticeSchema",
  "noticeType",
  "targetIdentifier",
  "releaseSequence",
  "artifactSha256",
  "correspondingSourceSha256",
  "entries",
] as const;
const noticeEntryFields = [
  "componentId",
  "licenseExpression",
  "noticeSha256",
  "sourcePath",
] as const;

interface DigestRuntime {
  readonly provider: FirmwareArtifactDigestProvider;
  readonly method: (...arguments_: unknown[]) => unknown;
  readonly assurance: FirmwareArtifactDigestAssurance;
}

interface TarEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

type CanonicalJsonBlockReason =
  BoundedJsonFailureCode | "NON_UTF8" | "NOT_CANONICAL";

type CanonicalJsonResult =
  | Readonly<{ status: "READY"; value: BoundedJsonValue }>
  | Readonly<{
      status: "BLOCKED";
      reason: CanonicalJsonBlockReason;
    }>;

function sourceBlocked(
  stage: SyntheticSourceInventoryInspectionStage,
  reason: SyntheticSourceInventoryInspectionBlockReason,
): SyntheticSourceInventoryInspectionResult {
  return Object.freeze({ status: "BLOCKED", stage, reason });
}

function noticeBlocked(
  stage: SyntheticNoticeInspectionStage,
  reason: SyntheticNoticeInspectionBlockReason,
): SyntheticNoticeInspectionResult {
  return Object.freeze({ status: "BLOCKED", stage, reason });
}

function sourceReviewBlocked(
  reason: SyntheticFirmwareSourceReviewBlockReason,
): SyntheticFirmwareSourceReviewEvidenceResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

function isJsonObject(
  value: BoundedJsonValue,
): value is { [key: string]: BoundedJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields<const TFields extends readonly string[]>(
  value: BoundedJsonValue,
  fields: TFields,
): value is { [TField in TFields[number]]: BoundedJsonValue } {
  if (!isJsonObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function isPositiveSafeInteger(value: BoundedJsonValue): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCanonicalArchivePath(value: string): boolean {
  return (
    archivePathPattern.test(value) &&
    !value.includes("//") &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    value.split("/").every((segment) => segment !== "." && segment !== "..")
  );
}

function captureDigestRuntime(value: unknown): DigestRuntime | null {
  const assurance = readOwnDataProperty(value, "assurance");
  const method = readDataMethod(value, "digestSha256");
  if (
    !firmwareArtifactDigestAssurances.some(
      (candidate) => candidate === assurance,
    ) ||
    method === null
  ) {
    return null;
  }
  return Object.freeze({
    provider: value as FirmwareArtifactDigestProvider,
    method,
    assurance: assurance as FirmwareArtifactDigestAssurance,
  });
}

async function digestBytes(input: {
  readonly runtime: DigestRuntime;
  readonly bytes: Uint8Array;
  readonly signal?: CancellationSignal;
}): Promise<
  | Readonly<{ status: "READY"; sha256: string }>
  | Readonly<{
      status: "BLOCKED";
      reason:
        | "SYNTHETIC_EVIDENCE_DIGEST_FAILED"
        | "SYNTHETIC_EVIDENCE_DIGEST_INVALID";
    }>
> {
  const providerBytes = input.bytes.slice();
  let value: unknown;
  try {
    assertNotAborted(input.signal);
    value = await Reflect.apply(input.runtime.method, input.runtime.provider, [
      providerBytes,
      input.signal,
    ]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_EVIDENCE_DIGEST_FAILED",
    });
  } finally {
    providerBytes.fill(0);
  }
  if (typeof value !== "string" || !canonicalSha256Pattern.test(value)) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_EVIDENCE_DIGEST_INVALID",
    });
  }
  return Object.freeze({ status: "READY", sha256: value });
}

function hasRestrictedGzipHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= gzipHeaderSizeBytes + gzipTrailerSizeBytes &&
    bytes[0] === 0x1f &&
    bytes[1] === 0x8b &&
    bytes[2] === 0x08 &&
    bytes[3] === 0x00
  );
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

function gzipTrailerMatches(
  compressedBytes: Uint8Array,
  decompressedBytes: Uint8Array,
): boolean {
  const trailerOffset = compressedBytes.byteLength - gzipTrailerSizeBytes;
  const view = new DataView(
    compressedBytes.buffer,
    compressedBytes.byteOffset + trailerOffset,
    gzipTrailerSizeBytes,
  );
  return (
    view.getUint32(0, true) === crc32(decompressedBytes) &&
    view.getUint32(4, true) === decompressedBytes.byteLength >>> 0
  );
}

async function decompressSourceArchive(input: {
  readonly compressedBytes: Uint8Array;
  readonly provider: unknown;
  readonly signal?: CancellationSignal;
}): Promise<
  | Readonly<{ status: "READY"; bytes: Uint8Array }>
  | Readonly<{
      status: "BLOCKED";
      reason:
        | "SYNTHETIC_SOURCE_DECOMPRESSION_PROVIDER_INVALID"
        | "SYNTHETIC_SOURCE_DECOMPRESSION_FAILED"
        | "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_INVALID"
        | "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED"
        | "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_LIMIT_EXCEEDED"
        | "SYNTHETIC_SOURCE_DECOMPRESSED_SIZE_LIMIT_EXCEEDED";
    }>
> {
  const assurance = readOwnDataProperty(input.provider, "assurance");
  const method = readDataMethod(input.provider, "decompressGzip");
  if (assurance !== "SYNTHETIC_ONLY" || method === null) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_SOURCE_DECOMPRESSION_PROVIDER_INVALID",
    });
  }

  const chunks: Uint8Array[] = [];
  const clearChunks = (): void => {
    for (const chunk of chunks) {
      chunk.fill(0);
    }
    chunks.length = 0;
  };
  const sinkAbort = Object.freeze({});
  let accepting = true;
  let chunkCount = 0;
  let byteLength = 0;
  let sinkFailure:
    | "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_INVALID"
    | "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED"
    | "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_LIMIT_EXCEEDED"
    | "SYNTHETIC_SOURCE_DECOMPRESSED_SIZE_LIMIT_EXCEEDED"
    | null = null;
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
      sinkFailure = "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_INVALID";
      throw sinkAbort;
    }
    if (chunk.byteLength > maximumFirmwareArtifactDecompressionChunkSizeBytes) {
      sinkFailure = "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    chunkCount += 1;
    if (chunkCount > maximumFirmwareArtifactDecompressionChunks) {
      sinkFailure = "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    const nextSize = byteLength + chunk.byteLength;
    if (nextSize > maximumSyntheticSourceArchiveDecompressedSizeBytes) {
      sinkFailure = "SYNTHETIC_SOURCE_DECOMPRESSED_SIZE_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    chunks.push(chunk);
    byteLength = nextSize;
  };

  const providerBytes = input.compressedBytes.slice();
  try {
    assertNotAborted(input.signal);
    await Reflect.apply(method, input.provider, [
      providerBytes,
      emitChunk,
      input.signal,
    ]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    accepting = false;
    clearChunks();
    if (isAbortError(error)) {
      throw error;
    }
    return Object.freeze({
      status: "BLOCKED",
      reason: sinkFailure ?? "SYNTHETIC_SOURCE_DECOMPRESSION_FAILED",
    });
  } finally {
    providerBytes.fill(0);
  }
  accepting = false;
  if (sinkFailure !== null) {
    clearChunks();
    return Object.freeze({ status: "BLOCKED", reason: sinkFailure });
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  clearChunks();
  return Object.freeze({ status: "READY", bytes });
}

function blockIsZero(bytes: Uint8Array, offset: number): boolean {
  for (let index = 0; index < tarBlockSizeBytes; index += 1) {
    if (bytes[offset + index] !== 0) {
      return false;
    }
  }
  return true;
}

function fieldMatches(
  bytes: Uint8Array,
  offset: number,
  length: number,
  value: string,
): boolean {
  if (value.length >= length) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    const expected = index < value.length ? value.charCodeAt(index) : 0;
    if (bytes[offset + index] !== expected) {
      return false;
    }
  }
  return true;
}

function bytesAreZero(
  bytes: Uint8Array,
  offset: number,
  length: number,
): boolean {
  for (let index = 0; index < length; index += 1) {
    if (bytes[offset + index] !== 0) {
      return false;
    }
  }
  return true;
}

function readTarName(bytes: Uint8Array, offset: number): string | null {
  let end = offset;
  const limit = offset + 100;
  while (end < limit && bytes[end] !== 0) {
    const byte = bytes[end];
    if (byte === undefined || byte < 0x21 || byte > 0x7e) {
      return null;
    }
    end += 1;
  }
  if (
    end === offset ||
    end === limit ||
    !bytesAreZero(bytes, end, limit - end)
  ) {
    return null;
  }
  let value = "";
  for (let index = offset; index < end; index += 1) {
    value += String.fromCharCode(bytes[index]!);
  }
  return isCanonicalArchivePath(value) ? value : null;
}

function readCanonicalOctal(
  bytes: Uint8Array,
  offset: number,
  digits: number,
): number | null {
  let value = 0;
  for (let index = 0; index < digits; index += 1) {
    const byte = bytes[offset + index];
    if (byte === undefined || byte < 0x30 || byte > 0x37) {
      return null;
    }
    value = value * 8 + (byte - 0x30);
    if (!Number.isSafeInteger(value)) {
      return null;
    }
  }
  return value;
}

function tarHeaderChecksumMatches(bytes: Uint8Array, offset: number): boolean {
  const declared = readCanonicalOctal(bytes, offset + 148, 6);
  if (
    declared === null ||
    bytes[offset + 154] !== 0 ||
    bytes[offset + 155] !== 0x20
  ) {
    return false;
  }
  let measured = 0;
  for (let index = 0; index < tarBlockSizeBytes; index += 1) {
    measured +=
      index >= 148 && index < 156 ? 0x20 : (bytes[offset + index] ?? 0);
  }
  return measured === declared;
}

function parseRestrictedUstar(bytes: Uint8Array):
  | Readonly<{ status: "READY"; entries: readonly TarEntry[] }>
  | Readonly<{
      status: "BLOCKED";
      reason:
        | "SYNTHETIC_SOURCE_TAR_INVALID"
        | "SYNTHETIC_SOURCE_TAR_ENTRY_LIMIT_EXCEEDED"
        | "SYNTHETIC_SOURCE_TAR_PATH_INVALID"
        | "SYNTHETIC_SOURCE_TAR_DUPLICATE_PATH";
    }> {
  if (
    bytes.byteLength < tarBlockSizeBytes * 3 ||
    bytes.byteLength % tarBlockSizeBytes !== 0
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "SYNTHETIC_SOURCE_TAR_INVALID",
    });
  }

  const entries: TarEntry[] = [];
  const paths = new Set<string>();
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (blockIsZero(bytes, offset)) {
      if (
        offset + tarBlockSizeBytes * 2 !== bytes.byteLength ||
        !blockIsZero(bytes, offset + tarBlockSizeBytes) ||
        entries.length === 0
      ) {
        return Object.freeze({
          status: "BLOCKED",
          reason: "SYNTHETIC_SOURCE_TAR_INVALID",
        });
      }
      return Object.freeze({
        status: "READY",
        entries: Object.freeze(entries),
      });
    }
    if (entries.length >= maximumSyntheticSourceArchiveEntries) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "SYNTHETIC_SOURCE_TAR_ENTRY_LIMIT_EXCEEDED",
      });
    }

    const path = readTarName(bytes, offset);
    if (path === null) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "SYNTHETIC_SOURCE_TAR_PATH_INVALID",
      });
    }
    if (paths.has(path)) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "SYNTHETIC_SOURCE_TAR_DUPLICATE_PATH",
      });
    }
    paths.add(path);

    const sizeBytes = readCanonicalOctal(bytes, offset + 124, 11);
    if (
      sizeBytes === null ||
      bytes[offset + 135] !== 0 ||
      !fieldMatches(bytes, offset + 100, 8, "0000644") ||
      !fieldMatches(bytes, offset + 108, 8, "0000000") ||
      !fieldMatches(bytes, offset + 116, 8, "0000000") ||
      !fieldMatches(bytes, offset + 136, 12, "00000000000") ||
      !tarHeaderChecksumMatches(bytes, offset) ||
      bytes[offset + 156] !== 0x30 ||
      !bytesAreZero(bytes, offset + 157, 100) ||
      !fieldMatches(bytes, offset + 257, 6, "ustar") ||
      bytes[offset + 263] !== 0x30 ||
      bytes[offset + 264] !== 0x30 ||
      !bytesAreZero(bytes, offset + 265, 247)
    ) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "SYNTHETIC_SOURCE_TAR_INVALID",
      });
    }

    const dataOffset = offset + tarBlockSizeBytes;
    const paddedSize =
      Math.ceil(sizeBytes / tarBlockSizeBytes) * tarBlockSizeBytes;
    const nextOffset = dataOffset + paddedSize;
    if (
      sizeBytes < 1 ||
      nextOffset + tarBlockSizeBytes * 2 > bytes.byteLength ||
      !bytesAreZero(bytes, dataOffset + sizeBytes, paddedSize - sizeBytes)
    ) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "SYNTHETIC_SOURCE_TAR_INVALID",
      });
    }
    entries.push(
      Object.freeze({
        path,
        bytes: bytes.subarray(dataOffset, dataOffset + sizeBytes),
      }),
    );
    offset = nextOffset;
  }

  return Object.freeze({
    status: "BLOCKED",
    reason: "SYNTHETIC_SOURCE_TAR_INVALID",
  });
}

function parseCanonicalJson(
  bytes: Uint8Array,
  limits: BoundedJsonLimits,
): CanonicalJsonResult {
  let source: string;
  try {
    source = textDecoder.decode(bytes);
  } catch {
    return Object.freeze({ status: "BLOCKED", reason: "NON_UTF8" });
  }
  try {
    const value = parseBoundedJson(source, limits);
    if (canonicalizeBoundedJson(value) !== source) {
      return Object.freeze({ status: "BLOCKED", reason: "NOT_CANONICAL" });
    }
    return Object.freeze({ status: "READY", value });
  } catch (error: unknown) {
    if (error instanceof BoundedJsonError) {
      return Object.freeze({ status: "BLOCKED", reason: error.code });
    }
    return Object.freeze({ status: "BLOCKED", reason: "INVALID_JSON" });
  }
}

function rebuildSourceInventoryEntry(
  value: BoundedJsonValue,
): SyntheticSourceInventoryEntryV1 | null {
  if (
    !hasExactFields(value, sourceInventoryEntryFields) ||
    typeof value.path !== "string" ||
    !isCanonicalArchivePath(value.path) ||
    value.path === syntheticSourceInventoryArchivePath ||
    typeof value.role !== "string" ||
    !syntheticSourceInventoryEntryRoles.some(
      (candidate) => candidate === value.role,
    ) ||
    !isPositiveSafeInteger(value.sizeBytes) ||
    typeof value.sha256 !== "string" ||
    !canonicalSha256Pattern.test(value.sha256)
  ) {
    return null;
  }
  const role = value.role as SyntheticSourceInventoryEntryRole;
  const buildInputId = value.buildInputId;
  if (
    (role === "BUILD_INPUT" &&
      (typeof buildInputId !== "string" ||
        !syntheticDeclaredBuildInputIds.some(
          (candidate) => candidate === buildInputId,
        ))) ||
    (role !== "BUILD_INPUT" && buildInputId !== null)
  ) {
    return null;
  }
  return Object.freeze({
    path: value.path,
    role,
    buildInputId:
      role === "BUILD_INPUT"
        ? (buildInputId as SyntheticDeclaredBuildInputId)
        : null,
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
  });
}

function rebuildSourceInventory(
  value: BoundedJsonValue,
): SyntheticCorrespondingSourceInventoryV1 | null {
  if (
    !hasExactFields(value, sourceInventoryFields) ||
    value.sourceInventorySchema !==
      syntheticCorrespondingSourceInventorySchemaVersion ||
    value.inventoryType !== syntheticCorrespondingSourceInventoryType ||
    typeof value.targetIdentifier !== "string" ||
    !targetIdentifierPattern.test(value.targetIdentifier) ||
    !isPositiveSafeInteger(value.releaseSequence) ||
    typeof value.artifactSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.artifactSha256) ||
    !Array.isArray(value.entries) ||
    value.entries.length < syntheticDeclaredBuildInputIds.length + 2 ||
    value.entries.length >= maximumSyntheticSourceArchiveEntries
  ) {
    return null;
  }

  const entries: SyntheticSourceInventoryEntryV1[] = [];
  for (const item of value.entries) {
    const entry = rebuildSourceInventoryEntry(item);
    if (entry === null) {
      return null;
    }
    entries.push(entry);
  }
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]!.path >= entries[index]!.path) {
      return null;
    }
  }
  const sourceCount = entries.filter((entry) => entry.role === "SOURCE").length;
  const licenseCount = entries.filter(
    (entry) => entry.role === "LICENSE",
  ).length;
  const buildInputIds = entries
    .filter((entry) => entry.role === "BUILD_INPUT")
    .map((entry) => entry.buildInputId);
  if (
    sourceCount < 1 ||
    licenseCount < 1 ||
    buildInputIds.length !== syntheticDeclaredBuildInputIds.length ||
    new Set(buildInputIds).size !== syntheticDeclaredBuildInputIds.length ||
    !syntheticDeclaredBuildInputIds.every((id) => buildInputIds.includes(id))
  ) {
    return null;
  }

  return Object.freeze({
    sourceInventorySchema: syntheticCorrespondingSourceInventorySchemaVersion,
    inventoryType: syntheticCorrespondingSourceInventoryType,
    targetIdentifier: value.targetIdentifier,
    releaseSequence: value.releaseSequence,
    artifactSha256: value.artifactSha256,
    entries: Object.freeze(entries),
  });
}

function rebuildNoticeEntry(
  value: BoundedJsonValue,
): SyntheticFirmwareNoticeEntryV1 | null {
  if (
    !hasExactFields(value, noticeEntryFields) ||
    typeof value.componentId !== "string" ||
    !componentIdentifierPattern.test(value.componentId) ||
    typeof value.licenseExpression !== "string" ||
    !syntheticLicenseExpressionPattern.test(value.licenseExpression) ||
    typeof value.noticeSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.noticeSha256) ||
    typeof value.sourcePath !== "string" ||
    !isCanonicalArchivePath(value.sourcePath)
  ) {
    return null;
  }
  return Object.freeze({
    componentId: value.componentId,
    licenseExpression: value.licenseExpression,
    noticeSha256: value.noticeSha256,
    sourcePath: value.sourcePath,
  });
}

function rebuildNotices(
  value: BoundedJsonValue,
): SyntheticFirmwareNoticesV1 | null {
  if (
    !hasExactFields(value, noticeFields) ||
    value.noticeSchema !== syntheticFirmwareNoticeSchemaVersion ||
    value.noticeType !== syntheticFirmwareNoticeType ||
    typeof value.targetIdentifier !== "string" ||
    !targetIdentifierPattern.test(value.targetIdentifier) ||
    !isPositiveSafeInteger(value.releaseSequence) ||
    typeof value.artifactSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.artifactSha256) ||
    typeof value.correspondingSourceSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.correspondingSourceSha256) ||
    !Array.isArray(value.entries) ||
    value.entries.length < 1 ||
    value.entries.length > maximumSyntheticNoticeEntries
  ) {
    return null;
  }
  const entries: SyntheticFirmwareNoticeEntryV1[] = [];
  for (const item of value.entries) {
    const entry = rebuildNoticeEntry(item);
    if (entry === null) {
      return null;
    }
    entries.push(entry);
  }
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]!.componentId >= entries[index]!.componentId) {
      return null;
    }
  }
  if (
    new Set(entries.map((entry) => entry.sourcePath)).size !== entries.length
  ) {
    return null;
  }
  return Object.freeze({
    noticeSchema: syntheticFirmwareNoticeSchemaVersion,
    noticeType: syntheticFirmwareNoticeType,
    targetIdentifier: value.targetIdentifier,
    releaseSequence: value.releaseSequence,
    artifactSha256: value.artifactSha256,
    correspondingSourceSha256: value.correspondingSourceSha256,
    entries: Object.freeze(entries),
  });
}

function sourceJsonReason(
  reason: CanonicalJsonBlockReason,
): SyntheticSourceInventoryInspectionBlockReason {
  switch (reason) {
    case "DUPLICATE_KEY":
      return "SYNTHETIC_SOURCE_INVENTORY_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "SYNTHETIC_SOURCE_INVENTORY_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "SYNTHETIC_SOURCE_INVENTORY_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
    case "NON_UTF8":
      return "SYNTHETIC_SOURCE_INVENTORY_INVALID_UNICODE";
    case "NOT_CANONICAL":
      return "SYNTHETIC_SOURCE_INVENTORY_NOT_CANONICAL";
    default:
      return "SYNTHETIC_SOURCE_INVENTORY_JSON_INVALID";
  }
}

function noticeJsonReason(
  reason: CanonicalJsonBlockReason,
): SyntheticNoticeInspectionBlockReason {
  switch (reason) {
    case "DUPLICATE_KEY":
      return "SYNTHETIC_NOTICE_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "SYNTHETIC_NOTICE_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "SYNTHETIC_NOTICE_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
    case "NON_UTF8":
      return "SYNTHETIC_NOTICE_INVALID_UNICODE";
    case "NOT_CANONICAL":
      return "SYNTHETIC_NOTICE_NOT_CANONICAL";
    default:
      return "SYNTHETIC_NOTICE_JSON_INVALID";
  }
}

/**
 * Inspects one exact signed Synthetic source object. The accepted tar profile
 * contains only regular canonical files and returns no archive or entry bytes.
 */
export async function inspectSyntheticCorrespondingSourceArchive(input: {
  readonly distributionRootVerification: SyntheticFirmwareDistributionManifestRootVerificationResult;
  readonly compressedSourceBytes: Uint8Array;
  readonly digestProvider: FirmwareArtifactDigestProvider;
  readonly decompressionProvider: FirmwareArtifactDecompressionProvider;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticSourceInventoryInspectionResult> {
  const distributionRootVerification = readOwnDataProperty(
    input,
    "distributionRootVerification",
  );
  const rootRecord =
    typeof distributionRootVerification === "object" &&
    distributionRootVerification !== null
      ? syntheticDistributionManifestRootVerificationRecords.get(
          distributionRootVerification,
        )
      : undefined;
  if (rootRecord === undefined) {
    return sourceBlocked(
      "DISTRIBUTION_EVIDENCE",
      "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    );
  }

  const compressedBytes = copyExactUint8Array(
    readOwnDataProperty(input, "compressedSourceBytes"),
  );
  if (compressedBytes === null || compressedBytes.byteLength === 0) {
    return sourceBlocked(
      "COMPRESSED_INPUT",
      "SYNTHETIC_SOURCE_ARCHIVE_BYTES_INVALID",
    );
  }
  const signal = readOwnDataProperty(input, "signal") as
    CancellationSignal | undefined;
  let decompressedBytes: Uint8Array | null = null;
  try {
    if (
      compressedBytes.byteLength !== rootRecord.correspondingSource.sizeBytes
    ) {
      return sourceBlocked(
        "COMPRESSED_INPUT",
        "SYNTHETIC_SOURCE_ARCHIVE_SIZE_MISMATCH",
      );
    }
    if (!hasRestrictedGzipHeader(compressedBytes)) {
      return sourceBlocked(
        "COMPRESSED_INPUT",
        "SYNTHETIC_SOURCE_GZIP_HEADER_INVALID",
      );
    }

    const digestRuntime = captureDigestRuntime(
      readOwnDataProperty(input, "digestProvider"),
    );
    if (digestRuntime === null) {
      return sourceBlocked(
        "COMPRESSED_INPUT",
        "SYNTHETIC_EVIDENCE_DIGEST_PROVIDER_INVALID",
      );
    }
    const compressedDigest = await digestBytes({
      runtime: digestRuntime,
      bytes: compressedBytes,
      ...(signal === undefined ? {} : { signal }),
    });
    if (compressedDigest.status === "BLOCKED") {
      return sourceBlocked("COMPRESSED_INPUT", compressedDigest.reason);
    }
    if (compressedDigest.sha256 !== rootRecord.correspondingSource.sha256) {
      return sourceBlocked(
        "COMPRESSED_INPUT",
        "SYNTHETIC_SOURCE_ARCHIVE_DIGEST_MISMATCH",
      );
    }

    const decompressed = await decompressSourceArchive({
      compressedBytes,
      provider: readOwnDataProperty(input, "decompressionProvider"),
      ...(signal === undefined ? {} : { signal }),
    });
    if (decompressed.status === "BLOCKED") {
      return sourceBlocked("DECOMPRESSION", decompressed.reason);
    }
    decompressedBytes = decompressed.bytes;
    if (!gzipTrailerMatches(compressedBytes, decompressedBytes)) {
      return sourceBlocked(
        "DECOMPRESSION",
        "SYNTHETIC_SOURCE_GZIP_TRAILER_MISMATCH",
      );
    }

    const archive = parseRestrictedUstar(decompressedBytes);
    if (archive.status === "BLOCKED") {
      return sourceBlocked("ARCHIVE", archive.reason);
    }
    const inventoryEntry = archive.entries[0];
    if (
      inventoryEntry === undefined ||
      inventoryEntry.path !== syntheticSourceInventoryArchivePath ||
      inventoryEntry.bytes.byteLength > maximumSyntheticSourceInventoryBytes
    ) {
      return sourceBlocked(
        "INVENTORY",
        "SYNTHETIC_SOURCE_INVENTORY_ARCHIVE_MISMATCH",
      );
    }

    const parsedInventory = parseCanonicalJson(
      inventoryEntry.bytes,
      sourceInventoryLimits,
    );
    if (parsedInventory.status === "BLOCKED") {
      return sourceBlocked(
        "INVENTORY",
        sourceJsonReason(parsedInventory.reason),
      );
    }
    const inventory = rebuildSourceInventory(parsedInventory.value);
    if (inventory === null) {
      return sourceBlocked(
        "INVENTORY",
        "SYNTHETIC_SOURCE_INVENTORY_SCHEMA_INVALID",
      );
    }
    if (
      inventory.targetIdentifier !== rootRecord.targetIdentifier ||
      inventory.releaseSequence !== rootRecord.releaseSequence ||
      inventory.artifactSha256 !== rootRecord.artifact.sha256
    ) {
      return sourceBlocked(
        "INVENTORY",
        "SYNTHETIC_SOURCE_INVENTORY_RELEASE_MISMATCH",
      );
    }
    if (archive.entries.length !== inventory.entries.length + 1) {
      return sourceBlocked(
        "INVENTORY",
        "SYNTHETIC_SOURCE_INVENTORY_ARCHIVE_MISMATCH",
      );
    }

    for (let index = 0; index < inventory.entries.length; index += 1) {
      const expected = inventory.entries[index]!;
      const actual = archive.entries[index + 1];
      if (
        actual === undefined ||
        actual.path !== expected.path ||
        actual.bytes.byteLength !== expected.sizeBytes
      ) {
        return sourceBlocked(
          "INVENTORY",
          "SYNTHETIC_SOURCE_INVENTORY_ARCHIVE_MISMATCH",
        );
      }
      const digest = await digestBytes({
        runtime: digestRuntime,
        bytes: actual.bytes,
        ...(signal === undefined ? {} : { signal }),
      });
      if (digest.status === "BLOCKED") {
        return sourceBlocked("ENTRY_DIGEST", digest.reason);
      }
      if (digest.sha256 !== expected.sha256) {
        return sourceBlocked(
          "ENTRY_DIGEST",
          "SYNTHETIC_SOURCE_ENTRY_DIGEST_MISMATCH",
        );
      }
    }

    const sourceEntryCount = inventory.entries.filter(
      (entry) => entry.role === "SOURCE",
    ).length;
    const buildInputCount = inventory.entries.filter(
      (entry) => entry.role === "BUILD_INPUT",
    ).length;
    const licenseEntryCount = inventory.entries.filter(
      (entry) => entry.role === "LICENSE",
    ).length;
    const result: SyntheticSourceInventoryInspectionResult = Object.freeze({
      status: "VERIFIED_SYNTHETIC_SOURCE_INVENTORY",
      validationLevel: "SYNTHETIC_ONLY",
      trustStatus: currentArtifactManifestTrustStatus,
      sourceArchiveFormat: syntheticSourceArchiveFormat,
      sourceArchiveSha256: rootRecord.correspondingSource.sha256,
      inventoryPath: syntheticSourceInventoryArchivePath,
      inventoryCanonicalization: "RFC8785",
      decompressionLinkage: "GZIP_CRC32_AND_ISIZE_MATCHED_SYNTHETIC_ONLY",
      sourceEntryCount,
      buildInputCount,
      licenseEntryCount,
      buildInputDisposition: "EXACT_DECLARED_INPUTS_LINKED_TO_ARCHIVE_ENTRIES",
      sourceCompleteness: "NOT_PROVEN",
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
    });
    const records: readonly SyntheticSourceInventoryEntryRecord[] =
      Object.freeze(
        inventory.entries.map((entry) =>
          Object.freeze({
            path: entry.path,
            role: entry.role,
            buildInputId: entry.buildInputId,
            sizeBytes: entry.sizeBytes,
            sha256: entry.sha256,
          }),
        ),
      );
    syntheticSourceInventoryInspectionRecords.set(result, {
      distributionRootVerification: distributionRootVerification as object,
      targetIdentifier: rootRecord.targetIdentifier,
      releaseSequence: rootRecord.releaseSequence,
      artifactSha256: rootRecord.artifact.sha256,
      correspondingSourceSha256: rootRecord.correspondingSource.sha256,
      entries: records,
      sourceEntryCount,
      buildInputCount,
      licenseEntryCount,
    });
    return result;
  } finally {
    compressedBytes.fill(0);
    decompressedBytes?.fill(0);
  }
}

/** Parses exact signed notice bytes and joins every notice to a LICENSE file. */
export async function inspectSyntheticFirmwareNotices(input: {
  readonly distributionRootVerification: SyntheticFirmwareDistributionManifestRootVerificationResult;
  readonly sourceInspection: SyntheticSourceInventoryInspectionResult;
  readonly noticesBytes: Uint8Array;
  readonly digestProvider: FirmwareArtifactDigestProvider;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticNoticeInspectionResult> {
  const distributionRootVerification = readOwnDataProperty(
    input,
    "distributionRootVerification",
  );
  const rootRecord =
    typeof distributionRootVerification === "object" &&
    distributionRootVerification !== null
      ? syntheticDistributionManifestRootVerificationRecords.get(
          distributionRootVerification,
        )
      : undefined;
  if (rootRecord === undefined) {
    return noticeBlocked(
      "DISTRIBUTION_EVIDENCE",
      "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    );
  }
  const sourceInspection = readOwnDataProperty(input, "sourceInspection");
  const sourceRecord =
    typeof sourceInspection === "object" && sourceInspection !== null
      ? syntheticSourceInventoryInspectionRecords.get(sourceInspection)
      : undefined;
  if (sourceRecord === undefined) {
    return noticeBlocked(
      "SOURCE_EVIDENCE",
      "SYNTHETIC_SOURCE_INVENTORY_INSPECTION_NOT_PROVEN",
    );
  }
  if (
    sourceRecord.distributionRootVerification !== distributionRootVerification
  ) {
    return noticeBlocked(
      "SOURCE_EVIDENCE",
      "SYNTHETIC_NOTICE_SOURCE_ROOT_MISMATCH",
    );
  }

  const noticesBytes = copyExactUint8Array(
    readOwnDataProperty(input, "noticesBytes"),
  );
  if (noticesBytes === null || noticesBytes.byteLength === 0) {
    return noticeBlocked("NOTICE_INPUT", "SYNTHETIC_NOTICE_BYTES_INVALID");
  }
  const signal = readOwnDataProperty(input, "signal") as
    CancellationSignal | undefined;
  try {
    if (noticesBytes.byteLength !== rootRecord.notices.sizeBytes) {
      return noticeBlocked("NOTICE_INPUT", "SYNTHETIC_NOTICE_SIZE_MISMATCH");
    }
    const digestRuntime = captureDigestRuntime(
      readOwnDataProperty(input, "digestProvider"),
    );
    if (digestRuntime === null) {
      return noticeBlocked(
        "NOTICE_INPUT",
        "SYNTHETIC_EVIDENCE_DIGEST_PROVIDER_INVALID",
      );
    }
    const digest = await digestBytes({
      runtime: digestRuntime,
      bytes: noticesBytes,
      ...(signal === undefined ? {} : { signal }),
    });
    if (digest.status === "BLOCKED") {
      return noticeBlocked("NOTICE_INPUT", digest.reason);
    }
    if (digest.sha256 !== rootRecord.notices.sha256) {
      return noticeBlocked("NOTICE_INPUT", "SYNTHETIC_NOTICE_DIGEST_MISMATCH");
    }

    const parsed = parseCanonicalJson(noticesBytes, noticeLimits);
    if (parsed.status === "BLOCKED") {
      return noticeBlocked("NOTICE_SCHEMA", noticeJsonReason(parsed.reason));
    }
    const notices = rebuildNotices(parsed.value);
    if (notices === null) {
      return noticeBlocked("NOTICE_SCHEMA", "SYNTHETIC_NOTICE_SCHEMA_INVALID");
    }
    if (
      notices.targetIdentifier !== rootRecord.targetIdentifier ||
      notices.releaseSequence !== rootRecord.releaseSequence ||
      notices.artifactSha256 !== rootRecord.artifact.sha256 ||
      notices.correspondingSourceSha256 !==
        rootRecord.correspondingSource.sha256
    ) {
      return noticeBlocked(
        "NOTICE_SCHEMA",
        "SYNTHETIC_NOTICE_RELEASE_MISMATCH",
      );
    }

    const licenseEntries = sourceRecord.entries.filter(
      (entry) => entry.role === "LICENSE",
    );
    if (
      notices.entries.length !== licenseEntries.length ||
      !notices.entries.every((notice) =>
        licenseEntries.some(
          (entry) =>
            entry.path === notice.sourcePath &&
            entry.sha256 === notice.noticeSha256,
        ),
      )
    ) {
      return noticeBlocked(
        "SOURCE_LINKAGE",
        "SYNTHETIC_NOTICE_SOURCE_LINK_MISMATCH",
      );
    }

    const result: SyntheticNoticeInspectionResult = Object.freeze({
      status: "VERIFIED_SYNTHETIC_NOTICE_SCHEMA",
      validationLevel: "SYNTHETIC_ONLY",
      trustStatus: currentArtifactManifestTrustStatus,
      noticesSha256: rootRecord.notices.sha256,
      noticeCanonicalization: "RFC8785",
      noticeEntryCount: notices.entries.length,
      sourceLinkDisposition: "EXACT_LICENSE_ENTRIES_LINKED_BY_PATH_AND_SHA256",
      legalCompleteness: "NOT_PROVEN",
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
    });
    syntheticNoticeInspectionRecords.set(result, {
      distributionRootVerification: distributionRootVerification as object,
      sourceInspection: sourceInspection as object,
      targetIdentifier: rootRecord.targetIdentifier,
      releaseSequence: rootRecord.releaseSequence,
      artifactSha256: rootRecord.artifact.sha256,
      correspondingSourceSha256: rootRecord.correspondingSource.sha256,
      noticesSha256: rootRecord.notices.sha256,
      noticeEntryCount: notices.entries.length,
    });
    return result;
  } finally {
    noticesBytes.fill(0);
  }
}

/**
 * Final evidence-only join. It changes neither Catalog state nor writer
 * eligibility and carries no source, notice, or Firmware bytes.
 */
export function createSyntheticFirmwareSourceReviewEvidence(input: {
  readonly distributionCandidate: SyntheticFirmwareDistributionCandidateEvidenceResult;
  readonly sourceInspection: SyntheticSourceInventoryInspectionResult;
  readonly noticesInspection: SyntheticNoticeInspectionResult;
}): SyntheticFirmwareSourceReviewEvidenceResult {
  const distributionCandidate = readOwnDataProperty(
    input,
    "distributionCandidate",
  );
  const candidateRecord =
    typeof distributionCandidate === "object" && distributionCandidate !== null
      ? syntheticFirmwareDistributionCandidateRecords.get(distributionCandidate)
      : undefined;
  if (candidateRecord === undefined) {
    return sourceReviewBlocked("SYNTHETIC_DISTRIBUTION_CANDIDATE_NOT_PROVEN");
  }
  const sourceInspection = readOwnDataProperty(input, "sourceInspection");
  const sourceRecord =
    typeof sourceInspection === "object" && sourceInspection !== null
      ? syntheticSourceInventoryInspectionRecords.get(sourceInspection)
      : undefined;
  if (sourceRecord === undefined) {
    return sourceReviewBlocked(
      "SYNTHETIC_SOURCE_INVENTORY_INSPECTION_NOT_PROVEN",
    );
  }
  const noticesInspection = readOwnDataProperty(input, "noticesInspection");
  const noticeRecord =
    typeof noticesInspection === "object" && noticesInspection !== null
      ? syntheticNoticeInspectionRecords.get(noticesInspection)
      : undefined;
  if (noticeRecord === undefined) {
    return sourceReviewBlocked("SYNTHETIC_NOTICE_INSPECTION_NOT_PROVEN");
  }

  if (
    candidateRecord.distributionRootVerification !==
      sourceRecord.distributionRootVerification ||
    sourceRecord.distributionRootVerification !==
      noticeRecord.distributionRootVerification ||
    noticeRecord.sourceInspection !== sourceInspection ||
    candidateRecord.targetIdentifier !== sourceRecord.targetIdentifier ||
    sourceRecord.targetIdentifier !== noticeRecord.targetIdentifier ||
    candidateRecord.releaseSequence !== sourceRecord.releaseSequence ||
    sourceRecord.releaseSequence !== noticeRecord.releaseSequence ||
    candidateRecord.artifactSha256 !== sourceRecord.artifactSha256 ||
    sourceRecord.artifactSha256 !== noticeRecord.artifactSha256 ||
    candidateRecord.correspondingSourceSha256 !==
      sourceRecord.correspondingSourceSha256 ||
    sourceRecord.correspondingSourceSha256 !==
      noticeRecord.correspondingSourceSha256 ||
    candidateRecord.noticesSha256 !== noticeRecord.noticesSha256
  ) {
    return sourceReviewBlocked("SYNTHETIC_SOURCE_REVIEW_EVIDENCE_MISMATCH");
  }

  const result: SyntheticFirmwareSourceReviewEvidenceResult = Object.freeze({
    status: "SYNTHETIC_FIRMWARE_SOURCE_REVIEW_EVIDENCE",
    validationLevel: "SYNTHETIC_ONLY",
    distributionStatus: "SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE",
    sourceStatus: "VERIFIED_SYNTHETIC_SOURCE_INVENTORY",
    noticesStatus: "VERIFIED_SYNTHETIC_NOTICE_SCHEMA",
    trustStatus: currentArtifactManifestTrustStatus,
    catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
    buildInputDisposition: "EXACT_DECLARED_INPUTS_LINKED_TO_ARCHIVE_ENTRIES",
    correspondingSourceDisposition:
      "BOUNDED_INVENTORY_INSPECTED_COMPLETENESS_UNPROVEN",
    noticesDisposition:
      "SCHEMA_AND_SOURCE_LINKS_INSPECTED_LEGAL_COMPLETENESS_UNPROVEN",
    reproducibilityDisposition: "NOT_PROVEN",
    byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
    writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
    targetIdentifier: candidateRecord.targetIdentifier,
    rootVersion: candidateRecord.rootVersion,
    releaseSequence: candidateRecord.releaseSequence,
    artifactSha256: candidateRecord.artifactSha256,
    correspondingSourceSha256: candidateRecord.correspondingSourceSha256,
    noticesSha256: candidateRecord.noticesSha256,
    sourceEntryCount: sourceRecord.sourceEntryCount,
    buildInputCount: sourceRecord.buildInputCount,
    noticeEntryCount: noticeRecord.noticeEntryCount,
  });
  syntheticFirmwareSourceReviewRecords.set(result, {
    distributionCandidate: distributionCandidate as object,
    sourceInspection: sourceInspection as object,
    noticesInspection: noticesInspection as object,
    targetIdentifier: candidateRecord.targetIdentifier,
    releaseSequence: candidateRecord.releaseSequence,
    artifactSha256: candidateRecord.artifactSha256,
    correspondingSourceSha256: candidateRecord.correspondingSourceSha256,
    noticesSha256: candidateRecord.noticesSha256,
  });
  return result;
}
