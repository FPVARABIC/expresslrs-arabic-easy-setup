import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { copyToArrayBuffer } from "./byte-utils";
import {
  DurableRecoveryError,
  exportDurableRecovery,
  openDurableRecovery,
  pickDurableRecovery,
  type DurableDocumentHandle,
  type DurableDocumentStore,
} from "./durable-recovery";
import {
  sealRecoveryVault,
  type RecoveryVaultIdentity,
} from "./recovery-vault";
import {
  fileSystemAccessStore,
  nativeDocumentStore,
  readDurableDocumentStore,
} from "./durable-recovery-stores";
import type { OfficialTarget } from "./parity-types";
import { validateRecoveryPackage } from "./recovery-package";

const target: OfficialTarget = {
  id: "vendor/rx_2400/receiver",
  role: "rx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "rx_2400",
  targetKey: "receiver",
  config: {
    productName: "Receiver",
    platform: "esp8285",
    firmware: "VENDOR_RX",
    luaName: null,
    layoutFile: null,
    logoFile: null,
    uploadMethods: ["uart", "wifi", "download"],
    minVersion: null,
    customLayout: {},
    overlay: null,
    raw: {},
  },
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    copyToArrayBuffer(bytes),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function recoveryArchive(
  overrides: { readonly targetId?: string } = {},
): Promise<Uint8Array> {
  const firmware = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  return zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        schemaVersion: 1,
        release: { label: "4.1.0", revision: "release410" },
        target: {
          id: overrides.targetId ?? target.id,
          role: target.role,
          productName: target.config.productName,
          platform: target.config.platform,
          firmware: target.config.firmware,
        },
        segments: [
          {
            name: "firmware.bin",
            address: 0,
            size: firmware.byteLength,
            sha256: await sha256(firmware),
          },
        ],
      }),
    ),
    "segments/firmware.bin": firmware,
  });
}

/**
 * An in-memory stand-in for a document provider.
 *
 * It is deliberately able to misbehave — refuse, run out of room, truncate,
 * return different bytes than it stored — because every one of those is a state
 * the destructive-write gate has to refuse, and a store that can only succeed
 * would prove none of them.
 */
function fakeStore(
  options: {
    readonly onCreate?: () => never;
    readonly mutateStored?: (bytes: Uint8Array) => Uint8Array;
    readonly failRead?: boolean;
    readonly onPick?: () => never;
    readonly pickBytes?: Uint8Array;
  } = {},
): DurableDocumentStore & {
  readonly writes: number;
  readonly stored: Uint8Array | null;
} {
  let stored: Uint8Array | null = null;
  let writes = 0;
  const store = {
    backend: "FILE_SYSTEM_ACCESS" as const,
    get writes() {
      return writes;
    },
    get stored() {
      return stored;
    },
    async create(input: {
      suggestedName: string;
      mimeType: string;
      bytes: Uint8Array;
    }): Promise<DurableDocumentHandle> {
      options.onCreate?.();
      writes += 1;
      stored = options.mutateStored?.(input.bytes) ?? input.bytes;
      return { location: "fake:1", displayName: input.suggestedName };
    },
    async read(): Promise<Uint8Array> {
      if (options.failRead === true) throw new Error("provider is gone");
      if (options.pickBytes !== undefined) return options.pickBytes;
      if (stored === null) throw new Error("nothing stored");
      return stored;
    },
    async pick(): Promise<DurableDocumentHandle> {
      options.onPick?.();
      return { location: "fake:1", displayName: "recovery.zip" };
    },
  };
  return store;
}

const PASSPHRASE = "recovery-passphrase";

const identity: RecoveryVaultIdentity = {
  schemaVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  target: {
    id: target.id,
    productName: target.config.productName,
    platform: target.config.platform,
    firmware: target.config.firmware,
  },
  release: { label: "4.1.0", revision: "release410" },
  device: { productName: "Receiver", role: "rx", firmwareVersion: "4.1.0" },
};

/** A sealed file, as it would actually exist on the operator's storage. */
async function sealedFile(
  overrides: {
    readonly targetId?: string;
    readonly identity?: RecoveryVaultIdentity;
    readonly passphrase?: string;
  } = {},
): Promise<Uint8Array> {
  return sealRecoveryVault({
    archive: await recoveryArchive(
      overrides.targetId === undefined ? {} : { targetId: overrides.targetId },
    ),
    identity: overrides.identity ?? identity,
    passphrase: overrides.passphrase ?? PASSPHRASE,
    iterations: 100_000,
  });
}

describe("exportDurableRecovery", () => {
  const bytes = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]);

  it("writes, reopens and verifies, and reports where the file is", async () => {
    const store = fakeStore();
    const receipt = await exportDurableRecovery({
      store,
      suggestedName: "target-4.1.0-recovery.elrsrec",
      bytes,
      identity,
      passphrase: PASSPHRASE,
    });
    expect(receipt.location).toBe("fake:1");
    expect(receipt.displayName).toBe("target-4.1.0-recovery.elrsrec");
    // The file on storage is the sealed envelope, so it is longer than the
    // archive and its digest is over the sealed bytes — the ones that are
    // actually there and the ones a later import re-reads.
    expect(receipt.byteLength).toBeGreaterThan(bytes.byteLength);
    expect(receipt.sha256).toBe(await sha256(store.stored ?? new Uint8Array()));
    expect(receipt.backend).toBe("FILE_SYSTEM_ACCESS");
    expect(Date.parse(receipt.verifiedAt)).not.toBeNaN();
  });

  it("never offers the plaintext archive to storage", async () => {
    // The whole point: what reaches the document provider is sealed. If this
    // ever regresses, the operator's Wi-Fi password is in Downloads.
    const store = fakeStore();
    const secret = new TextEncoder().encode("wifi-password=hunter2-hunter2");
    const plaintext = new Uint8Array(256);
    plaintext.set(secret, 32);
    await exportDurableRecovery({
      store,
      suggestedName: "x.elrsrec",
      bytes: plaintext,
      identity,
      passphrase: PASSPHRASE,
    });
    const written = store.stored ?? new Uint8Array();
    expect(Buffer.from(written).includes(Buffer.from(secret))).toBe(false);
  });

  it("refuses a passphrase too short to protect the file", async () => {
    const store = fakeStore();
    await expect(
      exportDurableRecovery({
        store,
        suggestedName: "x.elrsrec",
        bytes,
        identity,
        passphrase: "abc",
      }),
    ).rejects.toMatchObject({ code: "PASSPHRASE_UNUSABLE" });
    // Nothing was written: the refusal happens before storage is touched.
    expect(store.writes).toBe(0);
  });

  it("refuses when the platform has no durable target at all", async () => {
    await expect(
      exportDurableRecovery({
        store: null,
        suggestedName: "x.elrsrec",
        bytes,
        identity,
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({ code: "NO_DURABLE_TARGET" });
  });

  it("reports a dismissed picker as a cancellation, not a failure", async () => {
    const store = fakeStore({
      onCreate: () => {
        throw new DurableRecoveryError("CANCELLED", "operator dismissed it");
      },
    });
    await expect(
      exportDurableRecovery({
        store,
        suggestedName: "x.elrsrec",
        bytes,
        identity,
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("reports a full destination as insufficient storage", async () => {
    const store = fakeStore({
      onCreate: () => {
        throw new DurableRecoveryError("INSUFFICIENT_STORAGE", "no room");
      },
    });
    await expect(
      exportDurableRecovery({
        store,
        suggestedName: "x.elrsrec",
        bytes,
        identity,
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STORAGE" });
  });

  it("refuses a file it cannot reopen, even though the write reported success", async () => {
    const store = fakeStore({ failRead: true });
    await expect(
      exportDurableRecovery({
        store,
        suggestedName: "x.elrsrec",
        bytes,
        identity,
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({ code: "REOPEN_FAILED" });
    // The write did happen. That is exactly why an unverifiable write must not
    // be allowed to satisfy the gate.
    expect(store.writes).toBe(1);
  });

  it("refuses a short file", async () => {
    const store = fakeStore({
      mutateStored: (written) => written.subarray(0, written.byteLength - 1),
    });
    await expect(
      exportDurableRecovery({
        store,
        suggestedName: "x.elrsrec",
        bytes,
        identity,
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({ code: "TRUNCATED" });
  });

  it("refuses a file of the right length whose bytes changed", async () => {
    const store = fakeStore({
      mutateStored: (written) => {
        const altered = Uint8Array.from(written);
        altered[0] = (altered[0] ?? 0) ^ 0xff;
        return altered;
      },
    });
    await expect(
      exportDurableRecovery({
        store,
        suggestedName: "x.elrsrec",
        bytes,
        identity,
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({ code: "HASH_MISMATCH" });
  });
});

describe("picking and opening a saved recovery file", () => {
  it("identifies a file after a reinstall, with no application state and no passphrase", async () => {
    // This is the reinstall path: nothing here reads a journal, a preference
    // or any other application state.
    const sealed = await sealedFile();
    const store = fakeStore({ pickBytes: sealed });
    const picked = await pickDurableRecovery({ store });
    expect(picked.header.identity.target.id).toBe(target.id);
    expect(picked.header.identity.device.role).toBe("rx");
    expect(picked.receipt.sha256).toBe(await sha256(sealed));
    expect(picked.receipt.byteLength).toBe(sealed.byteLength);
  });

  it("opens the identified file and validates the archive inside it", async () => {
    const store = fakeStore({ pickBytes: await sealedFile() });
    const picked = await pickDurableRecovery({ store });
    const imported = await openDurableRecovery({
      picked,
      passphrase: PASSPHRASE,
      expectedTarget: target,
    });
    expect(imported.recoveryPackage.targetId).toBe(target.id);
    expect(imported.recoveryPackage.segments).toHaveLength(1);
  });

  it("refuses the wrong passphrase and yields nothing", async () => {
    const store = fakeStore({ pickBytes: await sealedFile() });
    const picked = await pickDurableRecovery({ store });
    await expect(
      openDurableRecovery({
        picked,
        passphrase: "not-the-passphrase",
        expectedTarget: target,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("refuses a one-byte edit to the sealed file", async () => {
    const sealed = await sealedFile();
    const tampered = Uint8Array.from(sealed);
    tampered[tampered.byteLength - 3] ^= 0x01;
    const store = fakeStore({ pickBytes: tampered });
    const picked = await pickDurableRecovery({ store });
    await expect(
      openDurableRecovery({
        picked,
        passphrase: PASSPHRASE,
        expectedTarget: target,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("refuses a perfectly valid archive whose hashes all recompute", async () => {
    // The point a hash cannot make. This archive is *internally consistent*:
    // its manifest's per-segment SHA-256 matches its contents exactly, so
    // `validateRecoveryPackage` accepts it without complaint — proven below,
    // so the test cannot be passing for the wrong reason. Anyone who edits a
    // recovery archive recomputes those hashes too; that is arithmetic, not a
    // barrier. What makes the file trustworthy is a tag keyed by a secret the
    // file does not contain, and this archive has none.
    const archive = await recoveryArchive();
    await expect(
      validateRecoveryPackage({ bytes: archive, expectedTarget: target }),
    ).resolves.toMatchObject({ targetId: target.id });

    const store = fakeStore({ pickBytes: archive });
    await expect(pickDurableRecovery({ store })).rejects.toMatchObject({
      code: "NOT_A_RECOVERY_FILE",
    });
  });

  it("refuses a plaintext archive from before the format existed", async () => {
    // A bare zip is no longer accepted: it carries no authentication at all,
    // and accepting one would reopen exactly the hole this closes.
    const store = fakeStore({ pickBytes: await recoveryArchive() });
    await expect(pickDurableRecovery({ store })).rejects.toMatchObject({
      code: "NOT_A_RECOVERY_FILE",
    });
  });

  it("refuses a truncated file at the header, before any key derivation", async () => {
    const sealed = await sealedFile();
    const store = fakeStore({
      pickBytes: sealed.subarray(0, sealed.byteLength - 4),
    });
    await expect(pickDurableRecovery({ store })).rejects.toMatchObject({
      code: "PACKAGE_INVALID",
    });
  });

  it("refuses appended trailing data", async () => {
    const sealed = await sealedFile();
    const padded = new Uint8Array(sealed.byteLength + 16);
    padded.set(sealed, 0);
    const store = fakeStore({ pickBytes: padded });
    await expect(pickDurableRecovery({ store })).rejects.toMatchObject({
      code: "PACKAGE_INVALID",
    });
  });

  it("refuses a package belonging to a different Target", async () => {
    // Authenticates correctly and is still the wrong package: the Target
    // check is inside the archive, not in the header an attacker can see.
    const store = fakeStore({
      pickBytes: await sealedFile({ targetId: "vendor/other/target" }),
    });
    const picked = await pickDurableRecovery({ store });
    await expect(
      openDurableRecovery({
        picked,
        passphrase: PASSPHRASE,
        expectedTarget: target,
      }),
    ).rejects.toMatchObject({ code: "PACKAGE_INVALID" });
  });

  it("surfaces a device identity that does not match, without refusing it itself", async () => {
    // A package saved from a *different unit of the same model* is
    // indistinguishable to every automated check — same Target, same release,
    // valid signature. So this layer does not pretend to catch it: it reports
    // the recorded device identity, and the controller requires the operator
    // to confirm it before a restore may run.
    const store = fakeStore({
      pickBytes: await sealedFile({
        identity: {
          ...identity,
          device: {
            productName: "Receiver",
            role: "rx",
            firmwareVersion: "3.5.0",
          },
        },
      }),
    });
    const picked = await pickDurableRecovery({ store });
    expect(picked.header.identity.device.firmwareVersion).toBe("3.5.0");
    const imported = await openDurableRecovery({
      picked,
      passphrase: PASSPHRASE,
      expectedTarget: target,
    });
    expect(imported.recoveryPackage.targetId).toBe(target.id);
  });

  it("reports a dismissed open picker as a cancellation", async () => {
    const store = fakeStore({
      onPick: () => {
        throw new DurableRecoveryError("CANCELLED", "dismissed");
      },
    });
    await expect(pickDurableRecovery({ store })).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });

  it("refuses when there is nothing to open a file with", async () => {
    await expect(pickDurableRecovery({ store: null })).rejects.toMatchObject({
      code: "NO_DURABLE_TARGET",
    });
  });
});

describe("nativeDocumentStore", () => {
  function api(overrides: Partial<Record<string, unknown>> = {}) {
    const written: number[] = [];
    let committed = false;
    const base = {
      create: vi.fn(async () => ({
        location: "content://tree/1",
        displayName: "recovery.zip",
      })),
      write: vi.fn(
        async (input: { bytes: readonly number[]; offset: number }) => {
          expect(input.offset).toBe(written.length);
          written.push(...input.bytes);
          return { offset: written.length };
        },
      ),
      commit: vi.fn(async () => {
        committed = true;
        return {
          location: "content://tree/1",
          displayName: "recovery.zip",
          byteLength: written.length,
        };
      }),
      read: vi.fn(async (input: { offset: number; maxBytes: number }) => {
        const slice = written.slice(
          input.offset,
          input.offset + input.maxBytes,
        );
        return {
          bytes: slice,
          length: slice.length,
          eof: input.offset + slice.length >= written.length,
        };
      }),
      pick: vi.fn(async () => ({
        location: "content://tree/1",
        displayName: "recovery.zip",
      })),
    };
    return {
      api: Object.assign(base, overrides) as never,
      written,
      get committed() {
        return committed;
      },
    };
  }

  it("streams a package larger than one chunk in order, then commits", async () => {
    // Three chunks and a remainder, so ordering and the final short chunk are
    // both exercised rather than assumed.
    const bytes = new Uint8Array(64 * 1024 * 3 + 17);
    for (let index = 0; index < bytes.byteLength; index += 1) {
      bytes[index] = index % 251;
    }
    const harness = api();
    const store = nativeDocumentStore(harness.api);
    const handle = await store.create({
      suggestedName: "recovery.zip",
      mimeType: "application/zip",
      bytes,
    });
    expect(handle.location).toBe("content://tree/1");
    expect(harness.committed).toBe(true);
    expect(Uint8Array.from(harness.written)).toStrictEqual(bytes);

    const readBack = await store.read(handle.location);
    expect(readBack).toStrictEqual(bytes);
  });

  it("refuses a commit that stored fewer bytes than were written", async () => {
    const harness = api({
      commit: vi.fn(async () => ({
        location: "content://tree/1",
        displayName: "recovery.zip",
        byteLength: 1,
      })),
    });
    await expect(
      nativeDocumentStore(harness.api).create({
        suggestedName: "recovery.zip",
        mimeType: "application/zip",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toMatchObject({ code: "TRUNCATED" });
  });

  it("maps the host's own refusal names onto reasons the operator is shown", async () => {
    const cases: readonly (readonly [string, string])[] = [
      ["CANCELLED", "CANCELLED"],
      ["PICKER_CANCELLED", "CANCELLED"],
      ["NO_SPACE", "INSUFFICIENT_STORAGE"],
      ["DOCUMENT_NOT_FOUND", "REOPEN_FAILED"],
      ["READ_FAILED", "REOPEN_FAILED"],
      ["SOMETHING_NEW", "WRITE_FAILED"],
    ];
    for (const [bridgeReason, expected] of cases) {
      const harness = api({
        create: vi.fn(async () => {
          const error = new Error("refused");
          (error as { bridgeReason?: string }).bridgeReason = bridgeReason;
          throw error;
        }),
      });
      await expect(
        nativeDocumentStore(harness.api).create({
          suggestedName: "recovery.zip",
          mimeType: "application/zip",
          bytes: new Uint8Array([1]),
        }),
      ).rejects.toMatchObject({ code: expected });
    }
  });

  it("refuses a chunk whose declared length disagrees with its bytes", async () => {
    const harness = api({
      read: vi.fn(async () => ({ bytes: [1, 2], length: 9, eof: false })),
    });
    await expect(
      nativeDocumentStore(harness.api).read("content://tree/1"),
    ).rejects.toMatchObject({ code: "REOPEN_FAILED" });
  });

  it("stops at an empty chunk rather than spinning on a provider that never ends", async () => {
    const harness = api({
      read: vi.fn(async () => ({ bytes: [], length: 0, eof: false })),
    });
    await expect(
      nativeDocumentStore(harness.api).read("content://tree/1"),
    ).resolves.toStrictEqual(new Uint8Array(0));
  });
});

describe("fileSystemAccessStore", () => {
  function handle(name: string) {
    const chunks: number[] = [];
    let closed = false;
    let aborted = false;
    return {
      name,
      get closed() {
        return closed;
      },
      get aborted() {
        return aborted;
      },
      async createWritable() {
        return {
          async write(data: Uint8Array) {
            chunks.push(...data);
          },
          async close() {
            closed = true;
          },
          async abort() {
            aborted = true;
          },
        };
      },
      async getFile() {
        const bytes = Uint8Array.from(chunks);
        return {
          size: bytes.byteLength,
          async arrayBuffer() {
            return copyToArrayBuffer(bytes);
          },
        };
      },
    };
  }

  it("writes through a handle and reads back through the same handle", async () => {
    const file = handle("recovery.zip");
    const store = fileSystemAccessStore({
      showSaveFilePicker: async () => file,
    });
    const bytes = new Uint8Array([4, 5, 6]);
    const saved = await store.create({
      suggestedName: "recovery.zip",
      mimeType: "application/zip",
      bytes,
    });
    expect(file.closed).toBe(true);
    expect(await store.read(saved.location)).toStrictEqual(bytes);
  });

  it("aborts a partial write rather than leaving half a recovery file behind", async () => {
    const file = {
      ...handle("recovery.zip"),
      async createWritable() {
        return {
          async write() {
            throw new Error("disk error");
          },
          async close() {},
          abort: vi.fn(async () => {}),
        };
      },
    };
    const store = fileSystemAccessStore({
      showSaveFilePicker: async () => file,
    });
    await expect(
      store.create({
        suggestedName: "recovery.zip",
        mimeType: "application/zip",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });
  });

  it("reports a quota failure as insufficient storage", async () => {
    const store = fileSystemAccessStore({
      showSaveFilePicker: async () => ({
        ...handle("recovery.zip"),
        async createWritable() {
          const error = new Error("full");
          error.name = "QuotaExceededError";
          throw error;
        },
      }),
    });
    await expect(
      store.create({
        suggestedName: "recovery.zip",
        mimeType: "application/zip",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STORAGE" });
  });

  it("reports a dismissed picker as a cancellation", async () => {
    const store = fileSystemAccessStore({
      showSaveFilePicker: async () => {
        const error = new Error("dismissed");
        error.name = "AbortError";
        throw error;
      },
    });
    await expect(
      store.create({
        suggestedName: "recovery.zip",
        mimeType: "application/zip",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("will not read a location it never handed out", async () => {
    const store = fileSystemAccessStore({
      showSaveFilePicker: async () => handle("recovery.zip"),
    });
    await expect(store.read("filesystem:0:elsewhere")).rejects.toMatchObject({
      code: "REOPEN_FAILED",
    });
  });
});

describe("readDurableDocumentStore", () => {
  const documents = {
    create: () => {},
    write: () => {},
    commit: () => {},
    read: () => {},
    pick: () => {},
  };

  it("prefers the native document bridge, which is the only durable target in a WebView", () => {
    const store = readDurableDocumentStore({
      elrsNativeBridge: {
        version: 1,
        serial: { requestPort: () => {} },
        documents,
      },
      showSaveFilePicker: () => {},
    });
    expect(store?.backend).toBe("ANDROID_SAF");
  });

  it("falls back to File System Access in a browser", () => {
    const store = readDurableDocumentStore({ showSaveFilePicker: () => {} });
    expect(store?.backend).toBe("FILE_SYSTEM_ACCESS");
  });

  it("ignores a bridge whose document API is incomplete rather than half-trusting it", () => {
    expect(
      readDurableDocumentStore({
        elrsNativeBridge: {
          version: 1,
          serial: { requestPort: () => {} },
          documents: { create: () => {}, read: () => {} },
        },
      }),
    ).toBeNull();
  });

  it("returns null where neither exists, so the caller must name a reason", () => {
    expect(readDurableDocumentStore({})).toBeNull();
  });
});
