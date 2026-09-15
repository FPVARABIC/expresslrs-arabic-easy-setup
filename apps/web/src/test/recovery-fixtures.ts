import { strToU8, zipSync } from "fflate";

import type { OfficialTarget } from "../hardware/parity-types";

/**
 * A real recovery archive for a given Target.
 *
 * Tests used to hand the prepared-package fixture a zip containing
 * `{"schemaVersion":1}` and three bytes, which was enough while nothing read
 * it back. The durable export now opens what it wrote, validates it as a
 * complete recovery package and matches it against the selected Target before
 * calling the saved copy verified — so a stand-in archive fails there, which is
 * precisely the property that change was for. Every fixture that exercises the
 * export therefore needs a package that would actually restore a device.
 *
 * The archive is built for one Target: handing a package that names a
 * different Target to the export is a refusal, not a fixture detail.
 */
export function recoveryArchiveFor(
  target: OfficialTarget,
  options: {
    readonly firmware?: Uint8Array;
    readonly releaseLabel?: string;
    readonly releaseRevision?: string;
  } = {},
): Promise<Uint8Array> {
  const firmware = options.firmware ?? new Uint8Array([4, 5, 6, 7, 8, 9, 10]);
  return sha256Hex(firmware).then((digest) =>
    zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          schemaVersion: 1,
          release: {
            label: options.releaseLabel ?? "4.1.0",
            revision: options.releaseRevision ?? "release410",
          },
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
              size: firmware.byteLength,
              sha256: digest,
            },
          ],
        }),
      ),
      "segments/firmware.bin": firmware,
    }),
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
