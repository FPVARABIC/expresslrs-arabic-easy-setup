import type { FirmwareArtifactDigestProvider } from "@elrs-easy/domain";
import { describe, expect, it, vi } from "vitest";

import {
  snapshotFirmwareArtifactBytes,
  verifyFirmwareArtifactBytes,
} from "./firmware-artifact-bytes.js";

const expectedSha256 = "a".repeat(64);

function digestProvider(
  digest = expectedSha256,
): FirmwareArtifactDigestProvider {
  return Object.freeze({
    assurance: "CRYPTOGRAPHIC",
    async digestSha256() {
      return digest;
    },
  });
}

describe("Firmware artifact byte boundary", () => {
  it("copies bytes before observers and supplies fresh verified copies", async () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const snapshot = snapshotFirmwareArtifactBytes(source);
    source.fill(9);
    const provider: FirmwareArtifactDigestProvider = Object.freeze({
      assurance: "CRYPTOGRAPHIC",
      async digestSha256(bytes: Uint8Array) {
        expect([...bytes]).toEqual([1, 2, 3, 4]);
        bytes.fill(8);
        return expectedSha256;
      },
    });

    const result = await verifyFirmwareArtifactBytes({
      snapshot,
      expectedByteLength: 4,
      expectedSha256,
      digestProvider: provider,
    });

    expect(result.status).toBe("VERIFIED");
    if (result.status !== "VERIFIED") {
      return;
    }
    expect(result.verification).toEqual({
      status: "VERIFIED",
      algorithm: "SHA-256",
      assurance: "CRYPTOGRAPHIC",
      byteLength: 4,
      sha256: expectedSha256,
    });
    const first = result.copyBytes();
    first.fill(7);
    expect([...result.copyBytes()]).toEqual([1, 2, 3, 4]);
  });

  it("rejects non-exact and empty byte views", () => {
    expect(snapshotFirmwareArtifactBytes(new Uint8Array())).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_BYTES_INVALID",
    });
    expect(snapshotFirmwareArtifactBytes(new Uint16Array([1]))).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_BYTES_INVALID",
    });
    expect(snapshotFirmwareArtifactBytes({ 0: 1, length: 1 })).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_BYTES_INVALID",
    });
  });

  it("checks declared size before invoking the digest provider", async () => {
    const digest = vi.fn(async () => expectedSha256);
    const provider: FirmwareArtifactDigestProvider = {
      assurance: "CRYPTOGRAPHIC",
      digestSha256: digest,
    };

    await expect(
      verifyFirmwareArtifactBytes({
        snapshot: snapshotFirmwareArtifactBytes(new Uint8Array([1, 2])),
        expectedByteLength: 3,
        expectedSha256,
        digestProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_SIZE_MISMATCH",
    });
    expect(digest).not.toHaveBeenCalled();
  });

  it.each([
    ["not-canonical", "FIRMWARE_ARTIFACT_DIGEST_INVALID"],
    ["b".repeat(64), "FIRMWARE_ARTIFACT_DIGEST_MISMATCH"],
  ] as const)("blocks digest result %s", async (digest, reason) => {
    await expect(
      verifyFirmwareArtifactBytes({
        snapshot: snapshotFirmwareArtifactBytes(new Uint8Array([1])),
        expectedByteLength: 1,
        expectedSha256,
        digestProvider: digestProvider(digest),
      }),
    ).resolves.toEqual({ status: "BLOCKED", reason });
  });

  it("does not execute accessor-backed assurance metadata", async () => {
    let getterCalls = 0;
    const provider = Object.defineProperty(
      {
        async digestSha256() {
          return expectedSha256;
        },
      },
      "assurance",
      {
        get() {
          getterCalls += 1;
          return "CRYPTOGRAPHIC";
        },
      },
    ) as unknown as FirmwareArtifactDigestProvider;

    await expect(
      verifyFirmwareArtifactBytes({
        snapshot: snapshotFirmwareArtifactBytes(new Uint8Array([1])),
        expectedByteLength: 1,
        expectedSha256,
        digestProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_PROVIDER_INVALID",
    });
    expect(getterCalls).toBe(0);
  });

  it("does not execute an accessor-backed digest method", async () => {
    let getterCalls = 0;
    const provider = Object.defineProperty(
      { assurance: "CRYPTOGRAPHIC" },
      "digestSha256",
      {
        get() {
          getterCalls += 1;
          return async () => expectedSha256;
        },
      },
    ) as FirmwareArtifactDigestProvider;

    await expect(
      verifyFirmwareArtifactBytes({
        snapshot: snapshotFirmwareArtifactBytes(new Uint8Array([1])),
        expectedByteLength: 1,
        expectedSha256,
        digestProvider: provider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_PROVIDER_INVALID",
    });
    expect(getterCalls).toBe(0);
  });

  it("sanitizes digest failures but preserves cancellation", async () => {
    const failed: FirmwareArtifactDigestProvider = {
      assurance: "CRYPTOGRAPHIC",
      async digestSha256() {
        throw new Error("private-path-or-provider-detail");
      },
    };
    const cancelled: FirmwareArtifactDigestProvider = {
      assurance: "CRYPTOGRAPHIC",
      async digestSha256() {
        const error = new Error("cancelled");
        error.name = "AbortError";
        throw error;
      },
    };
    const snapshot = snapshotFirmwareArtifactBytes(new Uint8Array([1]));

    await expect(
      verifyFirmwareArtifactBytes({
        snapshot,
        expectedByteLength: 1,
        expectedSha256,
        digestProvider: failed,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_FAILED",
    });
    await expect(
      verifyFirmwareArtifactBytes({
        snapshot,
        expectedByteLength: 1,
        expectedSha256,
        digestProvider: cancelled,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
