import { describe, expect, it, vi } from "vitest";

import type { OfficialTarget } from "./parity-types";
import {
  createDfuSeAddressCommand,
  flashStm32DfuFirmware,
  parseDfuSeMemoryDescriptor,
  type UsbDfuDeviceLike,
} from "./stm32-dfu";

const target: OfficialTarget = {
  id: "vendor/rx_2400/stm32-rx",
  role: "rx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "rx_2400",
  targetKey: "stm32-rx",
  config: {
    productName: "STM32 Receiver",
    platform: "stm32",
    firmware: "STM32_RX",
    luaName: null,
    layoutFile: null,
    logoFile: null,
    uploadMethods: ["stlink", "download"],
    minVersion: null,
    customLayout: {},
    overlay: null,
    raw: {},
  },
};

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.slice().buffer, 0, bytes.byteLength);
}

function fakeDfuDevice(): {
  readonly device: UsbDfuDeviceLike;
  readonly memory: Uint8Array;
  readonly requestDevice: ReturnType<typeof vi.fn>;
  readonly erasedPages: number[];
} {
  const base = 0x0800_0000;
  const memory = new Uint8Array(64 * 1024).fill(0xff);
  const erasedPages: number[] = [];
  let address = base;
  let state = 2;
  let opened = false;

  const device: UsbDfuDeviceLike = {
    vendorId: 0x0483,
    productId: 0xdf11,
    get opened() {
      return opened;
    },
    configuration: null,
    configurations: [
      {
        configurationValue: 1,
        interfaces: [
          {
            interfaceNumber: 0,
            alternates: [
              {
                alternateSetting: 0,
                interfaceClass: 0xfe,
                interfaceSubclass: 1,
                interfaceProtocol: 2,
                interfaceName: "@Internal Flash /0x08000000/04*016Kg",
              },
            ],
          },
        ],
      },
    ],
    open: vi.fn(async () => {
      opened = true;
    }),
    close: vi.fn(async () => {
      opened = false;
    }),
    selectConfiguration: vi.fn().mockResolvedValue(undefined),
    claimInterface: vi.fn().mockResolvedValue(undefined),
    releaseInterface: vi.fn().mockResolvedValue(undefined),
    selectAlternateInterface: vi.fn().mockResolvedValue(undefined),
    controlTransferOut: vi.fn(async (setup, source) => {
      const bytes =
        source === undefined
          ? new Uint8Array()
          : new Uint8Array(
              ArrayBuffer.isView(source) ? source.buffer : source,
              ArrayBuffer.isView(source) ? source.byteOffset : 0,
              ArrayBuffer.isView(source)
                ? source.byteLength
                : source.byteLength,
            ).slice();
      if (setup.request === 4 || setup.request === 6) {
        state = 2;
        return { status: "ok" as const, bytesWritten: 0 };
      }
      if (setup.request !== 1) {
        return { status: "ok" as const, bytesWritten: bytes.byteLength };
      }
      if (setup.value === 0 && bytes.byteLength === 5) {
        const command = bytes[0];
        const commandAddress = new DataView(bytes.buffer).getUint32(1, true);
        if (command === 0x21) address = commandAddress;
        if (command === 0x41) {
          erasedPages.push(commandAddress);
          const offset = commandAddress - base;
          memory.fill(0xff, offset, offset + 16 * 1024);
        }
        state = 5;
      } else if (setup.value >= 2) {
        const offset = address - base + (setup.value - 2) * 2048;
        memory.set(bytes, offset);
        state = 5;
      } else if (setup.value === 0 && bytes.byteLength === 0) {
        state = 8;
      }
      return { status: "ok" as const, bytesWritten: bytes.byteLength };
    }),
    controlTransferIn: vi.fn(async (setup, length) => {
      if (setup.request === 3) {
        return {
          status: "ok" as const,
          data: dataView(new Uint8Array([0, 0, 0, 0, state, 0])),
        };
      }
      if (setup.request === 2 && setup.value >= 2) {
        const offset = address - base + (setup.value - 2) * 2048;
        return {
          status: "ok" as const,
          data: dataView(memory.slice(offset, offset + length)),
        };
      }
      return { status: "stall" as const };
    }),
  };
  const requestDevice = vi.fn().mockResolvedValue(device);
  return { device, memory, requestDevice, erasedPages };
}

describe("STM32 WebUSB DFU", () => {
  it("parses DfuSe page permissions and sizes", () => {
    const map = parseDfuSeMemoryDescriptor(
      "@Internal Flash /0x08000000/04*016Kg,01*064Ke",
    );

    expect(map.baseAddress).toBe(0x0800_0000);
    expect(map.pages).toHaveLength(5);
    expect(map.pages[0]).toEqual({
      start: 0x0800_0000,
      size: 16 * 1024,
      readable: true,
      erasable: true,
      writable: true,
    });
    expect(map.pages[4]).toEqual(
      expect.objectContaining({
        size: 64 * 1024,
        readable: true,
        erasable: false,
        writable: true,
      }),
    );
  });

  it("encodes DfuSe set-address and erase commands in little endian", () => {
    expect(createDfuSeAddressCommand("set-address", 0x0800_1234)).toEqual(
      new Uint8Array([0x21, 0x34, 0x12, 0x00, 0x08]),
    );
    expect(createDfuSeAddressCommand("erase", 0x0800_4000)).toEqual(
      new Uint8Array([0x41, 0x00, 0x40, 0x00, 0x08]),
    );
  });

  it("erases only overlapping pages, writes blocks, reads every byte back, and requests reset", async () => {
    const hardware = fakeDfuDevice();
    const firmware = new Uint8Array(3_000).map((_, index) => index & 0xff);
    const progress: string[] = [];

    const result = await flashStm32DfuFirmware({
      target,
      segment: {
        name: "firmware.bin",
        address: 0,
        bytes: firmware,
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
      onProgress(update) {
        progress.push(update.stage);
      },
    });

    expect(result).toEqual({
      bytesWritten: firmware.byteLength,
      baseAddress: 0x0800_0000,
    });
    expect(hardware.erasedPages).toEqual([0x0800_0000]);
    expect(hardware.memory.slice(0, firmware.byteLength)).toEqual(firmware);
    expect(progress).toContain("ERASE");
    expect(progress).toContain("WRITE");
    expect(progress).toContain("VERIFY");
    expect(progress.at(-1)).toBe("RESET");
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
  });

  it("rejects a write crossing a protected page before erase", async () => {
    const hardware = fakeDfuDevice();
    Object.defineProperty(hardware.device, "configurations", {
      value: [
        {
          configurationValue: 1,
          interfaces: [
            {
              interfaceNumber: 0,
              alternates: [
                {
                  alternateSetting: 0,
                  interfaceClass: 0xfe,
                  interfaceSubclass: 1,
                  interfaceProtocol: 2,
                  interfaceName: "@Internal Flash /0x08000000/01*016Ka",
                },
              ],
            },
          ],
        },
      ],
    });

    await expect(
      flashStm32DfuFirmware({
        target,
        segment: {
          name: "firmware.bin",
          address: 0,
          bytes: new Uint8Array([1, 2, 3]),
          sha256: "0".repeat(64),
        },
        navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
      }),
    ).rejects.toMatchObject({ code: "RANGE_INVALID" });
    expect(hardware.erasedPages).toHaveLength(0);
  });
});
