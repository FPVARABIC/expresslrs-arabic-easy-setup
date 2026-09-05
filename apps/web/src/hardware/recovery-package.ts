import { strFromU8, Unzip, UnzipInflate, unzipSync } from "fflate";

import { copyToArrayBuffer } from "./byte-utils";
import type { FirmwareSegment, OfficialTarget } from "./parity-types";

const MAX_RECOVERY_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_RECOVERY_MANIFEST_BYTES = 128 * 1024;
const MAX_RECOVERY_SEGMENT_BYTES = 16 * 1024 * 1024;
const MAX_RECOVERY_SEGMENTS = 8;
const MAX_RECOVERY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const RECOVERY_DB = "elrs-easy-hardware-recovery-v1";
const RECOVERY_STORE = "checkpoint";
const RECOVERY_KEY = "active";

export interface RecoveryCheckpoint {
  readonly schemaVersion: 1;
  readonly targetId: string;
  readonly productName: string;
  readonly packageSha256: string;
  readonly stage:
    | "PACKAGE_SAVED"
    | "BOOTLOADER"
    | "ERASING"
    | "WRITING"
    | "VERIFYING"
    | "REBOOTING"
    | "RECONNECTING"
    | "RECOVERY_REQUIRED";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly safeError: string | null;
}

export interface ValidatedRecoveryPackage {
  readonly targetId: string;
  readonly productName: string;
  readonly platform: string;
  readonly firmware: string;
  readonly releaseLabel: string;
  readonly releaseRevision: string;
  readonly packageSha256: string;
  readonly segments: readonly FirmwareSegment[];
}

export class RecoveryPackageError extends Error {
  public constructor(
    public readonly code:
      | "TOO_LARGE"
      | "INVALID_ARCHIVE"
      | "INVALID_MANIFEST"
      | "TARGET_MISMATCH"
      | "HASH_MISMATCH"
      | "STORAGE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "RecoveryPackageError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    copyToArrayBuffer(bytes),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function safeString(value: unknown, maximum = 240): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function safeAddress(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

interface RecoveryArchiveEntryMetadata {
  readonly kind: "manifest" | "segment";
  readonly originalSize: number;
  readonly compressedSize: number;
  readonly compression: 0 | 8;
  readonly maximumSize: number;
}

function recoveryArchiveEntry(
  name: string,
): Pick<RecoveryArchiveEntryMetadata, "kind" | "maximumSize"> | null {
  if (name === "manifest.json") {
    return { kind: "manifest", maximumSize: MAX_RECOVERY_MANIFEST_BYTES };
  }
  const match = /^segments\/([A-Za-z0-9_.-]{1,160})$/u.exec(name);
  if (match === null || match[1] === "." || match[1] === "..") return null;
  return { kind: "segment", maximumSize: MAX_RECOVERY_SEGMENT_BYTES };
}

function scanRecoveryArchive(
  bytes: Uint8Array,
): ReadonlyMap<string, RecoveryArchiveEntryMetadata> {
  const metadata = new Map<string, RecoveryArchiveEntryMetadata>();
  const foldedNames = new Set<string>();
  let segmentCount = 0;
  let uncompressedBytes = 0;

  // Returning false is intentional: inspect every central-directory entry
  // before allocating or inflating any of its advertised output.
  unzipSync(bytes, {
    filter(file) {
      const admitted = recoveryArchiveEntry(file.name);
      const foldedName = file.name.toLowerCase();
      if (
        admitted === null ||
        metadata.has(file.name) ||
        foldedNames.has(foldedName) ||
        !Number.isSafeInteger(file.originalSize) ||
        file.originalSize <= 0 ||
        file.originalSize > admitted.maximumSize ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        file.size > bytes.byteLength ||
        (file.compression !== 0 && file.compression !== 8)
      ) {
        throw new Error("Recovery archive contains an unsafe entry");
      }
      if (
        admitted.kind === "segment" &&
        ++segmentCount > MAX_RECOVERY_SEGMENTS
      ) {
        throw new Error("Recovery archive contains too many segments");
      }
      uncompressedBytes += file.originalSize;
      if (uncompressedBytes > MAX_RECOVERY_UNCOMPRESSED_BYTES) {
        throw new Error("Recovery archive expands beyond its size limit");
      }
      metadata.set(file.name, {
        ...admitted,
        originalSize: file.originalSize,
        compressedSize: file.size,
        compression: file.compression,
      });
      foldedNames.add(foldedName);
      return false;
    },
  });
  return metadata;
}

function extractRecoveryArchive(
  bytes: Uint8Array,
  metadata: ReadonlyMap<string, RecoveryArchiveEntryMetadata>,
): ReadonlyMap<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const localNames = new Set<string>();
  const localNamesFolded = new Set<string>();
  let extractedBytes = 0;
  let failureMessage: string | null = null;
  const fail = (message: string): void => {
    failureMessage ??= message;
  };
  const unzip = new Unzip((file) => {
    const centralEntry = metadata.get(file.name);
    const localEntry = recoveryArchiveEntry(file.name);
    const foldedName = file.name.toLowerCase();
    if (
      centralEntry === undefined ||
      localEntry === null ||
      localNames.has(file.name) ||
      localNamesFolded.has(foldedName) ||
      file.compression !== centralEntry.compression ||
      (file.size !== undefined && file.size !== centralEntry.compressedSize) ||
      (file.originalSize !== undefined &&
        file.originalSize !== centralEntry.originalSize)
    ) {
      fail("Recovery archive headers are inconsistent or ambiguous");
      return;
    }
    localNames.add(file.name);
    localNamesFolded.add(foldedName);
    const output = new Uint8Array(centralEntry.originalSize);
    let outputOffset = 0;
    file.ondata = (error, data, final) => {
      if (failureMessage !== null) return;
      if (error !== null) {
        fail("Recovery archive entry could not be decompressed");
        return;
      }
      if (
        data.byteLength > output.byteLength - outputOffset ||
        data.byteLength > MAX_RECOVERY_UNCOMPRESSED_BYTES - extractedBytes
      ) {
        fail("Recovery archive produced more data than its bounded headers");
        return;
      }
      output.set(data, outputOffset);
      outputOffset += data.byteLength;
      extractedBytes += data.byteLength;
      if (final) {
        if (outputOffset !== output.byteLength) {
          fail("Recovery archive produced less data than its bounded headers");
          return;
        }
        entries.set(file.name, output);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  // Small input slices bound the temporary output a forged DEFLATE stream can
  // produce before ondata gets a chance to stop further work.
  const chunkSize = 8 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    unzip.push(
      bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)),
      offset + chunkSize >= bytes.byteLength,
    );
    if (failureMessage !== null) throw new Error(failureMessage);
  }
  if (entries.size !== metadata.size || localNames.size !== metadata.size) {
    throw new Error("Recovery archive entry tables do not match");
  }
  return entries;
}

export async function validateRecoveryPackage(input: {
  readonly bytes: Uint8Array;
  readonly expectedTarget: OfficialTarget;
}): Promise<ValidatedRecoveryPackage> {
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_RECOVERY_ARCHIVE_BYTES
  ) {
    throw new RecoveryPackageError(
      "TOO_LARGE",
      "Recovery package is outside the 1-byte to 64-MiB limit",
    );
  }
  let entries: ReadonlyMap<string, Uint8Array>;
  let archiveMetadata: ReadonlyMap<string, RecoveryArchiveEntryMetadata>;
  try {
    archiveMetadata = scanRecoveryArchive(input.bytes);
    entries = extractRecoveryArchive(input.bytes, archiveMetadata);
  } catch {
    throw new RecoveryPackageError(
      "INVALID_ARCHIVE",
      "Recovery package could not be decompressed safely",
    );
  }
  const manifestBytes = entries.get("manifest.json");
  if (
    manifestBytes === undefined ||
    manifestBytes.byteLength > MAX_RECOVERY_MANIFEST_BYTES
  ) {
    throw new RecoveryPackageError(
      "INVALID_MANIFEST",
      "Recovery package does not contain a bounded manifest",
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new RecoveryPackageError(
      "INVALID_MANIFEST",
      "Recovery manifest is not valid JSON",
    );
  }
  if (!isRecord(manifest) || manifest.schemaVersion !== 1) {
    throw new RecoveryPackageError(
      "INVALID_MANIFEST",
      "Recovery manifest schema is unsupported",
    );
  }
  const targetValue = manifest.target;
  const releaseValue = manifest.release;
  const segmentValues = manifest.segments;
  if (
    !isRecord(targetValue) ||
    !isRecord(releaseValue) ||
    !Array.isArray(segmentValues)
  ) {
    throw new RecoveryPackageError(
      "INVALID_MANIFEST",
      "Recovery manifest is missing target, release, or segment data",
    );
  }
  const targetId = safeString(targetValue.id);
  const productName = safeString(targetValue.productName);
  const platform = safeString(targetValue.platform);
  const firmware = safeString(targetValue.firmware);
  const releaseLabel = safeString(releaseValue.label);
  const releaseRevision = safeString(releaseValue.revision);
  if (
    targetId === null ||
    productName === null ||
    platform === null ||
    firmware === null ||
    releaseLabel === null ||
    releaseRevision === null
  ) {
    throw new RecoveryPackageError(
      "INVALID_MANIFEST",
      "Recovery manifest contains invalid target or release fields",
    );
  }
  if (
    targetId !== input.expectedTarget.id ||
    productName !== input.expectedTarget.config.productName ||
    platform !== input.expectedTarget.config.platform ||
    firmware !== input.expectedTarget.config.firmware
  ) {
    throw new RecoveryPackageError(
      "TARGET_MISMATCH",
      "Recovery package belongs to a different Target",
    );
  }

  const segments: FirmwareSegment[] = [];
  const seenNames = new Set<string>();
  const seenAddresses = new Set<number>();
  for (const value of segmentValues) {
    if (!isRecord(value)) {
      throw new RecoveryPackageError(
        "INVALID_MANIFEST",
        "Recovery segment entry is not an object",
      );
    }
    const name = safeString(value.name, 160);
    const address = safeAddress(value.address);
    const size = safeAddress(value.size);
    const expectedSha =
      typeof value.sha256 === "string" && /^[a-f0-9]{64}$/u.test(value.sha256)
        ? value.sha256
        : null;
    if (
      name === null ||
      !/^[A-Za-z0-9_.-]+$/u.test(name) ||
      address === null ||
      size === null ||
      expectedSha === null ||
      seenNames.has(name) ||
      seenAddresses.has(address)
    ) {
      throw new RecoveryPackageError(
        "INVALID_MANIFEST",
        "Recovery segment table is malformed or duplicated",
      );
    }
    const bytes = entries.get(`segments/${name}`);
    if (bytes === undefined || bytes.byteLength !== size) {
      throw new RecoveryPackageError(
        "INVALID_MANIFEST",
        `Recovery segment ${name} is missing or has the wrong size`,
      );
    }
    const actualSha = await sha256Hex(bytes);
    if (actualSha !== expectedSha) {
      throw new RecoveryPackageError(
        "HASH_MISMATCH",
        `Recovery segment ${name} failed SHA-256 verification`,
      );
    }
    seenNames.add(name);
    seenAddresses.add(address);
    segments.push(Object.freeze({ name, address, bytes, sha256: actualSha }));
  }
  if (
    segments.length === 0 ||
    segments.length > MAX_RECOVERY_SEGMENTS ||
    seenNames.size !==
      Array.from(archiveMetadata.values()).filter(
        (entry) => entry.kind === "segment",
      ).length
  ) {
    throw new RecoveryPackageError(
      "INVALID_MANIFEST",
      "Recovery package contains an invalid or unreferenced segment table",
    );
  }
  segments.sort((left, right) => left.address - right.address);
  return Object.freeze({
    targetId,
    productName,
    platform,
    firmware,
    releaseLabel,
    releaseRevision,
    packageSha256: await sha256Hex(input.bytes),
    segments: Object.freeze(segments),
  });
}

function indexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new RecoveryPackageError(
      "STORAGE_UNAVAILABLE",
      "IndexedDB recovery journal is unavailable",
    );
  }
  return indexedDB;
}

async function openRecoveryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb().open(RECOVERY_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECOVERY_STORE)) {
        database.createObjectStore(RECOVERY_STORE);
      }
    };
    request.onerror = () =>
      reject(
        new RecoveryPackageError(
          "STORAGE_UNAVAILABLE",
          "Recovery journal could not be opened",
        ),
      );
    request.onsuccess = () => resolve(request.result);
  });
}

async function transactionRequest<T>(input: {
  readonly mode: IDBTransactionMode;
  readonly operation: (store: IDBObjectStore) => IDBRequest<T>;
}): Promise<T> {
  const database = await openRecoveryDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const rejectUnavailable = (message: string) =>
        reject(new RecoveryPackageError("STORAGE_UNAVAILABLE", message));
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(RECOVERY_STORE, input.mode);
      } catch {
        rejectUnavailable("Recovery journal transaction could not be started");
        return;
      }
      let requestResult: T;
      let requestSucceeded = false;
      transaction.onerror = () =>
        rejectUnavailable("Recovery journal transaction failed");
      transaction.onabort = () =>
        rejectUnavailable("Recovery journal transaction was aborted");
      transaction.oncomplete = () => {
        if (!requestSucceeded) {
          rejectUnavailable(
            "Recovery journal transaction completed without a successful operation",
          );
          return;
        }
        resolve(requestResult);
      };
      let request: IDBRequest<T>;
      try {
        request = input.operation(transaction.objectStore(RECOVERY_STORE));
      } catch {
        rejectUnavailable("Recovery journal operation could not be started");
        return;
      }
      request.onerror = () =>
        rejectUnavailable("Recovery journal operation failed");
      request.onsuccess = () => {
        requestResult = request.result;
        requestSucceeded = true;
      };
    });
  } finally {
    database.close();
  }
}

export async function saveRecoveryCheckpoint(
  checkpoint: RecoveryCheckpoint,
): Promise<void> {
  await transactionRequest({
    mode: "readwrite",
    operation: (store) => store.put(checkpoint, RECOVERY_KEY),
  });
}

export async function loadRecoveryCheckpoint(): Promise<RecoveryCheckpoint | null> {
  // getAll distinguishes an absent key from a malformed stored `undefined`
  // value; IDBObjectStore.get returns undefined for both cases.
  const storedValues = await transactionRequest<unknown[]>({
    mode: "readonly",
    operation: (store) => store.getAll(RECOVERY_KEY, 1),
  });
  if (!Array.isArray(storedValues) || storedValues.length > 1) {
    throw new RecoveryPackageError(
      "STORAGE_UNAVAILABLE",
      "Recovery journal returned an invalid result set",
    );
  }
  if (storedValues.length === 0) return null;
  const value = storedValues[0];
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new RecoveryPackageError(
      "STORAGE_UNAVAILABLE",
      "Recovery journal contains an invalid checkpoint",
    );
  }
  const targetId = safeString(value.targetId);
  const productName = safeString(value.productName);
  const packageSha256 =
    typeof value.packageSha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(value.packageSha256)
      ? value.packageSha256
      : null;
  const stage = value.stage;
  const stages = new Set<RecoveryCheckpoint["stage"]>([
    "PACKAGE_SAVED",
    "BOOTLOADER",
    "ERASING",
    "WRITING",
    "VERIFYING",
    "REBOOTING",
    "RECONNECTING",
    "RECOVERY_REQUIRED",
  ]);
  const createdAt = safeString(value.createdAt);
  const updatedAt = safeString(value.updatedAt);
  const safeError =
    value.safeError === null ? null : safeString(value.safeError, 500);
  if (
    targetId === null ||
    productName === null ||
    packageSha256 === null ||
    typeof stage !== "string" ||
    !stages.has(stage as RecoveryCheckpoint["stage"]) ||
    createdAt === null ||
    updatedAt === null ||
    (value.safeError !== null && safeError === null)
  ) {
    throw new RecoveryPackageError(
      "STORAGE_UNAVAILABLE",
      "Recovery journal contains an invalid checkpoint",
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    targetId,
    productName,
    packageSha256,
    stage: stage as RecoveryCheckpoint["stage"],
    createdAt,
    updatedAt,
    safeError,
  });
}

export async function clearRecoveryCheckpoint(): Promise<void> {
  await transactionRequest({
    mode: "readwrite",
    operation: (store) => store.delete(RECOVERY_KEY),
  });
}
