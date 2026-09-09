import {
  currentArtifactManifestTrustStatus,
  firmwareArtifactDigestAssurances,
  maximumSyntheticFirmwareAcquisitionChunks,
  maximumSyntheticFirmwareAcquisitionChunkSizeBytes,
  type CancellationSignal,
  type FirmwareArtifactDigestAssurance,
  type FirmwareArtifactDigestProvider,
  type SyntheticFirmwareDistributionObjectRole,
  type SyntheticFirmwareObjectAcquisitionProvider,
  type SyntheticFirmwareObjectAcquisitionReceipt,
} from "@elrs-easy/domain";

import type { FirmwareArtifactByteBlockReason } from "./firmware-artifact-bytes.js";
import type { SyntheticFirmwareDistributionManifestRootVerificationResult } from "./firmware-root-metadata.js";
import {
  syntheticDistributionManifestRootVerificationRecords,
  syntheticFirmwareAcquisitionRecords,
  type SyntheticDistributionObjectRecord,
} from "./firmware-trust-internals.js";
import {
  assertNotAborted,
  copyExactUint8Array,
  isAbortError,
  readDataMethod,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const syntheticFirmwareAcquisitionBlockReasons = [
  "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
  "SYNTHETIC_ACQUISITION_OBJECT_ROLE_INVALID",
  "SYNTHETIC_ACQUISITION_PROVIDER_INVALID",
  "SYNTHETIC_ACQUISITION_FAILED",
  "SYNTHETIC_ACQUISITION_CHUNK_INVALID",
  "SYNTHETIC_ACQUISITION_CHUNK_SIZE_LIMIT_EXCEEDED",
  "SYNTHETIC_ACQUISITION_CHUNK_LIMIT_EXCEEDED",
  "SYNTHETIC_ACQUISITION_OBJECT_SIZE_MISMATCH",
  "SYNTHETIC_ACQUISITION_RECEIPT_INVALID",
  "SYNTHETIC_ACQUISITION_RECEIPT_MISMATCH",
] as const;

export type SyntheticFirmwareAcquisitionBlockReason =
  | (typeof syntheticFirmwareAcquisitionBlockReasons)[number]
  | FirmwareArtifactByteBlockReason;

export type SyntheticFirmwareAcquisitionStage =
  "DISTRIBUTION_EVIDENCE" | "PROVIDER" | "STREAM" | "RECEIPT" | "DIGEST";

export type SyntheticFirmwareAcquisitionResult =
  | Readonly<{
      status: "VERIFIED_SYNTHETIC_ACQUISITION";
      validationLevel: "SYNTHETIC_ONLY";
      acquisitionAssurance: "SYNTHETIC_ONLY";
      digestAssurance: FirmwareArtifactDigestAssurance;
      trustStatus: typeof currentArtifactManifestTrustStatus;
      objectRole: SyntheticFirmwareDistributionObjectRole;
      name: string;
      url: string;
      mediaType: "application/gzip" | "application/json";
      sizeBytes: number;
      sha256: string;
      redirectDisposition: "BLOCKED_EXACT_URL_ONLY";
      byteDisposition: "HASHED_AND_DISCARDED";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
    }>
  | Readonly<{
      status: "BLOCKED";
      stage: SyntheticFirmwareAcquisitionStage;
      reason: SyntheticFirmwareAcquisitionBlockReason;
    }>;

const receiptFields = [
  "sourceUrl",
  "finalUrl",
  "statusCode",
  "mediaType",
  "receivedSizeBytes",
] as const;
const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;

function blocked(
  stage: SyntheticFirmwareAcquisitionStage,
  reason: SyntheticFirmwareAcquisitionBlockReason,
): SyntheticFirmwareAcquisitionResult {
  return Object.freeze({ status: "BLOCKED", stage, reason });
}

function objectForRole(
  record: {
    readonly artifact: SyntheticDistributionObjectRecord;
    readonly correspondingSource: SyntheticDistributionObjectRecord;
    readonly notices: SyntheticDistributionObjectRecord;
  },
  role: unknown,
): SyntheticDistributionObjectRecord | null {
  switch (role) {
    case "firmware-artifact":
      return record.artifact;
    case "corresponding-source":
      return record.correspondingSource;
    case "notices":
      return record.notices;
    default:
      return null;
  }
}

function hasExactReceiptDataProperties(
  value: unknown,
): value is SyntheticFirmwareObjectAcquisitionReceipt {
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
      keys.length !== receiptFields.length ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !receiptFields.includes(key as (typeof receiptFields)[number]),
      )
    ) {
      return false;
    }
    return receiptFields.every((field) => {
      const descriptor = descriptors[field];
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

function receiptMatches(
  receipt: SyntheticFirmwareObjectAcquisitionReceipt,
  expected: SyntheticDistributionObjectRecord,
  measuredSizeBytes: number,
): boolean {
  return (
    readOwnDataProperty(receipt, "sourceUrl") === expected.url &&
    readOwnDataProperty(receipt, "finalUrl") === expected.url &&
    readOwnDataProperty(receipt, "statusCode") === 200 &&
    readOwnDataProperty(receipt, "mediaType") === expected.mediaType &&
    readOwnDataProperty(receipt, "receivedSizeBytes") === measuredSizeBytes &&
    measuredSizeBytes === expected.sizeBytes
  );
}

async function verifyAcquiredObjectDigest(input: {
  readonly bytes: Uint8Array;
  readonly expectedSha256: string;
  readonly provider: FirmwareArtifactDigestProvider;
  readonly signal?: CancellationSignal;
}): Promise<
  | Readonly<{
      status: "VERIFIED";
      assurance: FirmwareArtifactDigestAssurance;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: FirmwareArtifactByteBlockReason;
    }>
> {
  const assurance = readOwnDataProperty(input.provider, "assurance");
  const digestSha256 = readDataMethod(input.provider, "digestSha256");
  if (
    !firmwareArtifactDigestAssurances.some(
      (candidate) => candidate === assurance,
    ) ||
    digestSha256 === null
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_PROVIDER_INVALID",
    });
  }

  const providerBytes = input.bytes.slice();
  let sha256: unknown;
  try {
    assertNotAborted(input.signal);
    sha256 = await Reflect.apply(digestSha256, input.provider, [
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
      reason: "FIRMWARE_ARTIFACT_DIGEST_FAILED",
    });
  } finally {
    providerBytes.fill(0);
  }

  if (typeof sha256 !== "string" || !canonicalSha256Pattern.test(sha256)) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_INVALID",
    });
  }
  if (sha256 !== input.expectedSha256) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_MISMATCH",
    });
  }
  return Object.freeze({
    status: "VERIFIED",
    assurance: assurance as FirmwareArtifactDigestAssurance,
  });
}

/**
 * Acquires and hashes exactly one object named by an internally verified
 * Synthetic distribution statement. Bytes are transient and never returned.
 */
export async function acquireSyntheticFirmwareDistributionObject(input: {
  readonly distributionRootVerification: SyntheticFirmwareDistributionManifestRootVerificationResult;
  readonly objectRole: SyntheticFirmwareDistributionObjectRole;
  readonly provider: SyntheticFirmwareObjectAcquisitionProvider;
  readonly digestProvider: FirmwareArtifactDigestProvider;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareAcquisitionResult> {
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
    return blocked(
      "DISTRIBUTION_EVIDENCE",
      "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    );
  }

  const objectRecord = objectForRole(
    rootRecord,
    readOwnDataProperty(input, "objectRole"),
  );
  if (objectRecord === null) {
    return blocked(
      "DISTRIBUTION_EVIDENCE",
      "SYNTHETIC_ACQUISITION_OBJECT_ROLE_INVALID",
    );
  }

  const provider = readOwnDataProperty(input, "provider");
  const assurance = readOwnDataProperty(provider, "assurance");
  const acquireExactObject = readDataMethod(provider, "acquireExactObject");
  if (assurance !== "SYNTHETIC_ONLY" || acquireExactObject === null) {
    return blocked("PROVIDER", "SYNTHETIC_ACQUISITION_PROVIDER_INVALID");
  }

  const request = Object.freeze({
    schemaVersion: "1" as const,
    objectRole: objectRecord.objectRole,
    name: objectRecord.name,
    url: objectRecord.url,
    mediaType: objectRecord.mediaType,
    expectedSizeBytes: objectRecord.sizeBytes,
  });
  const chunks: Uint8Array[] = [];
  const clearTransientChunks = (): void => {
    for (const chunk of chunks) {
      chunk.fill(0);
    }
    chunks.length = 0;
  };
  const sinkAbort = Object.freeze({});
  let accepting = true;
  let chunkCount = 0;
  let byteLength = 0;
  let sinkFailure: SyntheticFirmwareAcquisitionBlockReason | null = null;
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
      sinkFailure = "SYNTHETIC_ACQUISITION_CHUNK_INVALID";
      throw sinkAbort;
    }
    if (chunk.byteLength > maximumSyntheticFirmwareAcquisitionChunkSizeBytes) {
      sinkFailure = "SYNTHETIC_ACQUISITION_CHUNK_SIZE_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    chunkCount += 1;
    if (chunkCount > maximumSyntheticFirmwareAcquisitionChunks) {
      sinkFailure = "SYNTHETIC_ACQUISITION_CHUNK_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    const nextByteLength = byteLength + chunk.byteLength;
    if (nextByteLength > objectRecord.sizeBytes) {
      sinkFailure = "SYNTHETIC_ACQUISITION_OBJECT_SIZE_MISMATCH";
      throw sinkAbort;
    }
    chunks.push(chunk);
    byteLength = nextByteLength;
  };

  let receipt: unknown;
  try {
    assertNotAborted(input.signal);
    receipt = await Reflect.apply(acquireExactObject, provider, [
      request,
      emitChunk,
      input.signal,
    ]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    accepting = false;
    if (isAbortError(error)) {
      clearTransientChunks();
      throw error;
    }
    clearTransientChunks();
    return blocked("STREAM", sinkFailure ?? "SYNTHETIC_ACQUISITION_FAILED");
  }
  accepting = false;
  if (sinkFailure !== null) {
    clearTransientChunks();
    return blocked("STREAM", sinkFailure);
  }
  if (byteLength !== objectRecord.sizeBytes) {
    clearTransientChunks();
    return blocked("STREAM", "SYNTHETIC_ACQUISITION_OBJECT_SIZE_MISMATCH");
  }
  if (!hasExactReceiptDataProperties(receipt)) {
    clearTransientChunks();
    return blocked("RECEIPT", "SYNTHETIC_ACQUISITION_RECEIPT_INVALID");
  }
  if (!receiptMatches(receipt, objectRecord, byteLength)) {
    clearTransientChunks();
    return blocked("RECEIPT", "SYNTHETIC_ACQUISITION_RECEIPT_MISMATCH");
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digestProvider = readOwnDataProperty(
    input,
    "digestProvider",
  ) as FirmwareArtifactDigestProvider;
  const verified = await (async () => {
    try {
      return await verifyAcquiredObjectDigest({
        bytes,
        expectedSha256: objectRecord.sha256,
        provider: digestProvider,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    } finally {
      bytes.fill(0);
      clearTransientChunks();
    }
  })();
  if (verified.status === "BLOCKED") {
    return blocked("DIGEST", verified.reason);
  }

  const result: SyntheticFirmwareAcquisitionResult = Object.freeze({
    status: "VERIFIED_SYNTHETIC_ACQUISITION",
    validationLevel: "SYNTHETIC_ONLY",
    acquisitionAssurance: "SYNTHETIC_ONLY",
    digestAssurance: verified.assurance,
    trustStatus: currentArtifactManifestTrustStatus,
    objectRole: objectRecord.objectRole,
    name: objectRecord.name,
    url: objectRecord.url,
    mediaType: objectRecord.mediaType,
    sizeBytes: objectRecord.sizeBytes,
    sha256: objectRecord.sha256,
    redirectDisposition: "BLOCKED_EXACT_URL_ONLY",
    byteDisposition: "HASHED_AND_DISCARDED",
    writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
  });
  syntheticFirmwareAcquisitionRecords.set(result, {
    distributionRootVerification: distributionRootVerification as object,
    acquisitionAssurance: "SYNTHETIC_ONLY",
    digestAssurance: verified.assurance,
    ...objectRecord,
  });
  return result;
}
