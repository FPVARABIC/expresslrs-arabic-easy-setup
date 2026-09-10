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
import {
  openRecoveryVault,
  readRecoveryVaultHeader,
  sealRecoveryVault,
  RecoveryVaultError,
  type RecoveryVaultHeader,
  type RecoveryVaultIdentity,
} from "./recovery-vault";

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
  | "PACKAGE_INVALID"
  /**
   * The file did not authenticate: the passphrase is wrong, or the bytes have
   * been altered since they were sealed. One code, because AES-GCM cannot tell
   * the two apart and neither can this.
   */
  | "AUTHENTICATION_FAILED"
  /** Structurally not one of this application's encrypted recovery files. */
  | "NOT_A_RECOVERY_FILE"
  /** A passphrase is needed and none usable was supplied. */
  | "PASSPHRASE_UNUSABLE";

/** Maps an envelope failure onto the durable-recovery vocabulary. */
function fromVaultError(error: unknown): DurableRecoveryError {
  if (!(error instanceof RecoveryVaultError)) {
    return new DurableRecoveryError(
      "PACKAGE_INVALID",
      "The selected file is not a recovery package",
    );
  }
  switch (error.code) {
    case "AUTHENTICATION_FAILED":
      return new DurableRecoveryError("AUTHENTICATION_FAILED", error.message);
    case "PASSPHRASE_UNUSABLE":
      return new DurableRecoveryError("PASSPHRASE_UNUSABLE", error.message);
    case "NOT_A_VAULT":
      return new DurableRecoveryError("NOT_A_RECOVERY_FILE", error.message);
    default:
      // TRUNCATED, TRAILING_DATA, MALFORMED_HEADER, UNSUPPORTED_FORMAT and
      // TOO_LARGE are all "this file is not usable", reported with the
      // envelope's own wording so the operator sees which.
      return new DurableRecoveryError("PACKAGE_INVALID", error.message);
  }
}

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
  /** Digest of the sealed file as it was read back from storage. */
  readonly sha256: string;
  /**
   * Digest of the *archive inside* it, recovered by actually opening the file.
   *
   * Non-null only when the file was decrypted, authenticated and validated, so
   * it is the part of the receipt a byte comparison cannot produce. Null after
   * a pick, because at that point nothing has been opened and claiming a
   * digest would be inventing one.
   */
  readonly archiveSha256: string | null;
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
  readonly identity: RecoveryVaultIdentity;
  readonly passphrase: string;
  readonly expectedTarget: OfficialTarget;
  readonly mimeType?: string;
}): Promise<DurableRecoveryReceipt> {
  const { store } = input;
  if (store === null) {
    throw new DurableRecoveryError(
      "NO_DURABLE_TARGET",
      "This platform offers no storage this application can write to and read back",
    );
  }
  // Sealed before it is offered to storage, so the plaintext archive never
  // reaches a location outside this application.
  let sealed: Uint8Array;
  try {
    sealed = await sealRecoveryVault({
      archive: input.bytes,
      identity: input.identity,
      passphrase: input.passphrase,
    });
  } catch (error) {
    throw fromVaultError(error);
  }
  const expected = await sha256Hex(sealed);
  const archiveDigest = await sha256Hex(input.bytes);
  const handle = await store.create({
    suggestedName: input.suggestedName,
    mimeType: input.mimeType ?? "application/octet-stream",
    bytes: sealed,
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
  if (readBack.byteLength !== sealed.byteLength) {
    throw new DurableRecoveryError(
      "TRUNCATED",
      `The saved recovery package is ${String(readBack.byteLength)} bytes, not the ${String(sealed.byteLength)} bytes written`,
    );
  }
  const actual = await sha256Hex(readBack);
  if (actual !== expected) {
    throw new DurableRecoveryError(
      "HASH_MISMATCH",
      "The saved recovery package does not match the bytes that were written",
    );
  }

  // Everything above proves storage handed back the same bytes. That is not
  // the question an operator needs answered.
  //
  // The question is whether *this file*, with *the passphrase they just
  // typed*, will open on the day a transmitter is bricked — and a digest
  // cannot answer it. A mistyped passphrase seals perfectly and hashes
  // perfectly; so does a file whose archive is subtly wrong. Both would have
  // been reported "verified" and discovered at recovery time, which is the
  // one moment there is nothing left to fall back on.
  //
  // So the file is actually opened, actually authenticated, actually
  // validated, and actually matched against the package that was prepared.
  // Only then is a receipt issued.
  let opened: { readonly archive: Uint8Array };
  try {
    opened = await openRecoveryVault({
      bytes: readBack,
      passphrase: input.passphrase,
    });
  } catch (error) {
    throw fromVaultError(error);
  }
  try {
    const validated = await validateRecoveryPackage({
      bytes: opened.archive,
      expectedTarget: input.expectedTarget,
    });
    if (validated.packageSha256 !== archiveDigest) {
      throw new DurableRecoveryError(
        "PACKAGE_INVALID",
        "The saved file opened, but the archive inside it is not the package that was prepared",
      );
    }
  } catch (error) {
    throw error instanceof DurableRecoveryError
      ? error
      : new DurableRecoveryError(
          "PACKAGE_INVALID",
          error instanceof Error
            ? error.message
            : "The saved file did not contain a usable recovery package",
        );
  } finally {
    // The decrypted archive was only ever needed to answer the question.
    opened.archive.fill(0);
  }

  return Object.freeze({
    backend: store.backend,
    location: handle.location,
    displayName: handle.displayName,
    byteLength: readBack.byteLength,
    sha256: actual,
    archiveSha256: archiveDigest,
    verifiedAt: new Date().toISOString(),
  });
}

export interface ImportedDurableRecovery {
  readonly receipt: DurableRecoveryReceipt;
  readonly recoveryPackage: ValidatedRecoveryPackage;
}

/**
 * A file the operator picked, identified but not yet opened.
 *
 * Two stages instead of one, because the identity header is readable without
 * the passphrase and the operator needs to see it *first*. Being shown "this
 * file is a Vendor TX Module saved on 3 March" before typing anything is the
 * difference between recovering the right device and flashing the wrong one;
 * asking for a passphrase against an unnamed file invites answering it for the
 * wrong file. The sealed bytes are carried so the second stage cannot be
 * pointed at a different file than the one that was identified.
 */
export interface PickedDurableRecovery {
  readonly receipt: DurableRecoveryReceipt;
  readonly header: RecoveryVaultHeader;
  readonly sealed: Uint8Array;
}

/**
 * Picks a saved recovery file and reads what it says about itself.
 *
 * Reads no application state, which is what makes recovery survive a
 * reinstall: this works on a fresh installation with an empty journal. No
 * passphrase is involved and nothing is decrypted, so a wrong file costs the
 * operator a sentence rather than a failed authentication they have to
 * interpret.
 */
export async function pickDurableRecovery(input: {
  readonly store: DurableDocumentStore | null;
}): Promise<PickedDurableRecovery> {
  const { store } = input;
  if (store === null) {
    throw new DurableRecoveryError(
      "NO_DURABLE_TARGET",
      "This platform offers no way to open a saved recovery package",
    );
  }
  const handle = await store.pick({ mimeType: "application/octet-stream" });
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
  let header: RecoveryVaultHeader;
  try {
    header = readRecoveryVaultHeader(bytes);
  } catch (error) {
    throw fromVaultError(error);
  }
  return Object.freeze({
    receipt: Object.freeze({
      backend: store.backend,
      location: handle.location,
      displayName: handle.displayName,
      byteLength: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      archiveSha256: null,
      verifiedAt: new Date().toISOString(),
    }),
    header,
    sealed: bytes,
  });
}

/**
 * Opens a picked file and validates the archive inside it.
 *
 * Authentication comes first and yields nothing on failure — `openRecoveryVault`
 * verifies the GCM tag before it returns any plaintext — so there is no
 * half-parsed archive for a caller to act on and no state to roll back. Only
 * after that does the archive face the same `validateRecoveryPackage` a
 * same-session recovery uses: an imported file gets no weaker check for having
 * come from outside, and its Target must still match the selected one.
 */
export async function openDurableRecovery(input: {
  readonly picked: PickedDurableRecovery;
  readonly passphrase: string;
  readonly expectedTarget: OfficialTarget;
}): Promise<ImportedDurableRecovery> {
  let archive: Uint8Array;
  try {
    const opened = await openRecoveryVault({
      bytes: input.picked.sealed,
      passphrase: input.passphrase,
    });
    archive = opened.archive;
  } catch (error) {
    throw fromVaultError(error);
  }
  let recoveryPackage: ValidatedRecoveryPackage;
  try {
    recoveryPackage = await validateRecoveryPackage({
      bytes: archive,
      expectedTarget: input.expectedTarget,
    });
  } catch (error) {
    throw new DurableRecoveryError(
      "PACKAGE_INVALID",
      error instanceof Error
        ? error.message
        : "The selected file is not a recovery package",
    );
  } finally {
    // The decrypted archive has served its purpose once the package is
    // validated: the segments it needed are copied into the validated result.
    archive.fill(0);
  }
  return Object.freeze({
    receipt: Object.freeze({
      ...input.picked.receipt,
      archiveSha256: recoveryPackage.packageSha256,
    }),
    recoveryPackage,
  });
}
