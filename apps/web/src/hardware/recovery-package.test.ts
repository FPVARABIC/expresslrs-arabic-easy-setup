import { strToU8, Zip, ZipPassThrough, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyToArrayBuffer } from "./byte-utils";
import {
  loadRecoveryCheckpoint,
  validateRecoveryPackage,
} from "./recovery-package";
import type { OfficialTarget } from "./parity-types";

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

async function archive(
  input: {
    readonly targetId?: string;
    readonly corruptHash?: boolean;
    readonly extraEntries?: Readonly<Record<string, Uint8Array>>;
  } = {},
): Promise<Uint8Array> {
  const firmware = new Uint8Array([1, 2, 3, 4]);
  const hash =
    input.corruptHash === true ? "0".repeat(64) : await sha256(firmware);
  return zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        schemaVersion: 1,
        release: { label: "4.1.0", revision: "release410" },
        target: {
          id: input.targetId ?? target.id,
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
            sha256: hash,
          },
        ],
      }),
    ),
    "segments/firmware.bin": firmware,
    ...input.extraEntries,
  });
}

function archiveWithDuplicateEntries(
  entries: ReadonlyArray<readonly [string, Uint8Array]>,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error !== null) {
      failure = error;
      return;
    }
    chunks.push(chunk);
  });
  for (const [name, bytes] of entries) {
    const file = new ZipPassThrough(name);
    zip.add(file);
    file.push(bytes, true);
  }
  zip.end();
  if (failure !== null) throw failure;
  const output = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function rewriteDeclaredUncompressedSize(
  input: Uint8Array,
  entryName: string,
  size: number,
): Uint8Array {
  const output = input.slice();
  const view = new DataView(
    output.buffer,
    output.byteOffset,
    output.byteLength,
  );
  const decoder = new TextDecoder();
  let rewrittenHeaders = 0;
  for (let offset = 0; offset + 46 <= output.byteLength; offset += 1) {
    const signature = view.getUint32(offset, true);
    const isLocal = signature === 0x04034b50;
    const isCentral = signature === 0x02014b50;
    if (!isLocal && !isCentral) continue;
    const nameLengthOffset = offset + (isLocal ? 26 : 28);
    const nameOffset = offset + (isLocal ? 30 : 46);
    const nameLength = view.getUint16(nameLengthOffset, true);
    if (nameOffset + nameLength > output.byteLength) continue;
    const name = decoder.decode(
      output.subarray(nameOffset, nameOffset + nameLength),
    );
    if (name !== entryName) continue;
    view.setUint32(offset + (isLocal ? 22 : 24), size, true);
    rewrittenHeaders += 1;
  }
  if (rewrittenHeaders !== 2) {
    throw new Error(`Could not rewrite both ZIP headers for ${entryName}`);
  }
  return output;
}

const absentRecoveryJournal = Symbol("absent recovery journal");

function stubRecoveryJournalValue(
  value: unknown,
  transactionOutcome:
    "complete" | "abort" | "error" | "request-error" = "complete",
): void {
  const transaction: {
    objectStore: () => {
      getAll: () => {
        result?: unknown[];
        onerror?: () => void;
        onsuccess?: () => void;
      };
    };
    onabort?: () => void;
    oncomplete?: () => void;
    onerror?: () => void;
  } = {
    objectStore: () => ({
      getAll: () => {
        const request: {
          result?: unknown[];
          onerror?: () => void;
          onsuccess?: () => void;
        } = {};
        queueMicrotask(() => {
          if (transactionOutcome === "request-error") {
            request.onerror?.();
            return;
          }
          request.result = value === absentRecoveryJournal ? [] : [value];
          request.onsuccess?.();
          if (transactionOutcome === "complete") {
            transaction.oncomplete?.();
          } else if (transactionOutcome === "abort") {
            transaction.onabort?.();
          } else {
            transaction.onerror?.();
          }
        });
        return request;
      },
    }),
  };
  const database = {
    transaction: () => transaction,
    close: vi.fn(),
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request: {
        result?: typeof database;
        onsuccess?: () => void;
      } = {};
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    },
  });
}

describe("recovery package validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts the exact target and verifies every segment hash", async () => {
    const result = await validateRecoveryPackage({
      bytes: await archive(),
      expectedTarget: target,
    });

    expect(result.targetId).toBe(target.id);
    expect(result.segments).toEqual([
      expect.objectContaining({
        name: "firmware.bin",
        address: 0,
        bytes: new Uint8Array([1, 2, 3, 4]),
      }),
    ]);
    expect(result.packageSha256).toHaveLength(64);
  });

  it("rejects a package for another target before returning flash bytes", async () => {
    await expect(
      validateRecoveryPackage({
        bytes: await archive({ targetId: "other/rx/target" }),
        expectedTarget: target,
      }),
    ).rejects.toMatchObject({ code: "TARGET_MISMATCH" });
  });

  it("rejects a corrupted firmware segment", async () => {
    await expect(
      validateRecoveryPackage({
        bytes: await archive({ corruptHash: true }),
        expectedTarget: target,
      }),
    ).rejects.toMatchObject({ code: "HASH_MISMATCH" });
  });

  it("rejects a highly compressed segment before expanding past 16 MiB", async () => {
    const expanded = new Uint8Array(16 * 1024 * 1024 + 1);
    const bytes = zipSync(
      {
        "manifest.json": strToU8("{}"),
        "segments/bomb.bin": expanded,
      },
      { level: 9 },
    );

    expect(bytes.byteLength).toBeLessThan(expanded.byteLength);
    await expect(
      validateRecoveryPackage({ bytes, expectedTarget: target }),
    ).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
  });

  it("rejects a DEFLATE stream that expands beyond forged bounded headers", async () => {
    const admittedFirmware = new Uint8Array([1, 2, 3]);
    const actualFirmware = new Uint8Array([1, 2, 3, 4]);
    const bytes = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          schemaVersion: 1,
          release: { label: "4.1.0", revision: "release410" },
          target: {
            id: target.id,
            role: target.role,
            productName: target.config.productName,
            platform: target.config.platform,
            firmware: target.config.firmware,
          },
          segments: [
            {
              name: "firmware.bin",
              address: 0,
              size: admittedFirmware.byteLength,
              sha256: await sha256(admittedFirmware),
            },
          ],
        }),
      ),
      "segments/firmware.bin": actualFirmware,
    });
    const forged = rewriteDeclaredUncompressedSize(
      bytes,
      "segments/firmware.bin",
      admittedFirmware.byteLength,
    );

    await expect(
      validateRecoveryPackage({ bytes: forged, expectedTarget: target }),
    ).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
  });

  it("rejects cumulative admitted expansion beyond 64 MiB", async () => {
    const expandedSegment = new Uint8Array(16 * 1024 * 1024);
    const bytes = zipSync(
      {
        "manifest.json": strToU8("{}"),
        "segments/one.bin": expandedSegment,
        "segments/two.bin": expandedSegment,
        "segments/three.bin": expandedSegment,
        "segments/four.bin": expandedSegment,
      },
      { level: 9 },
    );

    await expect(
      validateRecoveryPackage({ bytes, expectedTarget: target }),
    ).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
  });

  it("rejects more than eight admitted segment entries", async () => {
    const segmentEntries = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `segments/segment-${index}.bin`,
        new Uint8Array([index]),
      ]),
    );
    const bytes = zipSync({
      "manifest.json": strToU8("{}"),
      ...segmentEntries,
    });

    await expect(
      validateRecoveryPackage({ bytes, expectedTarget: target }),
    ).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
  });

  it("rejects an oversized manifest before decompressing it", async () => {
    const bytes = zipSync(
      {
        "manifest.json": new Uint8Array(128 * 1024 + 1),
        "segments/firmware.bin": new Uint8Array([1]),
      },
      { level: 9 },
    );

    await expect(
      validateRecoveryPackage({ bytes, expectedTarget: target }),
    ).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
  });

  it("rejects hostile and case-ambiguous archive entry names", async () => {
    const archives = [
      zipSync({
        "manifest.json": strToU8("{}"),
        "../escape.bin": new Uint8Array([1]),
      }),
      zipSync({
        "manifest.json": strToU8("{}"),
        "segments/firmware.bin": new Uint8Array([1]),
        "segments/FIRMWARE.bin": new Uint8Array([2]),
      }),
      archiveWithDuplicateEntries([
        ["manifest.json", strToU8("{}")],
        ["manifest.json", strToU8("{}")],
      ]),
    ];

    for (const bytes of archives) {
      await expect(
        validateRecoveryPackage({ bytes, expectedTarget: target }),
      ).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
    }
  });

  it("rejects an admitted segment omitted from the manifest", async () => {
    await expect(
      validateRecoveryPackage({
        bytes: await archive({
          extraEntries: {
            "segments/unreferenced.bin": new Uint8Array([9]),
          },
        }),
        expectedTarget: target,
      }),
    ).rejects.toMatchObject({ code: "INVALID_MANIFEST" });
  });

  it("treats only an absent recovery journal key as no checkpoint", async () => {
    stubRecoveryJournalValue(absentRecoveryJournal);

    await expect(loadRecoveryCheckpoint()).resolves.toBeNull();
  });

  it.each([
    undefined,
    null,
    "not-an-object",
    { schemaVersion: 2 },
    { schemaVersion: 1, targetId: "partial" },
  ])("fails closed for malformed stored checkpoint %#", async (value) => {
    stubRecoveryJournalValue(value);

    await expect(loadRecoveryCheckpoint()).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });

  it("does not expose a successful request before its transaction commits", async () => {
    let requestSucceeded = false;
    let promiseSettled = false;
    const close = vi.fn();
    const transaction: {
      objectStore: () => {
        getAll: () => {
          result?: unknown[];
          onerror?: () => void;
          onsuccess?: () => void;
        };
      };
      onabort?: () => void;
      oncomplete?: () => void;
      onerror?: () => void;
    } = {
      objectStore: () => ({
        getAll: () => {
          const request: {
            result?: unknown[];
            onerror?: () => void;
            onsuccess?: () => void;
          } = {};
          queueMicrotask(() => {
            request.result = [];
            request.onsuccess?.();
            requestSucceeded = true;
          });
          return request;
        },
      }),
    };
    const database = { transaction: () => transaction, close };
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request: {
          result?: typeof database;
          onsuccess?: () => void;
        } = {};
        queueMicrotask(() => {
          request.result = database;
          request.onsuccess?.();
        });
        return request;
      },
    });

    const loading = loadRecoveryCheckpoint().finally(() => {
      promiseSettled = true;
    });
    await vi.waitFor(() => expect(requestSucceeded).toBe(true));
    expect(promiseSettled).toBe(false);
    expect(close).not.toHaveBeenCalled();

    transaction.oncomplete?.();
    await expect(loading).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(["abort", "error"] as const)(
    "rejects when a successful journal request's transaction ends with %s",
    async (outcome) => {
      stubRecoveryJournalValue(absentRecoveryJournal, outcome);

      await expect(loadRecoveryCheckpoint()).rejects.toMatchObject({
        code: "STORAGE_UNAVAILABLE",
      });
    },
  );

  it("rejects a journal request error", async () => {
    stubRecoveryJournalValue(absentRecoveryJournal, "request-error");

    await expect(loadRecoveryCheckpoint()).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });
});
