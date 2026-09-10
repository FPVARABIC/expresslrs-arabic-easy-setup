/**
 * Recovery that outlives the application.
 *
 * A recovery checkpoint kept only in IndexedDB, `localStorage`, the WebView's
 * cache or app-private storage is exactly as durable as the installation. All
 * of those are erased by an uninstall, by "Clear storage", by a reinstall with
 * a different signing key, and on Android by the system reclaiming cache under
 * pressure. That is an unacceptable place to keep the only copy of the image a
 * bricked transmitter needs, because the moment it is needed is also the moment
 * the operator is most likely to have reinstalled the app trying to fix things.
 *
 * So before any destructive firmware operation the recovery package is written
 * to a location the operator chooses, *outside* anything the app owns — through
 * Android's Storage Access Framework on the native host, and through the File
 * System Access API in a browser. It is then **reopened and hashed**, and the
 * digest must match the bytes that were written. Only that proves a file exists
 * on durable storage; a started download proves nothing, and an operator
 * ticking "I saved it" proves less.
 *
 * Failure blocks that one destructive operation with the exact reason. It is
 * never a global lock: reading identity, diagnostics, reversible settings and
 * importing an existing package all stay available, which is precisely what an
 * operator needs when an export has just failed.
 */
import { copyToArrayBuffer } from "./byte-utils";
import type { OfficialTarget } from "./parity-types";
import {
  validateRecoveryPackage,
  type ValidatedRecoveryPackage,
} from "./recovery-package";

/** Where a verified package lives. Both are outside app-private storage. */
export type DurableRecoveryBackend = "ANDROID_SAF" | "FILE_SYSTEM_ACCESS";

export type DurableRecoveryFailure =
  /**
   * Neither durable target exists here. On a native host that means the
   * document bridge is absent; in a browser, that `showSaveFilePicker` is not
   * implemented. A plain download is deliberately not accepted as a substitute
   * because the page cannot reopen what it downloaded, so it cannot prove the
   * file is there.
   */
  | "NO_DURABLE_TARGET"
  /** The operator dismissed the picker. Their choice, not an error state. */
  | "CANCELLED"
  /** The picker or the write refused for a reason that is not space. */
  | "WRITE_FAILED"
  /** The destination has no room. Named separately: it is actionable. */
  | "INSUFFICIENT_STORAGE"
  /** Written, but reopening it failed — so its durability is unproven. */
  | "REOPEN_FAILED"
  /** Reopened, but shorter than what was written. */
  | "TRUNCATED"
  /** Reopened at the right length, and the bytes are not the same bytes. */
  | "HASH_MISMATCH"
  /** An imported file is not a recovery package this build can restore from. */
  | "PACKAGE_INVALID";

export class DurableRecoveryError extends Error {
  public constructor(
    public readonly code: DurableRecoveryFailure,
    message: string,
  ) {
    super(message);
    this.name = "DurableRecoveryError";
  }
}

/**
 * Proof that a durable copy exists — the record shown to the operator and
 * carried into the checkpoint.
 *
 * `sha256` is over the whole archive as it was read back from storage, not as
 * it was held in memory. That distinction is the entire point of the receipt.
 */
export interface DurableRecoveryReceipt {
  readonly backend: DurableRecoveryBackend;
  /** Exactly where it is, in the form the platform reports it. */
  readonly location: string;
  readonly displayName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly verifiedAt: string;
}

export interface DurableDocumentHandle {
  readonly location: string;
  readonly displayName: string;
}

/**
 * The narrow storage contract both platforms implement.
 *
 * Deliberately three operations: create a document the operator places, read
 * one back, and pick an existing one. Anything wider would be a filesystem,
 * and this needs a file.
 */
export interface DurableDocumentStore {
  readonly backend: DurableRecoveryBackend;
  create(input: {
    readonly suggestedName: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array;
  }): Promise<DurableDocumentHandle>;
  read(location: string): Promise<Uint8Array>;
  pick(input: { readonly mimeType: string }): Promise<DurableDocumentHandle>;
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

/**
 * Writes the package, reopens it, and only then reports success.
 *
 * The order matters and is the requirement: create, read back, compare, and
 * treat every step's failure as a reason the destructive operation may not
 * proceed. A mismatch is reported as a mismatch rather than retried silently —
 * storage that returns different bytes than it was given is not storage this
 * should trust with the only copy of a firmware image.
 */
export async function exportDurableRecovery(input: {
  readonly store: DurableDocumentStore | null;
  readonly suggestedName: string;
  readonly bytes: Uint8Array;
  readonly mimeType?: string;
}): Promise<DurableRecoveryReceipt> {
  const { store } = input;
  if (store === null) {
    throw new DurableRecoveryError(
      "NO_DURABLE_TARGET",
      "This platform offers no storage this application can write to and read back",
    );
  }
  const expected = await sha256Hex(input.bytes);
  const handle = await store.create({
    suggestedName: input.suggestedName,
    mimeType: input.mimeType ?? "application/zip",
    bytes: input.bytes,
  });

  let readBack: Uint8Array;
  try {
    readBack = await store.read(handle.location);
  } catch (error) {
    // A create that reported success followed by a read that fails is the
    // worst of the outcomes to guess about, so it is not guessed about.
    throw error instanceof DurableRecoveryError
      ? error
      : new DurableRecoveryError(
          "REOPEN_FAILED",
          `The recovery package was written to ${handle.displayName} but could not be reopened to verify it`,
        );
  }
  if (readBack.byteLength !== input.bytes.byteLength) {
    throw new DurableRecoveryError(
      "TRUNCATED",
      `The saved recovery package is ${String(readBack.byteLength)} bytes, not the ${String(input.bytes.byteLength)} bytes written`,
    );
  }
  const actual = await sha256Hex(readBack);
  if (actual !== expected) {
    throw new DurableRecoveryError(
      "HASH_MISMATCH",
      "The saved recovery package does not match the bytes that were written",
    );
  }
  return Object.freeze({
    backend: store.backend,
    location: handle.location,
    displayName: handle.displayName,
    byteLength: readBack.byteLength,
    sha256: actual,
    verifiedAt: new Date().toISOString(),
  });
}

export interface ImportedDurableRecovery {
  readonly receipt: DurableRecoveryReceipt;
  readonly recoveryPackage: ValidatedRecoveryPackage;
}

/**
 * Reads a package the operator points at and validates it completely.
 *
 * This is the path that makes recovery survive a reinstall: nothing here reads
 * application state, so it works on a fresh installation with an empty journal.
 * Validation is the same `validateRecoveryPackage` a same-session recovery
 * uses — an imported file gets no weaker check for having come from outside.
 */
export async function importDurableRecovery(input: {
  readonly store: DurableDocumentStore | null;
  readonly expectedTarget: OfficialTarget;
}): Promise<ImportedDurableRecovery> {
  const { store } = input;
  if (store === null) {
    throw new DurableRecoveryError(
      "NO_DURABLE_TARGET",
      "This platform offers no way to open a saved recovery package",
    );
  }
  const handle = await store.pick({ mimeType: "application/zip" });
  let bytes: Uint8Array;
  try {
    bytes = await store.read(handle.location);
  } catch (error) {
    throw error instanceof DurableRecoveryError
      ? error
      : new DurableRecoveryError(
          "REOPEN_FAILED",
          `${handle.displayName} could not be read`,
        );
  }
  let recoveryPackage: ValidatedRecoveryPackage;
  try {
    recoveryPackage = await validateRecoveryPackage({
      bytes,
      expectedTarget: input.expectedTarget,
    });
  } catch (error) {
    throw new DurableRecoveryError(
      "PACKAGE_INVALID",
      error instanceof Error
        ? error.message
        : "The selected file is not a recovery package",
    );
  }
  return Object.freeze({
    receipt: Object.freeze({
      backend: store.backend,
      location: handle.location,
      displayName: handle.displayName,
      byteLength: bytes.byteLength,
      sha256: recoveryPackage.packageSha256,
      verifiedAt: new Date().toISOString(),
    }),
    recoveryPackage,
  });
}
