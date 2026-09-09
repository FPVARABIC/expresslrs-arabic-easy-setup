import { gunzipSync, strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { copyToArrayBuffer } from "./byte-utils";
import { md5Bytes } from "./bind-phrase";
import { prepareOfficialFirmwarePackage } from "./firmware-package";
import { loadOfficialExpressLrsCatalog } from "./official-catalog";
import type {
  ExpressLrsFirmwareOptions,
  OfficialRelease,
  OfficialTarget,
} from "./parity-types";

function espImage(chipId = 0): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes[0] = 0xe9;
  bytes[1] = 1;
  const view = new DataView(bytes.buffer);
  view.setUint16(12, chipId, true);
  view.setUint32(24, 0x3f40_0000, true);
  view.setUint32(28, 4, true);
  bytes.set([1, 2, 3, 4], 32);
  bytes[36] = 0xef;
  return bytes;
}

function esp8285Image(): Uint8Array {
  const bytes = new Uint8Array(0x1020);
  bytes[0x1000] = 0xe9;
  bytes[0x1001] = 1;
  const view = new DataView(bytes.buffer);
  view.setUint32(0x1008, 0x4020_1010, true);
  view.setUint32(0x100c, 4, true);
  bytes.set([1, 2, 3, 4], 0x1010);
  bytes[0x1014] = 0xef;
  return bytes;
}

function esp32PartitionTable(applicationSize = 0x1e0000): Uint8Array {
  const bytes = new Uint8Array(0xc00).fill(0xff);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x50aa, true);
  bytes[2] = 0;
  bytes[3] = 0x10;
  view.setUint32(4, 0x10000, true);
  view.setUint32(8, applicationSize, true);
  view.setUint16(32, 0xebeb, true);
  bytes.set(md5Bytes(bytes.subarray(0, 32)), 48);
  return bytes;
}

function esp32BootApp(): Uint8Array {
  const bytes = new Uint8Array(0x2000).fill(0xff);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  view.setUint32(28, 0x4743_989a, true);
  view.setUint32(0x1000, 0, true);
  return bytes;
}

function stm32Image(flagsOffset: number, flags: number): Uint8Array {
  const bytes = new Uint8Array(96).fill(0xcc);
  bytes.set([0xbe, 0xef, 0xba, 0xbe, 0xca, 0xfe, 0xf0, 0x0d]);
  bytes[8] = 1;
  bytes[9] = 0;
  bytes[flagsOffset] = flags;
  bytes[flagsOffset + 1] = 0x5a;
  return bytes;
}

function fixedJsonBlock(
  bytes: Uint8Array,
  offset: number,
  size: number,
): Readonly<Record<string, unknown>> {
  const block = bytes.slice(offset, offset + size);
  const terminator = block.indexOf(0);
  return JSON.parse(
    new TextDecoder().decode(
      terminator < 0 ? block : block.slice(0, terminator),
    ),
  ) as Readonly<Record<string, unknown>>;
}

const release: OfficialRelease = {
  label: "4.1.0",
  revision: "release410",
  channel: "release",
};

const stm32Release: OfficialRelease = {
  label: "3.6.4",
  revision: "release364",
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
    minVersion: "3.0.0",
    customLayout: null,
    overlay: { fan_en: true, pins: { led: 9 } },
    raw: {},
  },
};

function stm32Target(role: "tx" | "rx"): OfficialTarget {
  return {
    ...target,
    id: `vendor/${role}_900/stm32-${role}`,
    role,
    radioKey: `${role}_900`,
    targetKey: `stm32-${role}`,
    config: {
      ...target.config,
      productName: `STM32 ${role.toUpperCase()}`,
      platform: "stm32",
      firmware: `STM32_${role.toUpperCase()}`,
      layoutFile: null,
      customLayout: {},
      overlay: null,
      uploadMethods: ["stlink", "download"],
      raw: { stlink: { offset: "0x4000" } },
    },
  };
}

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

const stm32Options: ExpressLrsFirmwareOptions = {
  ...options,
  domain: 1,
};

const assetBase = "https://expresslrs.github.io/web-flasher/assets/firmware";

function officialAssets(): ReadonlyMap<string, Uint8Array> {
  const targetBase = `${assetBase}/release410/FCC/EXAMPLE_TX_2400`;
  return new Map([
    [`${targetBase}/bootloader.bin`, espImage()],
    [`${targetBase}/partitions.bin`, esp32PartitionTable()],
    [`${targetBase}/boot_app0.bin`, esp32BootApp()],
    [`${targetBase}/firmware.bin`, espImage()],
    [
      `${assetBase}/hardware/TX/example.json`,
      new TextEncoder().encode(
        JSON.stringify({ serial_rx: 1, pins: { led: 1, fan: 2 } }),
      ),
    ],
  ]);
}

function assetFetcher(
  assets: ReadonlyMap<string, Uint8Array>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request) => {
    const bytes = assets.get(String(url));
    return bytes === undefined
      ? new Response(null, { status: 404 })
      : new Response(copyToArrayBuffer(bytes));
  });
}

describe("official firmware package preparation", () => {
  it("acquires only the selected target, appends configuration, hashes segments, and emits recovery", async () => {
    const fetchImplementation = assetFetcher(
      officialAssets(),
    ) as unknown as typeof fetch;
    const progressStages: string[] = [];

    const prepared = await prepareOfficialFirmwarePackage({
      release,
      target,
      options,
      fetchImplementation,
      onProgress: (progress) => progressStages.push(progress.stage),
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
    if (application === undefined) throw new TypeError("missing application");
    expect(new TextDecoder().decode(application?.slice(48, 80))).toContain(
      "Example ExpressLRS TX",
    );
    const configuredOptions = fixedJsonBlock(application, 48 + 128 + 16, 512);
    expect(configuredOptions).not.toHaveProperty("domain");
    const configuredLayout = fixedJsonBlock(
      application,
      48 + 128 + 16 + 512,
      2_048,
    );
    expect(configuredLayout).toEqual({
      serial_rx: 1,
      fan_en: true,
      pins: { led: 9 },
    });
    expect(prepared.primaryFileName).toBe("example-4.1.0.bin");
    expect(prepared.primaryMimeType).toBe("application/octet-stream");
    expect(prepared.primaryDownload).toEqual(application);
    expect(fetchImplementation).toHaveBeenCalledTimes(5);
    expect(fetchImplementation).toHaveBeenCalledWith(
      `${assetBase}/release410/FCC/EXAMPLE_TX_2400/firmware.bin`,
      expect.objectContaining({
        credentials: "omit",
        redirect: "follow",
      }),
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      `${assetBase}/hardware/TX/example.json`,
      expect.any(Object),
    );
    expect(new Set(progressStages)).toEqual(
      new Set([
        "FIRMWARE_ARCHIVE",
        "HARDWARE_ARCHIVE",
        "EXTRACT",
        "CONFIGURE",
        "HASH",
        "PACKAGE",
      ]),
    );

    const recovery = unzipSync(prepared.recoveryArchive);
    const manifest = JSON.parse(
      strFromU8(recovery["manifest.json"] ?? new Uint8Array()),
    ) as { target: { id: string }; segments: readonly unknown[] };
    expect(manifest.target.id).toBe(target.id);
    expect(manifest.segments).toHaveLength(4);
    expect(recovery["segments/firmware.bin"]).toEqual(application);
  });

  it("creates a gzip Wi-Fi image for ESP8285 without changing the serial segment bytes", async () => {
    const firmwareUrl = `${assetBase}/release410/FCC/EXAMPLE_RX_2400/firmware.bin`;
    const fetchImplementation = assetFetcher(
      new Map([[firmwareUrl, esp8285Image()]]),
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
    expect(prepared.segments[0]?.bytes.slice(0, 0x1020)).toEqual(
      esp8285Image(),
    );
    expect(
      new TextDecoder().decode(
        prepared.segments[0]?.bytes.slice(0x1020, 0x1060),
      ),
    ).toContain("Example RX");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      firmwareUrl,
      expect.any(Object),
    );
  });

  it.each([
    { name: "application", applicationChipId: 0, bootloaderChipId: 5 },
    { name: "bootloader", applicationChipId: 5, bootloaderChipId: 0 },
  ])("rejects a mismatched ESP32-C3 $name image", async (testCase) => {
    const targetBase = `${assetBase}/release410/FCC/EXAMPLE_TX_2400`;
    const fetchImplementation = assetFetcher(
      new Map([
        [`${targetBase}/firmware.bin`, espImage(testCase.applicationChipId)],
        [`${targetBase}/bootloader.bin`, espImage(testCase.bootloaderChipId)],
        [`${targetBase}/partitions.bin`, esp32PartitionTable()],
        [`${targetBase}/boot_app0.bin`, esp32BootApp()],
      ]),
    ) as unknown as typeof fetch;

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: {
          ...target,
          config: {
            ...target.config,
            platform: "esp32-c3",
            layoutFile: null,
          },
        },
        options,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "INVALID_FIRMWARE" });
  });

  it("rejects a configured ESP32 image larger than the declared app partition", async () => {
    const assets = new Map(officialAssets());
    assets.set(
      `${assetBase}/release410/FCC/EXAMPLE_TX_2400/partitions.bin`,
      esp32PartitionTable(1024),
    );

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target,
        options,
        fetchImplementation: assetFetcher(assets) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "INVALID_FIRMWARE" });
  });

  it("rejects a corrupted ESP32 partition-table checksum", async () => {
    const assets = new Map(officialAssets());
    const corrupted = esp32PartitionTable();
    corrupted[16] = corrupted[16]! ^ 1;
    assets.set(
      `${assetBase}/release410/FCC/EXAMPLE_TX_2400/partitions.bin`,
      corrupted,
    );

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target,
        options,
        fetchImplementation: assetFetcher(assets) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "INVALID_FIRMWARE" });
  });

  it("rejects an ESP32 boot_app0 image outside its exact partition", async () => {
    const assets = new Map(officialAssets());
    assets.set(
      `${assetBase}/release410/FCC/EXAMPLE_TX_2400/boot_app0.bin`,
      new Uint8Array(0x1fff),
    );

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target,
        options,
        fetchImplementation: assetFetcher(assets) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "INVALID_FIRMWARE" });
  });

  it("rejects an ESP8285 image that exceeds its flash boundary after configuration", async () => {
    const firmwareUrl = `${assetBase}/release410/FCC/EXAMPLE_RX_2400/firmware.bin`;
    const logoUrl = `${assetBase}/release410/hardware/logo/oversized.bin`;
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
        logoFile: "oversized.bin",
        customLayout: {},
      },
    };

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: rxTarget,
        options,
        fetchImplementation: assetFetcher(
          new Map([
            [firmwareUrl, esp8285Image()],
            [logoUrl, new Uint8Array(1024 * 1024)],
          ]),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "INVALID_FIRMWARE" });
  });

  it("embeds the selected low-frequency domain, including US 433 Wide", async () => {
    const firmwareUrl = `${assetBase}/release410/FCC/EXAMPLE_RX_900/firmware.bin`;
    const lowFrequencyTarget: OfficialTarget = {
      ...target,
      id: "vendor/rx_900/example-rx",
      role: "rx",
      radioKey: "rx_900",
      targetKey: "example-rx-900",
      config: {
        ...target.config,
        productName: "Example 900 RX",
        platform: "esp8285",
        firmware: "EXAMPLE_RX_900",
        layoutFile: null,
        customLayout: {},
      },
    };
    const prepared = await prepareOfficialFirmwarePackage({
      release,
      target: lowFrequencyTarget,
      options: { ...options, domain: 7 },
      fetchImplementation: assetFetcher(
        new Map([[firmwareUrl, esp8285Image()]]),
      ) as unknown as typeof fetch,
    });

    const application = prepared.segments[0]?.bytes;
    expect(application).toBeDefined();
    if (application === undefined) throw new TypeError("missing application");
    expect(fixedJsonBlock(application, 0x1020 + 128 + 16, 512)).toEqual(
      expect.objectContaining({ domain: 7 }),
    );
  });

  it.each([
    { offset: "0x1000", expectedAddress: 0x0800_1000 },
    { offset: "0x4000", expectedAddress: 0x0800_4000 },
    { offset: "0x8000", expectedAddress: 0x0800_8000 },
  ])(
    "uses verified STM32 application offset $offset in flash and recovery metadata",
    async (testCase) => {
      const prepared = await prepareOfficialFirmwarePackage({
        release: stm32Release,
        target: {
          ...stm32Target("tx"),
          config: {
            ...stm32Target("tx").config,
            raw: { stlink: { offset: testCase.offset } },
          },
        },
        options: stm32Options,
        fetchImplementation: vi.fn(
          async () => new Response(copyToArrayBuffer(stm32Image(30, 0xaa))),
        ) as unknown as typeof fetch,
      });

      expect(prepared.segments).toEqual([
        expect.objectContaining({
          name: "firmware.bin",
          address: testCase.expectedAddress,
        }),
      ]);
      const recovery = unzipSync(prepared.recoveryArchive);
      const manifest = JSON.parse(
        strFromU8(recovery["manifest.json"] ?? new Uint8Array()),
      ) as { segments: readonly Readonly<{ address: number }>[] };
      expect(manifest.segments).toEqual([
        expect.objectContaining({ address: testCase.expectedAddress }),
      ]);
    },
  );

  it.each([
    {
      initialFlags: 0xaa,
      uartInverted: true,
      unlockHigherPower: false,
      expectedFlags: 0xa9,
    },
    {
      initialFlags: 0xab,
      uartInverted: false,
      unlockHigherPower: true,
      expectedFlags: 0xaa,
    },
  ])(
    "packs STM32 TX flags while preserving unrelated bits: %#",
    async (testCase) => {
      const prepared = await prepareOfficialFirmwarePackage({
        release: stm32Release,
        target: stm32Target("tx"),
        options: {
          ...stm32Options,
          uartInverted: testCase.uartInverted,
          unlockHigherPower: testCase.unlockHigherPower,
        },
        fetchImplementation: vi.fn(
          async () =>
            new Response(
              copyToArrayBuffer(stm32Image(30, testCase.initialFlags)),
            ),
        ) as unknown as typeof fetch,
      });

      const configured = prepared.segments[0]?.bytes;
      expect(configured).toBeDefined();
      if (configured === undefined) throw new TypeError("missing application");
      expect(configured[10]).toBe(1);
      expect(configured[30]).toBe(testCase.expectedFlags);
      expect(configured[31]).toBe(0x5a);
      expect(
        new DataView(
          configured.buffer,
          configured.byteOffset,
          configured.byteLength,
        ).getUint32(26, true),
      ).toBe(options.telemetryInterval);
    },
  );

  it.each([
    {
      name: "2.4 GHz",
      radioKey: "tx_2400",
      region: "FCC",
      domain: 0,
    },
    {
      name: "AU 915 domain zero",
      radioKey: "tx_900",
      region: "FCC",
      domain: 0,
    },
  ])("applies the STM32 domain rule for $name", async (testCase) => {
    const prepared = await prepareOfficialFirmwarePackage({
      release: stm32Release,
      target: { ...stm32Target("tx"), radioKey: testCase.radioKey },
      options: {
        ...stm32Options,
        region: testCase.region,
        domain: testCase.domain,
      },
      fetchImplementation: vi.fn(
        async () => new Response(copyToArrayBuffer(stm32Image(30, 0xaa))),
      ) as unknown as typeof fetch,
    });

    expect(prepared.segments[0]?.bytes[10]).toBe(
      testCase.radioKey.endsWith("_900") ? testCase.domain : 0xcc,
    );
  });

  it.each([
    {
      initialFlags: 0xaa,
      receiverInvertTx: true,
      lockOnFirstConnection: false,
      r9mmMiniSbus: true,
      expectedFlags: 0xad,
    },
    {
      initialFlags: 0xaf,
      receiverInvertTx: false,
      lockOnFirstConnection: false,
      r9mmMiniSbus: false,
      expectedFlags: 0xa8,
    },
  ])(
    "packs STM32 RX flags while preserving unrelated bits: %#",
    async (testCase) => {
      const prepared = await prepareOfficialFirmwarePackage({
        release: stm32Release,
        target: stm32Target("rx"),
        options: {
          ...stm32Options,
          receiverInvertTx: testCase.receiverInvertTx,
          lockOnFirstConnection: testCase.lockOnFirstConnection,
          r9mmMiniSbus: testCase.r9mmMiniSbus,
        },
        fetchImplementation: vi.fn(
          async () =>
            new Response(
              copyToArrayBuffer(stm32Image(30, testCase.initialFlags)),
            ),
        ) as unknown as typeof fetch,
      });

      const configured = prepared.segments[0]?.bytes;
      expect(configured).toBeDefined();
      if (configured === undefined) throw new TypeError("missing application");
      expect(configured[30]).toBe(testCase.expectedFlags);
      expect(configured[31]).toBe(0x5a);
      expect(
        new DataView(
          configured.buffer,
          configured.byteOffset,
          configured.byteLength,
        ).getUint32(26, true),
      ).toBe(options.receiverUartBaud);
    },
  );

  it.each([
    {
      label: "3.3.0",
      telemetryOffset: 18,
      fanOffset: 22,
      flagsOffset: 26,
    },
    {
      label: "3.4.0",
      telemetryOffset: 22,
      fanOffset: 26,
      flagsOffset: 30,
    },
  ])(
    "uses the verified legacy STM32 TX field order for $label",
    async (testCase) => {
      const legacyOptions = {
        ...stm32Options,
        telemetryInterval: 4_321,
        fanRuntime: 54_321,
        uartInverted: false,
        unlockHigherPower: false,
      };
      const prepared = await prepareOfficialFirmwarePackage({
        release: {
          label: testCase.label,
          revision: `release-${testCase.label}`,
          channel: "release",
        },
        target: stm32Target("tx"),
        options: legacyOptions,
        fetchImplementation: vi.fn(
          async () =>
            new Response(
              copyToArrayBuffer(stm32Image(testCase.flagsOffset, 0xab)),
            ),
        ) as unknown as typeof fetch,
      });

      const configured = prepared.segments[0]?.bytes;
      expect(configured).toBeDefined();
      if (configured === undefined) throw new TypeError("missing application");
      const view = new DataView(
        configured.buffer,
        configured.byteOffset,
        configured.byteLength,
      );
      expect(view.getUint32(testCase.telemetryOffset, true)).toBe(4_321);
      expect(view.getUint32(testCase.fanOffset, true)).toBe(54_321);
      expect(configured[testCase.flagsOffset]).toBe(0xa8);
      expect(configured[testCase.flagsOffset + 1]).toBe(0x5a);
    },
  );

  it("fails closed when the selected region/target asset is not present", async () => {
    const fetchImplementation = assetFetcher(
      new Map(),
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

  it("uses the version-specific logo with a global fallback only after a 404", async () => {
    const firmwareUrl = `${assetBase}/release410/FCC/EXAMPLE_RX_2400/firmware.bin`;
    const versionedLogoUrl = `${assetBase}/release410/hardware/logo/example-logo.bin`;
    const globalLogoUrl = `${assetBase}/hardware/logo/example-logo.bin`;
    const logo = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const fetchImplementation = assetFetcher(
      new Map([
        [firmwareUrl, esp8285Image()],
        [globalLogoUrl, logo],
      ]),
    ) as unknown as typeof fetch;
    const logoTarget: OfficialTarget = {
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
        logoFile: "example-logo.bin",
        customLayout: {},
      },
    };

    const prepared = await prepareOfficialFirmwarePackage({
      release,
      target: logoTarget,
      options,
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      versionedLogoUrl,
      expect.any(Object),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      globalLogoUrl,
      expect.any(Object),
    );
    expect(prepared.segments[0]?.bytes.slice(-logo.byteLength)).toEqual(logo);
  });

  it("rejects a firmware response whose final URL changes the trusted path", async () => {
    const response = new Response(copyToArrayBuffer(espImage()));
    Object.defineProperty(response, "url", {
      value: `${assetBase}/release410/FCC/OTHER/firmware.bin`,
    });

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: { ...target, config: { ...target.config, layoutFile: null } },
        options,
        fetchImplementation: vi.fn(
          async () => response,
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "NETWORK" });
    expect(response.bodyUsed).toBe(true);
  });

  it("rejects a cross-origin final firmware URL", async () => {
    const response = new Response(copyToArrayBuffer(espImage()));
    Object.defineProperty(response, "url", {
      value: "https://evil.example/release410/FCC/EXAMPLE_TX_2400/firmware.bin",
    });

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: { ...target, config: { ...target.config, layoutFile: null } },
        options,
        fetchImplementation: vi.fn(
          async () => response,
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "NETWORK" });
    expect(response.bodyUsed).toBe(true);
  });

  it("rejects a firmware asset whose declared size exceeds the per-file bound", async () => {
    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: { ...target, config: { ...target.config, layoutFile: null } },
        options,
        fetchImplementation: vi.fn(
          async () =>
            new Response(null, {
              headers: {
                "content-length": String(16 * 1024 * 1024 + 1),
              },
            }),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("relays an already-aborted acquisition signal", async () => {
    const controller = new AbortController();
    controller.abort();
    let observedAbortedSignal = false;
    const fetchImplementation = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        observedAbortedSignal = init?.signal?.aborted === true;
        throw new DOMException("cancelled", "AbortError");
      },
    );

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: { ...target, config: { ...target.config, layoutFile: null } },
        options,
        signal: controller.signal,
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "NETWORK" });
    expect(observedAbortedSignal).toBe(true);
  });
});

const runLive =
  (
    globalThis as {
      readonly process?: {
        readonly env?: Readonly<Record<string, string | undefined>>;
      };
    }
  ).process?.env?.EXPRESSLRS_LIVE_CATALOG === "1";

(runLive ? describe : describe.skip)(
  "live official firmware package preparation",
  () => {
    it("prepares current official ESP32 and ESP8285 packages from extracted mirror assets", async () => {
      const catalog = await loadOfficialExpressLrsCatalog();
      const liveRelease =
        catalog.releases.find((item) => item.label === "4.1.0") ??
        catalog.releases.find((item) => item.channel === "release");
      const esp32Target = catalog.targets.find(
        (item) => item.config.firmware === "Unified_ESP32_2400_RX",
      );
      const esp8285Target = catalog.targets.find(
        (item) => item.config.firmware === "Unified_ESP8285_2400_RX",
      );
      expect(liveRelease).toBeDefined();
      expect(esp32Target).toBeDefined();
      expect(esp8285Target).toBeDefined();
      if (
        liveRelease === undefined ||
        esp32Target === undefined ||
        esp8285Target === undefined
      ) {
        return;
      }

      const preparedEsp32 = await prepareOfficialFirmwarePackage({
        release: liveRelease,
        target: esp32Target,
        options,
      });
      const preparedEsp8285 = await prepareOfficialFirmwarePackage({
        release: liveRelease,
        target: esp8285Target,
        options,
      });

      expect(preparedEsp32.segments.map((segment) => segment.name)).toEqual([
        "bootloader.bin",
        "partitions.bin",
        "boot_app0.bin",
        "firmware.bin",
      ]);
      expect(
        preparedEsp32.segments.every((segment) => segment.bytes.length > 0),
      ).toBe(true);
      expect(preparedEsp8285.segments).toHaveLength(1);
      expect(preparedEsp8285.segments[0]?.bytes[0x1000]).toBe(0xe9);
    }, 120_000);

    it("prepares a pinned official STM32 3.6.4 asset at its verified flash address", async () => {
      const pinnedRelease: OfficialRelease = {
        label: "3.6.4",
        revision: "b61c9e24305b2f80046a5e0b3c4edf56c4f059a3",
        channel: "release",
      };
      const pinnedTarget: OfficialTarget = {
        ...stm32Target("rx"),
        id: "DIY_Devices/rx_900/DIY_900_RX_STM32_SX1272",
        vendorKey: "DIY_Devices",
        vendorName: "DIY Devices",
        targetKey: "DIY_900_RX_STM32_SX1272",
        config: {
          ...stm32Target("rx").config,
          productName: "DIY 900 RX STM32 SX1272",
          firmware: "DIY_900_RX_STM32_SX1272",
          minVersion: "3.3.0",
          raw: { stlink: { offset: "0x4000" } },
        },
      };

      const prepared = await prepareOfficialFirmwarePackage({
        release: pinnedRelease,
        target: pinnedTarget,
        options: stm32Options,
      });

      expect(prepared.segments).toEqual([
        expect.objectContaining({
          address: 0x0800_4000,
          name: "firmware.bin",
        }),
      ]);
      const configured = prepared.segments[0]?.bytes;
      expect(configured).toBeDefined();
      if (configured === undefined) throw new TypeError("missing application");
      expect(
        new DataView(
          configured.buffer,
          configured.byteOffset,
          configured.byteLength,
        ).getUint32(4, true),
      ).toBe(0x0800_410d);
    }, 120_000);

    it("prepares both FCC and LBT artifacts for a current dual-band target", async () => {
      const catalog = await loadOfficialExpressLrsCatalog();
      const liveRelease = catalog.releases.find(
        (item) => item.label === "4.1.0" && item.channel === "release",
      );
      const dualTarget = catalog.targets.find(
        (item) =>
          item.radioKey.toLocaleLowerCase("en-US").includes("dual") &&
          item.config.firmware === "Unified_ESP32_LR1121_RX",
      );
      expect(liveRelease).toBeDefined();
      expect(dualTarget).toBeDefined();
      if (liveRelease === undefined || dualTarget === undefined) return;

      const [fcc, lbt] = await Promise.all([
        prepareOfficialFirmwarePackage({
          release: liveRelease,
          target: dualTarget,
          options: { ...options, region: "FCC", domain: 7 },
        }),
        prepareOfficialFirmwarePackage({
          release: liveRelease,
          target: dualTarget,
          options: { ...options, region: "LBT", domain: 7 },
        }),
      ]);

      expect(fcc.segments.map((segment) => segment.name)).toEqual([
        "bootloader.bin",
        "partitions.bin",
        "boot_app0.bin",
        "firmware.bin",
      ]);
      expect(lbt.segments.map((segment) => segment.name)).toEqual(
        fcc.segments.map((segment) => segment.name),
      );
      expect(fcc.segments.at(-1)?.bytes).not.toEqual(
        lbt.segments.at(-1)?.bytes,
      );
    }, 120_000);
  },
);
