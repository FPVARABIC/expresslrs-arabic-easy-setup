/**
 * An in-memory File System Access implementation for tests.
 *
 * The durable-recovery gate is satisfied only by a file that was written,
 * reopened and hashed. A test cannot fake that with a checkbox, so it installs
 * a real picker whose handles behave the way the browser's do — including the
 * ways they fail, because a dismissed picker and a full disk are states the
 * gate has to refuse rather than states to avoid exercising.
 */
export interface DurableStorageStub {
  /** Everything written, by suggested name. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  restore(): void;
}

export function installDurableStorageStub(
  options: {
    /** Reject the save picker the way a dismissed dialog does. */
    readonly dismissSave?: boolean;
    /** Fail the write the way a full destination does. */
    readonly outOfSpace?: boolean;
    /** Flip a byte on the way back out, so verification must catch it. */
    readonly corruptOnRead?: boolean;
    /** What a subsequent open-picker hands back, for the import path. */
    readonly importBytes?: Uint8Array;
  } = {},
): DurableStorageStub {
  const files = new Map<string, Uint8Array>();
  const scope = globalThis as Record<string, unknown>;
  const previousSave = scope["showSaveFilePicker"];
  const previousOpen = scope["showOpenFilePicker"];

  function handleFor(name: string, initial?: Uint8Array) {
    if (initial !== undefined) files.set(name, initial);
    return {
      name,
      async createWritable() {
        const chunks: number[] = [];
        return {
          async write(data: Uint8Array) {
            if (options.outOfSpace === true) {
              const error = new Error("no space left");
              error.name = "QuotaExceededError";
              throw error;
            }
            chunks.push(...data);
          },
          async close() {
            files.set(name, Uint8Array.from(chunks));
          },
          async abort() {},
        };
      },
      async getFile() {
        const stored = files.get(name) ?? new Uint8Array(0);
        const bytes = Uint8Array.from(stored);
        if (options.corruptOnRead === true && bytes.byteLength > 0) {
          bytes.set([(bytes[0] ?? 0) ^ 0xff], 0);
        }
        return {
          size: bytes.byteLength,
          async arrayBuffer() {
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            return copy.buffer;
          },
        };
      },
    };
  }

  scope["showSaveFilePicker"] = async (input?: {
    suggestedName?: string;
  }): Promise<unknown> => {
    if (options.dismissSave === true) {
      const error = new Error("dismissed");
      error.name = "AbortError";
      throw error;
    }
    return handleFor(input?.suggestedName ?? "recovery.zip");
  };

  scope["showOpenFilePicker"] = async (): Promise<readonly unknown[]> => {
    if (options.importBytes === undefined) {
      const error = new Error("dismissed");
      error.name = "AbortError";
      throw error;
    }
    return [handleFor("imported-recovery.zip", options.importBytes)];
  };

  return {
    files,
    restore() {
      if (previousSave === undefined) delete scope["showSaveFilePicker"];
      else scope["showSaveFilePicker"] = previousSave;
      if (previousOpen === undefined) delete scope["showOpenFilePicker"];
      else scope["showOpenFilePicker"] = previousOpen;
    },
  };
}
