import {
  strFromU8,
  strToU8,
  Unzip,
  UnzipInflate,
  unzipSync,
  zipSync,
} from "fflate";

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
    | "RECOVERY_REQUIRED"
    /**
     * A recovery write finished but the device's identity could not be read
     * and matched afterwards. The checkpoint deliberately survives: a write
     * that completed is not evidence that the device came back.
     */
    | "RECOVERY_INCOMPLETE"
    /**
     * A firmware write finished and the device came back, but what came back
     * could not be proven to be the device this write intended to produce —
     * most importantly, a receiver flashed with transmitter firmware that did
     * not return a transmitter role.
     *
     * This is a *verification* state, not a lock. Every operation stays
     * available; what is withheld is the claim of success. The checkpoint
     * survives so the original image can still be restored.
     */
    | "WRITE_COMPLETED_RECONNECT_UNVERIFIED";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly safeError: string | null;
}

/**
 * What the durable copy records about where it came from.
 *
 * A recovery archive on its own says which Target and which release it can
 * restore. That is not enough for a file found months later on a phone that has
 * since been wiped: this says which *device* it was taken from, which frozen
 * target pack produced its layout bytes, what was configured into it, and when.
 * Absent on an archive that was never exported, so it is validated only when
 * present rather than being required retroactively.
 */
export interface RecoveryProvenance {
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly device: {
    readonly productName: string | null;
    readonly role: string | null;
    readonly firmwareVersion: string | null;
  };
  readonly layoutPack: {
    readonly packVersion: number;
    readonly targetsSha: string;
    readonly targetsJsonSha256: string;
  };
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
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
  /** Null when the archive carries no `provenance.json`, or an invalid one. */
  readonly provenance: RecoveryProvenance | null;
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
  readonly kind: "manifest" | "provenance" | "segment";
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
  // Written when the package is exported to durable storage, which is the
  // first moment the device identity and the timestamps are known. Optional,
  // so a package produced before this existed still restores.
  if (name === "provenance.json") {
    return { kind: "provenance", maximumSize: MAX_RECOVERY_MANIFEST_BYTES };
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
    provenance: readProvenance(entries.get("provenance.json")),
  });
}

function digest64(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)
    ? value
    : null;
}

/**
 * Reads `provenance.json` when it is there and well formed, and null otherwise.
 *
 * A malformed provenance entry does not fail the package: the firmware and its
 * hashes are what a restore needs, and refusing to restore a device because a
 * descriptive sidecar is damaged would be the wrong trade in the one situation
 * where this file matters. It is reported as absent rather than as fact.
 */
function readProvenance(
  bytes: Uint8Array | undefined,
): RecoveryProvenance | null {
  if (bytes === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(bytes));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) return null;
  const createdAt = safeString(parsed.createdAt, 64);
  const device = isRecord(parsed.device) ? parsed.device : null;
  const layoutPack = isRecord(parsed.layoutPack) ? parsed.layoutPack : null;
  const configuration = isRecord(parsed.configuration)
    ? parsed.configuration
    : null;
  if (
    createdAt === null ||
    device === null ||
    layoutPack === null ||
    configuration === null
  ) {
    return null;
  }
  const packVersion = layoutPack.packVersion;
  const targetsSha = safeString(layoutPack.targetsSha, 64);
  const targetsJsonSha256 = digest64(layoutPack.targetsJsonSha256);
  if (
    !Number.isSafeInteger(packVersion) ||
    (packVersion as number) < 0 ||
    targetsSha === null ||
    targetsJsonSha256 === null
  ) {
    return null;
  }
  const flattened: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(configuration)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/u.test(key)) continue;
    if (typeof value === "boolean") flattened[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) {
      flattened[key] = value;
    } else {
      const text = safeString(value, 120);
      if (text !== null) flattened[key] = text;
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    createdAt,
    device: Object.freeze({
      productName: safeString(device.productName),
      role: safeString(device.role, 16),
      firmwareVersion: safeString(device.firmwareVersion, 64),
    }),
    layoutPack: Object.freeze({
      packVersion: packVersion as number,
      targetsSha,
      targetsJsonSha256,
    }),
    configuration: Object.freeze(flattened),
  });
}

/**
 * Returns the archive with a `provenance.json` entry added.
 *
 * Called at export time rather than at build time because the device identity
 * and the moment of saving are only known then. The archive is this build's own
 * output, seconds old, so unpacking and repacking it is safe and costs a
 * fraction of the write that follows.
 */
export function attachRecoveryProvenance(
  archive: Uint8Array,
  provenance: RecoveryProvenance,
): Uint8Array {
  const entries = unzipSync(archive);
  const rebuilt: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(entries)) {
    if (name === "provenance.json") continue;
    rebuilt[name] = bytes;
  }
  rebuilt["provenance.json"] = strToU8(JSON.stringify(provenance, null, 2));
  return zipSync(rebuilt, { level: 6 });
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
    "RECOVERY_INCOMPLETE",
    "WRITE_COMPLETED_RECONNECT_UNVERIFIED",
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
