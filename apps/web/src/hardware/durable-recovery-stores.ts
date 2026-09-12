/**
 * The two places a verified recovery package can actually live.
 *
 * Both are storage the *operator* owns and the application does not: an
 * Android document tree reached through the Storage Access Framework, or a file
 * the browser's File System Access API hands back a handle to. Neither is
 * cleared by uninstalling this application, which is the whole requirement.
 *
 * A plain `<a download>` is not among them, and that is deliberate. A download
 * cannot be reopened by the page that started it, so there is no way to prove
 * the file exists or that its bytes survived. `downloadRecovery` remains in the
 * product as a convenience second copy; it is not accepted as the durable one.
 */
import type {
  DurableDocumentHandle,
  DurableDocumentStore,
} from "./durable-recovery";
import { DurableRecoveryError } from "./durable-recovery";
import { readNativeHardwareBridge } from "./native-bridge";

/** Chunk size for both directions. Matches the native bridge's own bound. */
const DOCUMENT_CHUNK_BYTES = 64 * 1024;

/**
 * Guards against a store that never reports `eof`. The recovery archive is
 * capped at 64 MiB by `recovery-package.ts`, so anything past that is a
 * misbehaving provider rather than a large package.
 */
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;

interface NativeDocumentApi {
  create(input: {
    suggestedName: string;
    mimeType: string;
  }): Promise<{ location: string; displayName: string }>;
  write(input: {
    location: string;
    bytes: readonly number[];
    offset: number;
  }): Promise<{ offset: number }>;
  commit(input: {
    location: string;
  }): Promise<{ location: string; displayName: string; byteLength: number }>;
  read(input: {
    location: string;
    offset: number;
    maxBytes: number;
  }): Promise<{ bytes: readonly number[]; length: number; eof: boolean }>;
  pick(input: {
    mimeType: string;
  }): Promise<{ location: string; displayName: string }>;
}

function isFunction(value: unknown): boolean {
  return typeof value === "function";
}

/**
 * Maps a native refusal onto a durable-recovery reason.
 *
 * The bridge reports refusals in a `bridgeReason` field rather than in free
 * text, precisely so this mapping is on a name and not on a message the host
 * might reword.
 */
function nativeFailure(error: unknown): DurableRecoveryError {
  const reason =
    typeof (error as { bridgeReason?: unknown } | null)?.bridgeReason ===
    "string"
      ? (error as { bridgeReason: string }).bridgeReason
      : "";
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "the native document bridge refused the request";
  switch (reason) {
    case "CANCELLED":
    case "PICKER_CANCELLED":
      return new DurableRecoveryError("CANCELLED", message);
    case "NO_SPACE":
      return new DurableRecoveryError("INSUFFICIENT_STORAGE", message);
    case "DOCUMENT_NOT_FOUND":
    case "READ_FAILED":
      return new DurableRecoveryError("REOPEN_FAILED", message);
    default:
      return new DurableRecoveryError("WRITE_FAILED", message);
  }
}

async function readNativeDocument(
  api: NativeDocumentApi,
  location: string,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (;;) {
    let chunk: { bytes: readonly number[]; length: number; eof: boolean };
    try {
      chunk = await api.read({
        location,
        offset,
        maxBytes: DOCUMENT_CHUNK_BYTES,
      });
    } catch (error) {
      throw nativeFailure(error);
    }
    const length = Number(chunk.length);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new DurableRecoveryError(
        "REOPEN_FAILED",
        "The native document bridge reported an invalid chunk length",
      );
    }
    if (length > 0) {
      const bytes = Uint8Array.from(chunk.bytes);
      if (bytes.byteLength !== length) {
        throw new DurableRecoveryError(
          "REOPEN_FAILED",
          "The native document bridge returned a chunk that disagrees with its own length",
        );
      }
      chunks.push(bytes);
      offset += bytes.byteLength;
      if (offset > MAX_DOCUMENT_BYTES) {
        throw new DurableRecoveryError(
          "REOPEN_FAILED",
          "The saved file is larger than any recovery package this build accepts",
        );
      }
    }
    // A provider that reports neither progress nor end-of-file would otherwise
    // spin here. Zero bytes without `eof` is treated as the end it is.
    if (chunk.eof === true || length === 0) break;
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    joined.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return joined;
}

/** The Android Storage Access Framework, reached through the native host. */
export function nativeDocumentStore(
  api: NativeDocumentApi,
): DurableDocumentStore {
  const store: DurableDocumentStore = {
    backend: "ANDROID_SAF",
    async create(input: {
      readonly suggestedName: string;
      readonly mimeType: string;
      readonly bytes: Uint8Array;
    }): Promise<DurableDocumentHandle> {
      let handle: { location: string; displayName: string };
      try {
        handle = await api.create({
          suggestedName: input.suggestedName,
          mimeType: input.mimeType,
        });
      } catch (error) {
        throw nativeFailure(error);
      }
      try {
        for (
          let offset = 0;
          offset < input.bytes.byteLength;
          offset += DOCUMENT_CHUNK_BYTES
        ) {
          const slice = input.bytes.subarray(
            offset,
            Math.min(offset + DOCUMENT_CHUNK_BYTES, input.bytes.byteLength),
          );
          await api.write({
            location: handle.location,
            bytes: Array.from(slice),
            offset,
          });
        }
        const committed = await api.commit({ location: handle.location });
        if (Number(committed.byteLength) !== input.bytes.byteLength) {
          throw new DurableRecoveryError(
            "TRUNCATED",
            `The document provider stored ${String(committed.byteLength)} of ${String(input.bytes.byteLength)} bytes`,
          );
        }
        return Object.freeze({
          location: committed.location,
          displayName: committed.displayName,
        });
      } catch (error) {
        throw error instanceof DurableRecoveryError
          ? error
          : nativeFailure(error);
      }
    },
    async read(location: string): Promise<Uint8Array> {
      return readNativeDocument(api, location);
    },
    async pick(input: {
      readonly mimeType: string;
    }): Promise<DurableDocumentHandle> {
      try {
        const handle = await api.pick({ mimeType: input.mimeType });
        return Object.freeze({
          location: handle.location,
          displayName: handle.displayName,
        });
      } catch (error) {
        throw nativeFailure(error);
      }
    },
  };
  return Object.freeze(store);
}

interface FileSystemWritableStreamLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

interface FileSystemFileHandleLike {
  readonly name: string;
  createWritable(): Promise<FileSystemWritableStreamLike>;
  getFile(): Promise<{
    readonly size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
}

interface FileSystemAccessGlobals {
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleLike>;
  showOpenFilePicker?: (
    options?: unknown,
  ) => Promise<readonly FileSystemFileHandleLike[]>;
}

/**
 * A dismissed picker throws `AbortError`. That is the operator declining, not a
 * fault, and it is reported as `CANCELLED` so the reason shown to them says so.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof (error as { name?: unknown } | null)?.name === "string" &&
    (error as { name: string }).name === "AbortError"
  );
}

/** A quota or disk-full condition, which browsers report by name. */
function isQuotaError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "QuotaExceededError" || name === "NotAllowedError";
}

/**
 * The browser path. The handle is kept in this closure rather than in a URL or
 * a string: File System Access has no reopenable path, so the handle *is* the
 * location, and reading back goes through the same handle that was written.
 *
 * Only handles this store created or picked are readable, so a location string
 * from anywhere else cannot make the page read an arbitrary file.
 */
export function fileSystemAccessStore(
  global: FileSystemAccessGlobals,
): DurableDocumentStore {
  const handles = new Map<string, FileSystemFileHandleLike>();
  let nextHandleId = 0;

  function remember(handle: FileSystemFileHandleLike): DurableDocumentHandle {
    const location = `filesystem:${String(nextHandleId++)}:${handle.name}`;
    handles.set(location, handle);
    return Object.freeze({ location, displayName: handle.name });
  }

  const store: DurableDocumentStore = {
    backend: "FILE_SYSTEM_ACCESS",
    async create(input: {
      readonly suggestedName: string;
      readonly mimeType: string;
      readonly bytes: Uint8Array;
    }): Promise<DurableDocumentHandle> {
      const showSaveFilePicker = global.showSaveFilePicker;
      if (typeof showSaveFilePicker !== "function") {
        throw new DurableRecoveryError(
          "NO_DURABLE_TARGET",
          "This browser cannot save a file the page is able to reopen and verify",
        );
      }
      let handle: FileSystemFileHandleLike;
      try {
        handle = await showSaveFilePicker({
          suggestedName: input.suggestedName,
          types: [
            {
              description: "ExpressLRS recovery package",
              accept: { [input.mimeType]: [".zip"] },
            },
          ],
        });
      } catch (error) {
        throw isAbortError(error)
          ? new DurableRecoveryError(
              "CANCELLED",
              "Saving the recovery package was cancelled",
            )
          : new DurableRecoveryError(
              "WRITE_FAILED",
              "The browser refused to open a save location",
            );
      }
      let writable: FileSystemWritableStreamLike;
      try {
        writable = await handle.createWritable();
      } catch (error) {
        throw isQuotaError(error)
          ? new DurableRecoveryError(
              "INSUFFICIENT_STORAGE",
              "There is not enough room at the chosen location",
            )
          : new DurableRecoveryError(
              "WRITE_FAILED",
              "The chosen location could not be opened for writing",
            );
      }
      try {
        for (
          let offset = 0;
          offset < input.bytes.byteLength;
          offset += DOCUMENT_CHUNK_BYTES
        ) {
          await writable.write(
            input.bytes.subarray(
              offset,
              Math.min(offset + DOCUMENT_CHUNK_BYTES, input.bytes.byteLength),
            ),
          );
        }
        await writable.close();
      } catch (error) {
        // Leaving a half-written file where the operator will later look for
        // their only copy of a firmware image is worse than leaving nothing.
        await writable.abort?.(error).catch(() => {});
        throw isQuotaError(error)
          ? new DurableRecoveryError(
              "INSUFFICIENT_STORAGE",
              "The chosen location ran out of room while writing",
            )
          : new DurableRecoveryError(
              "WRITE_FAILED",
              "Writing the recovery package failed",
            );
      }
      return remember(handle);
    },
    async read(location: string): Promise<Uint8Array> {
      const handle = handles.get(location);
      if (handle === undefined) {
        throw new DurableRecoveryError(
          "REOPEN_FAILED",
          "That saved location is no longer held by this page",
        );
      }
      try {
        const file = await handle.getFile();
        if (file.size > MAX_DOCUMENT_BYTES) {
          throw new DurableRecoveryError(
            "REOPEN_FAILED",
            "The saved file is larger than any recovery package this build accepts",
          );
        }
        return new Uint8Array(await file.arrayBuffer());
      } catch (error) {
        throw error instanceof DurableRecoveryError
          ? error
          : new DurableRecoveryError(
              "REOPEN_FAILED",
              "The saved recovery package could not be reopened",
            );
      }
    },
    async pick(input: {
      readonly mimeType: string;
    }): Promise<DurableDocumentHandle> {
      const showOpenFilePicker = global.showOpenFilePicker;
      if (typeof showOpenFilePicker !== "function") {
        throw new DurableRecoveryError(
          "NO_DURABLE_TARGET",
          "This browser cannot open a file for the page to verify",
        );
      }
      try {
        const picked = await showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "ExpressLRS recovery package",
              accept: { [input.mimeType]: [".zip"] },
            },
          ],
        });
        const handle = picked[0];
        if (handle === undefined) {
          throw new DurableRecoveryError(
            "CANCELLED",
            "No recovery package was chosen",
          );
        }
        return remember(handle);
      } catch (error) {
        if (error instanceof DurableRecoveryError) throw error;
        throw isAbortError(error)
          ? new DurableRecoveryError(
              "CANCELLED",
              "Choosing a recovery package was cancelled",
            )
          : new DurableRecoveryError(
              "REOPEN_FAILED",
              "The recovery package could not be opened",
            );
      }
    },
  };
  return Object.freeze(store);
}

interface DurableStoreGlobals extends FileSystemAccessGlobals {
  readonly elrsNativeBridge?: unknown;
}

/**
 * Chooses the durable target this platform actually has, or null.
 *
 * The native document bridge wins where it exists, because on Android it is the
 * only one of the two that reaches storage outside the app. A WebView does not
 * implement File System Access at all, so on the packaged host the choice is
 * the bridge or nothing — and "nothing" is reported as a blocked operation with
 * its reason rather than as a silent fall back to an unverifiable download.
 */
export function readDurableDocumentStore(
  scope: unknown = globalThis,
): DurableDocumentStore | null {
  const global = (scope ?? {}) as DurableStoreGlobals;
  const bridge = readNativeHardwareBridge(scope);
  const documents = (bridge as { documents?: unknown } | null)?.documents;
  if (documents !== null && typeof documents === "object") {
    const api = documents as Partial<NativeDocumentApi>;
    if (
      isFunction(api.create) &&
      isFunction(api.write) &&
      isFunction(api.commit) &&
      isFunction(api.read) &&
      isFunction(api.pick)
    ) {
      return nativeDocumentStore(documents as NativeDocumentApi);
    }
  }
  if (isFunction(global.showSaveFilePicker)) {
    return fileSystemAccessStore(global);
  }
  return null;
}
