import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { validateRecoveryPackage } from "./recovery-package";
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
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function archive(
  input: { readonly targetId?: string; readonly corruptHash?: boolean } = {},
): Promise<Uint8Array> {
  const firmware = new Uint8Array([1, 2, 3, 4]);
  const hash = input.corruptHash === true ? "0".repeat(64) : await sha256(firmware);
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
  });
}

describe("recovery package validation", () => {
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
});
