import { gunzipSync, strFromU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { prepareOfficialFirmwarePackage } from "./firmware-package";
import type {
  ExpressLrsFirmwareOptions,
  OfficialRelease,
  OfficialTarget,
} from "./parity-types";

function espImage(): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes[0] = 0xe9;
  bytes[1] = 1;
  const view = new DataView(bytes.buffer);
  view.setUint32(24, 0x3f40_0000, true);
  view.setUint32(28, 4, true);
  bytes.set([1, 2, 3, 4], 32);
  bytes[36] = 0xef;
  return bytes;
}

const release: OfficialRelease = {
  label: "4.1.0",
  revision: "release410",
  channel: "release",
};

const target: OfficialTarget = {
  id: "vendor/tx_2400/example",
  role: "tx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "tx_2400",
  targetKey: "example",
  config: {
    productName: "Example ExpressLRS TX",
    platform: "esp32",
    firmware: "EXAMPLE_TX_2400",
    luaName: "example.lua",
    layoutFile: "example.json",
    logoFile: null,
    uploadMethods: ["uart", "edgetx", "wifi", "download"],
    minVersion: null,
    customLayout: null,
    overlay: { fan_en: true },
    raw: {},
  },
};

const options: ExpressLrsFirmwareOptions = {
  region: "FCC",
  domain: 0,
  bindPhrase: "FPV Arabic",
  wifiSsid: "",
  wifiPassword: "",
  wifiAutoOnInterval: 60,
  fanRuntime: 30,
  telemetryInterval: 240,
  uartInverted: false,
  unlockHigherPower: false,
  receiverUartBaud: 420000,
  receiverInvertTx: false,
  lockOnFirstConnection: true,
  r9mmMiniSbus: false,
  receiverAsTransmitter: false,
};

function archives(): {
  readonly firmware: Uint8Array;
  readonly hardware: Uint8Array;
} {
  return {
    firmware: zipSync({
      "firmware/FCC/EXAMPLE_TX_2400/bootloader.bin": new Uint8Array([0xb0]),
      "firmware/FCC/EXAMPLE_TX_2400/partitions.bin": new Uint8Array([0xb1]),
      "firmware/FCC/EXAMPLE_TX_2400/boot_app0.bin": new Uint8Array([0xb2]),
      "firmware/FCC/EXAMPLE_TX_2400/firmware.bin": espImage(),
      "firmware/FCC/OTHER/firmware.bin": new Uint8Array([0xff]),
    }),
    hardware: zipSync({
      "hardware/TX/example.json": new TextEncoder().encode(
        JSON.stringify({ serial_rx: 1 }),
      ),
    }),
  };
}

describe("official firmware package preparation", () => {
  it("extracts only the selected target, appends configuration, hashes segments, and emits recovery", async () => {
    const files = archives();
    const fetchImplementation = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          String(url).endsWith("hardware.zip")
            ? files.hardware
            : files.firmware,
        ),
    ) as unknown as typeof fetch;

    const prepared = await prepareOfficialFirmwarePackage({
      release,
      target,
      options,
      fetchImplementation,
    });

    expect(
      prepared.segments.map((segment) => [segment.name, segment.address]),
    ).toEqual([
      ["bootloader.bin", 0x1000],
      ["partitions.bin", 0x8000],
      ["boot_app0.bin", 0xe000],
      ["firmware.bin", 0x10000],
    ]);
    expect(
      prepared.segments.every((segment) => segment.sha256.length === 64),
    ).toBe(true);
    const application = prepared.segments.at(-1)?.bytes;
    expect(application).toBeDefined();
    expect(new TextDecoder().decode(application?.slice(48, 80))).toContain(
      "Example ExpressLRS TX",
    );
    expect(prepared.primaryFileName).toBe("example-4.1.0.zip");

    const recovery = unzipSync(prepared.recoveryArchive);
    const manifest = JSON.parse(
      strFromU8(recovery["manifest.json"] ?? new Uint8Array()),
    ) as { target: { id: string }; segments: readonly unknown[] };
    expect(manifest.target.id).toBe(target.id);
    expect(manifest.segments).toHaveLength(4);
    expect(recovery["segments/firmware.bin"]).toEqual(application);
  });

  it("creates a gzip Wi-Fi image for ESP8285 without changing the serial segment bytes", async () => {
    const firmware = zipSync({
      "firmware/FCC/EXAMPLE_RX_2400/firmware.bin": espImage(),
    });
    const fetchImplementation = vi.fn(
      async () => new Response(firmware),
    ) as unknown as typeof fetch;
    const rxTarget: OfficialTarget = {
      ...target,
      id: "vendor/rx_2400/example-rx",
      role: "rx",
      radioKey: "rx_2400",
      targetKey: "example-rx",
      config: {
        ...target.config,
        productName: "Example RX",
        platform: "esp8285",
        firmware: "EXAMPLE_RX_2400",
        layoutFile: null,
        customLayout: {},
      },
    };

    const prepared = await prepareOfficialFirmwarePackage({
      release,
      target: rxTarget,
      options,
      fetchImplementation,
    });

    expect(prepared.segments).toHaveLength(1);
    expect(prepared.primaryFileName).toBe("example-rx-4.1.0.bin.gz");
    expect(gunzipSync(prepared.primaryDownload)).toEqual(
      prepared.segments[0]?.bytes,
    );
  });

  it("fails closed when the selected region/target path is not present", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          zipSync({
            "firmware/EU/OTHER/firmware.bin": espImage(),
          }),
        ),
    ) as unknown as typeof fetch;

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: { ...target, config: { ...target.config, layoutFile: null } },
        options,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "REGION_NOT_FOUND" });
  });
});
