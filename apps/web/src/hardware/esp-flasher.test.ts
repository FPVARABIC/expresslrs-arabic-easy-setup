import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FirmwareSegment, OfficialTarget } from "./parity-types";
import type { HardwareSerialPort } from "./serial";

interface MockWriteFlashOptions {
  readonly fileArray: readonly Readonly<{
    readonly data: Uint8Array;
    readonly address: number;
  }>[];
  readonly reportProgress: (
    fileIndex: number,
    written: number,
    total: number,
  ) => void;
  readonly calculateMD5Hash: (image: Uint8Array) => string;
}

const mocks = vi.hoisted(() => ({
  transportConstructor: vi.fn<(port: unknown, tracing?: boolean) => void>(),
  loaderConstructor: vi.fn<(options: unknown) => void>(),
  disconnect: vi.fn<() => Promise<void>>(),
  main: vi.fn<(resetMode?: string) => Promise<string>>(),
  writeFlash: vi.fn<(options: MockWriteFlashOptions) => Promise<void>>(),
  after: vi.fn<(resetMode: string) => Promise<void>>(),
}));

vi.mock("esptool-js", () => ({
  Transport: class {
    public constructor(port: unknown, tracing?: boolean) {
      mocks.transportConstructor(port, tracing);
    }

    public disconnect(): Promise<void> {
      return mocks.disconnect();
    }
  },
  ESPLoader: class {
    public constructor(options: unknown) {
      mocks.loaderConstructor(options);
    }

    public main(resetMode?: string): Promise<string> {
      return mocks.main(resetMode);
    }

    public writeFlash(options: MockWriteFlashOptions): Promise<void> {
      return mocks.writeFlash(options);
    }

    public after(resetMode: string): Promise<void> {
      return mocks.after(resetMode);
    }
  },
}));

import { flashEspFirmware } from "./esp-flasher";

const target: OfficialTarget = {
  id: "vendor/tx_2400/esp32-module",
  role: "tx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "tx_2400",
  targetKey: "esp32-module",
  config: {
    productName: "ESP32 Module",
    platform: "esp32",
    firmware: "ESP32_MODULE",
    luaName: "ESP32 Module",
    layoutFile: null,
    logoFile: null,
    uploadMethods: ["uart", "download"],
    minVersion: null,
    customLayout: {},
    overlay: null,
    raw: {},
  },
};

const port = {
  open: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
} satisfies HardwareSerialPort;

function segment(
  address = 0,
  bytes = new Uint8Array([1, 2, 3]),
  name = "firmware.bin",
): FirmwareSegment {
  return {
    name,
    address,
    bytes,
    sha256: "0".repeat(64),
  };
}

function flash(
  overrides: Partial<Parameters<typeof flashEspFirmware>[0]> = {},
) {
  return flashEspFirmware({
    port,
    target,
    segments: [segment()],
    ...overrides,
  });
}

describe("Espressif firmware flashing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transportConstructor.mockImplementation(() => undefined);
    mocks.loaderConstructor.mockImplementation(() => undefined);
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.main.mockResolvedValue("ESP32");
    mocks.writeFlash.mockResolvedValue(undefined);
    mocks.after.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a pre-aborted call before constructing a transport", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(flash({ signal: controller.signal })).rejects.toMatchObject({
      code: "ABORTED",
    });
    expect(mocks.transportConstructor).not.toHaveBeenCalled();
  });

  it("cancels a bootloader operation that has already started", async () => {
    const controller = new AbortController();
    mocks.main.mockImplementationOnce(
      () => new Promise<string>(() => undefined),
    );
    const result = flash({ signal: controller.signal });
    await vi.waitFor(() => expect(mocks.main).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(result).rejects.toMatchObject({ code: "ABORTED" });
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("bounds a bootloader operation that never settles", async () => {
    vi.useFakeTimers();
    mocks.main.mockImplementationOnce(
      () => new Promise<string>(() => undefined),
    );
    const result = flash();
    const rejection = expect(result).rejects.toMatchObject({
      code: "BOOTLOADER",
    });

    await vi.advanceTimersByTimeAsync(30_001);

    await rejection;
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an empty segment list", []],
    ["a zero-byte segment", [segment(0, new Uint8Array())]],
    ["a negative address", [segment(-1)]],
    ["a non-integer address", [segment(1.5)]],
    ["an address beyond uint32", [segment(0x1_0000_0000)]],
    ["an unsafe integer address", [segment(Number.MAX_SAFE_INTEGER + 1)]],
    ["an address beyond ESP32 flash", [segment(0x40_0000)]],
    [
      "duplicate addresses",
      [segment(0, new Uint8Array([1]), "first.bin"), segment(0)],
    ],
    [
      "overlapping address ranges",
      [
        segment(0x102, new Uint8Array([4, 5]), "later.bin"),
        segment(0x100, new Uint8Array([1, 2, 3, 4]), "earlier.bin"),
      ],
    ],
  ] as const)(
    "rejects %s before constructing a transport",
    async (_, segments) => {
      await expect(flash({ segments })).rejects.toMatchObject({
        code: "WRITE",
      });
      expect(mocks.transportConstructor).not.toHaveBeenCalled();
    },
  );

  it("rejects an address beyond ESP8285 flash before constructing a transport", async () => {
    await expect(
      flash({
        target: {
          ...target,
          config: { ...target.config, platform: "esp8285" },
        },
        segments: [segment(0x10_0000)],
      }),
    ).rejects.toMatchObject({ code: "WRITE" });
    expect(mocks.transportConstructor).not.toHaveBeenCalled();
  });

  it("disconnects after loader construction fails and preserves that failure", async () => {
    mocks.loaderConstructor.mockImplementationOnce(() => {
      throw new Error("loader construction primary");
    });
    mocks.disconnect.mockRejectedValueOnce(new Error("disconnect secondary"));

    await expect(flash()).rejects.toMatchObject({
      code: "BOOTLOADER",
      message: "loader construction primary",
    });
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.main).not.toHaveBeenCalled();
  });

  it("disconnects after bootloader initialization fails and preserves that failure", async () => {
    mocks.main.mockRejectedValueOnce(new Error("initialization primary"));
    mocks.disconnect.mockRejectedValueOnce(new Error("disconnect secondary"));

    await expect(flash()).rejects.toMatchObject({
      code: "BOOTLOADER",
      message: "initialization primary",
    });
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects after writing fails and preserves that failure", async () => {
    mocks.writeFlash.mockRejectedValueOnce(new Error("write primary"));
    mocks.disconnect.mockRejectedValueOnce(new Error("disconnect secondary"));

    await expect(flash()).rejects.toMatchObject({
      code: "WRITE",
      message: "write primary",
      cleanupVerified: false,
    });
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects after reset fails and preserves that failure", async () => {
    mocks.after.mockRejectedValueOnce(new Error("reset primary"));
    mocks.disconnect.mockRejectedValueOnce(new Error("disconnect secondary"));

    await expect(flash()).rejects.toMatchObject({
      code: "RESET",
      message: "reset primary",
    });
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("reports an unverified cleanup after a successful reset", async () => {
    mocks.disconnect.mockRejectedValueOnce(new Error("port remained open"));

    await expect(flash()).resolves.toEqual({
      chipName: "ESP32",
      bytesWritten: 3,
      cleanupVerified: false,
    });
  });

  it("bounds a disconnect that never settles", async () => {
    vi.useFakeTimers();
    mocks.disconnect.mockImplementationOnce(
      () => new Promise<void>(() => undefined),
    );
    const result = flash();

    await vi.advanceTimersByTimeAsync(2_001);

    await expect(result).resolves.toMatchObject({ cleanupVerified: false });
  });

  it("rejects a mismatched chip before writing and disconnects", async () => {
    mocks.main.mockResolvedValueOnce("ESP32-S3");

    await expect(
      flash({
        target: {
          ...target,
          config: { ...target.config, platform: "esp32-c3" },
        },
      }),
    ).rejects.toMatchObject({ code: "PLATFORM_MISMATCH" });
    expect(mocks.writeFlash).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each(["ESP32-C3", "ESP32-S2", "ESP32-S3"])(
    "does not treat %s as a classic ESP32",
    async (chipName) => {
      mocks.main.mockResolvedValueOnce(chipName);

      await expect(flash()).rejects.toMatchObject({
        code: "PLATFORM_MISMATCH",
      });
      expect(mocks.writeFlash).not.toHaveBeenCalled();
    },
  );

  it("fails closed for an unknown ESP32 platform suffix", async () => {
    await expect(
      flash({
        target: {
          ...target,
          config: { ...target.config, platform: "esp32-c6" },
        },
      }),
    ).rejects.toMatchObject({ code: "PLATFORM_MISMATCH" });
    expect(mocks.writeFlash).not.toHaveBeenCalled();
    expect(mocks.transportConstructor).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    ["esp32-c3", "ESP32-C3 (revision v0.4)"],
    ["esp32-s2", "ESP32-S2"],
    ["esp32-s3", "ESP32-S3"],
    ["esp8285", "ESP8266EX"],
  ] as const)(
    "accepts %s only for its matching %s family",
    async (platform, chipName) => {
      mocks.main.mockResolvedValueOnce(chipName);

      await expect(
        flash({
          target: { ...target, config: { ...target.config, platform } },
        }),
      ).resolves.toMatchObject({ chipName });
    },
  );

  it("keeps target matching, segment mapping, and aggregate progress intact", async () => {
    const progress: Array<Readonly<{ stage: string; writtenBytes: number }>> =
      [];
    const segments = [
      segment(0, new Uint8Array([1, 2]), "bootloader.bin"),
      segment(0x1_0000, new Uint8Array([3, 4, 5]), "firmware.bin"),
    ];
    mocks.writeFlash.mockImplementationOnce(async (options) => {
      options.reportProgress(0, 1, 2);
      options.reportProgress(0, 2, 2);
      options.reportProgress(1, 3, 3);
    });

    const result = await flash({
      segments,
      onProgress(update) {
        progress.push(update);
      },
    });

    expect(result).toEqual({
      chipName: "ESP32",
      bytesWritten: 5,
      cleanupVerified: true,
    });
    expect(mocks.writeFlash).toHaveBeenCalledTimes(1);
    expect(mocks.writeFlash.mock.calls[0]?.[0].fileArray).toEqual([
      { data: segments[0]?.bytes, address: 0 },
      { data: segments[1]?.bytes, address: 0x1_0000 },
    ]);
    expect(progress.map((update) => update.stage)).toEqual([
      "PRECHECK",
      "BOOTLOADER",
      "WRITE",
      "WRITE",
      "WRITE",
      "WRITE",
      "VERIFY",
      "RESET",
    ]);
    expect(
      progress
        .filter((update) => update.stage === "WRITE")
        .map((update) => update.writtenBytes),
    ).toEqual([0, 1, 2, 5]);
    expect(progress.every((update) => update.writtenBytes <= 5)).toBe(true);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
