import { describe, expect, it, vi } from "vitest";

import type { OfficialTarget } from "./parity-types";
import {
  flashStm32StlinkFirmware,
  normalizeExpectedCpuType,
  Stm32StlinkError,
  type UsbStlinkDeviceLike,
} from "./stm32-stlink";

// ---- a scripted ST-Link/V2-1 with an STM32 behind it -----------------------

const FLASH_START = 0x0800_0000;
const SRAM_START = 0x2000_0000;
const CPUID_REG = 0xe000ed00;
const IDCODE_REG = 0xe0042000;
const DHCSR_REG = 0xe000edf0;
const DEMCR_REG = 0xe000edfc;
const AIRCR_REG = 0xe000ed0c;
const FLASH_KEYR = 0x40022004;
const FLASH_SR = 0x4002200c;
const FLASH_CR = 0x40022010;
const FLASH_AR = 0x40022014;

interface FakeOptions {
  readonly productId?: number;
  /** ST-Link version word as the probe reports it (big-endian on the wire). */
  readonly versionWord?: number;
  readonly mode?: number;
  readonly voltage?: readonly [number, number];
  readonly coreId?: number;
  readonly cpuid?: number;
  readonly idcode?: number;
  readonly flashSizeReg?: number;
  readonly flashKb?: number;
  readonly pageBytes?: number;
  readonly programmingError?: boolean;
  readonly corruptReadBack?: boolean;
  readonly releaseHangs?: boolean;
  /** Answer the enter-SWD command with a SWD FAULT (0x81) instead of OK. */
  readonly faultEnterSwd?: boolean;
  /** Answer the first N enter-SWD commands with a SWD WAIT (0x14) then OK. */
  readonly enterSwdWaits?: number;
  /** Answer the AIRCR write of resetRun (DEMCR already RUN) with a FAULT. */
  readonly faultResetRun?: boolean;
  /** Report a SWD fault on the last read/write memory status query. */
  readonly lastRwFault?: boolean;
  /** A cleanup write of CR=LOCK does not take effect, so the flash stays open. */
  readonly relockReadsUnlocked?: boolean;
}

function fakeStlink(options: FakeOptions = {}) {
  const productId = options.productId ?? 0x374b;
  const versionWord = options.versionWord ?? (2 << 12) | (37 << 6) | 7; // V2J37M7
  const mode = options.mode ?? 0x02;
  const voltage = options.voltage ?? [1200, 1650]; // 3.30 V
  const coreId = options.coreId ?? 0x1ba01477;
  const cpuid = options.cpuid ?? 0x412fc231; // Cortex-M3 r2p1 -> PART_NO 0xc23
  const idcode = options.idcode ?? 0x20036410; // DEV_ID 0x410
  const flashSizeReg = options.flashSizeReg ?? 0x1ffff7e0;
  const flashKb = options.flashKb ?? 128;
  const pageBytes = options.pageBytes ?? 1024;

  const flash = new Uint8Array(flashKb * 1024).fill(0xff);
  const sram = new Uint8Array(20 * 1024);
  const registers = new Map<number, number>();
  const debug = new Map<number, number>([
    [FLASH_CR, 0x80],
    [FLASH_SR, 0],
    [FLASH_AR, 0],
    [DEMCR_REG, 0],
    [AIRCR_REG, 0],
  ]);
  let dhcsrStatus = 0;
  let keyStage = 0;
  let enterSwdSeen = 0;
  const commands: Uint8Array[] = [];
  const erasedPages: number[] = [];
  const writerRuns: { source: number; destination: number; length: number }[] =
    [];
  let expectingPayload: { address: number; length: number } | null = null;
  let answer: Uint8Array = new Uint8Array(0);
  let opened = false;

  const readMemory = (address: number, length: number): Uint8Array => {
    if (address >= FLASH_START && address < FLASH_START + flash.byteLength) {
      const out = flash.slice(
        address - FLASH_START,
        address - FLASH_START + length,
      );
      if (options.corruptReadBack === true && out.byteLength > 0)
        out[0] = (out[0] ?? 0) ^ 0x01;
      return out;
    }
    if (address >= SRAM_START && address < SRAM_START + sram.byteLength) {
      return sram.slice(address - SRAM_START, address - SRAM_START + length);
    }
    return new Uint8Array(length);
  };
  const writeMemory = (address: number, bytes: Uint8Array): void => {
    if (address >= SRAM_START && address < SRAM_START + sram.byteLength) {
      sram.set(bytes, address - SRAM_START);
      return;
    }
    throw new Error(`unexpected memory write at 0x${address.toString(16)}`);
  };
  const u32 = (value: number) => {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    return out;
  };
  const readDebug = (address: number): number => {
    if (address === CPUID_REG) return cpuid;
    if (address === IDCODE_REG) return idcode;
    if (address === (flashSizeReg & 0xfffffffc)) {
      return flashSizeReg % 4 === 0 ? flashKb : flashKb << 16;
    }
    if (address === DHCSR_REG) return dhcsrStatus;
    return debug.get(address) ?? 0;
  };
  const runWriter = (): void => {
    const control = debug.get(FLASH_CR) ?? 0;
    const source = registers.get(0) ?? 0;
    const destination = registers.get(1) ?? 0;
    const length = registers.get(2) ?? 0;
    writerRuns.push({ source, destination, length });
    let status = debug.get(FLASH_SR) ?? 0;
    if (
      (control & 0x80) !== 0 ||
      (control & 0x01) === 0 ||
      options.programmingError === true
    ) {
      status |= 0x04; // PGERR
    } else {
      for (let offset = 0; offset < length; offset += 2) {
        const index = destination - FLASH_START + offset;
        const current =
          (flash[index] ?? 0xff) | ((flash[index + 1] ?? 0xff) << 8);
        const next =
          (sram[source - SRAM_START + offset] ?? 0) |
          ((sram[source - SRAM_START + offset + 1] ?? 0) << 8);
        if (current !== 0xffff && current !== next) {
          status |= 0x04;
          break;
        }
        flash[index] = next & 0xff;
        flash[index + 1] = (next >>> 8) & 0xff;
      }
      status |= 0x20; // EOP
    }
    debug.set(FLASH_SR, status);
    dhcsrStatus |= 0x00020000; // halted at the breakpoint
  };
  const writeDebug = (address: number, value: number): void => {
    if (address === FLASH_KEYR) {
      if (value === 0x45670123) keyStage = 1;
      else if (value === 0xcdef89ab && keyStage === 1) {
        debug.set(FLASH_CR, (debug.get(FLASH_CR) ?? 0) & ~0x80);
        keyStage = 0;
      } else keyStage = 0;
      return;
    }
    if (address === FLASH_CR) {
      const stored =
        options.relockReadsUnlocked === true && value === 0x80
          ? value & ~0x80
          : value;
      debug.set(FLASH_CR, stored);
      if ((value & 0x02) !== 0 && (value & 0x40) !== 0) {
        const page = debug.get(FLASH_AR) ?? 0;
        erasedPages.push(page);
        flash.fill(0xff, page - FLASH_START, page - FLASH_START + pageBytes);
        debug.set(FLASH_SR, (debug.get(FLASH_SR) ?? 0) | 0x20);
      }
      return;
    }
    if (address === FLASH_SR) {
      debug.set(FLASH_SR, (debug.get(FLASH_SR) ?? 0) & ~value);
      return;
    }
    if (address === DHCSR_REG) {
      if (value === 0xa05f0003) dhcsrStatus |= 0x00020000;
      if (value === 0xa05f0001) {
        dhcsrStatus &= ~0x00020000;
        if ((registers.get(15) ?? 0) === SRAM_START) runWriter();
      }
      return;
    }
    if (address === AIRCR_REG) {
      debug.set(AIRCR_REG, value);
      if ((value & 0x4) !== 0) {
        dhcsrStatus = (debug.get(DEMCR_REG) ?? 0) & 1 ? 0x00020000 : 0;
      }
      return;
    }
    debug.set(address, value);
  };
  const decode = (command: Uint8Array): void => {
    const view = new DataView(
      command.buffer,
      command.byteOffset,
      command.byteLength,
    );
    const head = command[0];
    const sub = command[1];
    answer = new Uint8Array(0);
    if (head === 0xf1) {
      answer = new Uint8Array([
        (versionWord >>> 8) & 0xff,
        versionWord & 0xff,
        0x83,
        0x04,
        0x48,
        0x37,
      ]);
    } else if (head === 0xf5) {
      answer = new Uint8Array([mode, 0]);
    } else if (head === 0xf7) {
      answer = new Uint8Array([...u32(voltage[0]), ...u32(voltage[1])]);
    } else if (head === 0xf2) {
      if (sub === 0x43) answer = new Uint8Array([0x80, 0]);
      else if (sub === 0x30) {
        enterSwdSeen += 1;
        let status = 0x80;
        if (options.faultEnterSwd === true) status = 0x81;
        else if (enterSwdSeen <= (options.enterSwdWaits ?? 0)) status = 0x14;
        answer = new Uint8Array([status, 0]);
      } else if (sub === 0x3e) {
        answer = new Uint8Array(12);
        answer[0] = options.lastRwFault === true ? 0x11 : 0x80;
      } else if (sub === 0x22) answer = u32(coreId);
      else if (sub === 0x36) {
        answer = new Uint8Array([
          0x80,
          0,
          0,
          0,
          ...u32(readDebug(view.getUint32(2, true))),
        ]);
      } else if (sub === 0x35) {
        const addr = view.getUint32(2, true);
        const val = view.getUint32(6, true);
        const demcrRun = (debug.get(DEMCR_REG) ?? 0) === 0;
        writeDebug(addr, val);
        const faulted =
          options.faultResetRun === true &&
          addr === AIRCR_REG &&
          demcrRun &&
          (val & 0x4) !== 0;
        answer = new Uint8Array([faulted ? 0x81 : 0x80, 0]);
      } else if (sub === 0x33) {
        answer = new Uint8Array([
          0x80,
          0,
          0,
          0,
          ...u32(registers.get(command[2] ?? 0) ?? 0),
        ]);
      } else if (sub === 0x34) {
        registers.set(command[2] ?? 0, view.getUint32(3, true));
        answer = new Uint8Array([0x80, 0]);
      } else if (sub === 0x07) {
        answer = readMemory(view.getUint32(2, true), view.getUint32(6, true));
      } else if (sub === 0x08 || sub === 0x0d) {
        expectingPayload = {
          address: view.getUint32(2, true),
          length: view.getUint32(6, true),
        };
      }
    }
  };

  const device: UsbStlinkDeviceLike = {
    vendorId: 0x0483,
    productId,
    get opened() {
      return opened;
    },
    configuration: {
      configurationValue: 1,
      interfaces: [{ interfaceNumber: 0 }],
    },
    productName: "STM32 STLink",
    serialNumber: "fake",
    open: vi.fn(async () => {
      opened = true;
    }),
    close: vi.fn(async () => {
      opened = false;
    }),
    selectConfiguration: vi.fn().mockResolvedValue(undefined),
    claimInterface: vi.fn().mockResolvedValue(undefined),
    releaseInterface: vi.fn(() =>
      options.releaseHangs === true
        ? new Promise<void>(() => undefined)
        : Promise.resolve(),
    ),
    selectAlternateInterface: vi.fn().mockResolvedValue(undefined),
    transferOut: vi.fn(async (_endpoint: number, source: BufferSource) => {
      const bytes = new Uint8Array(
        ArrayBuffer.isView(source) ? source.buffer : source,
        ArrayBuffer.isView(source) ? source.byteOffset : 0,
        source.byteLength,
      ).slice();
      if (expectingPayload !== null) {
        const pending = expectingPayload;
        expectingPayload = null;
        expect(bytes.byteLength).toBe(pending.length);
        writeMemory(pending.address, bytes);
      } else {
        commands.push(bytes);
        decode(bytes);
      }
      return { status: "ok" as const, bytesWritten: bytes.byteLength };
    }),
    transferIn: vi.fn(async (_endpoint: number, length: number) => {
      const padded = new Uint8Array(length);
      padded.set(answer.slice(0, length));
      return { status: "ok" as const, data: new DataView(padded.buffer) };
    }),
  };
  return {
    device,
    flash,
    sram,
    commands,
    erasedPages,
    writerRuns,
    debug,
    requestDevice: vi.fn(async () => device),
  };
}

function target(
  overrides: Partial<{
    cpus: string[];
    offset: string;
    uploadMethods: string[];
    platform: string;
  }> = {},
): OfficialTarget {
  const cpus = overrides.cpus ?? ["STM32F103C8T6", "STM32F103CBT6"];
  return {
    id: "frsky/rx_900/r9mm",
    role: "rx",
    vendorKey: "frsky",
    vendorName: "FrSky",
    radioKey: "rx_900",
    targetKey: "r9mm",
    config: {
      productName: "FrSky R9MM/R9Mini",
      platform: overrides.platform ?? "stm32",
      firmware: "Frsky_RX_R9MM_R9MINI",
      luaName: null,
      layoutFile: null,
      logoFile: null,
      priorTargetName: null,
      uploadMethods: (overrides.uploadMethods ?? [
        "betaflight",
        "stlink",
        "download",
      ]) as OfficialTarget["config"]["uploadMethods"],
      minVersion: null,
      customLayout: null,
      overlay: null,
      raw: {
        stlink: {
          cpus,
          offset: overrides.offset ?? "0x8000",
          bootloader: "r9mm_bootloader.bin",
        },
      },
    },
  };
}

function image(length: number, seed = 1): Uint8Array {
  return new Uint8Array(length).map((_, index) => (index * seed + 17) & 0xff);
}

const packed = (...bytes: number[]) => {
  const out = new Uint8Array(16);
  out.set(bytes);
  return out;
};

async function attempt(input: Parameters<typeof flashStm32StlinkFirmware>[0]) {
  return flashStm32StlinkFirmware(input).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

/** Fires the abort as soon as the first flash page has been erased. */
function abortAfterFirstErase(
  hardware: ReturnType<typeof fakeStlink>,
  controller: AbortController,
): void {
  let erases = 0;
  const original = hardware.device.transferOut;
  (
    hardware.device as { transferOut: UsbStlinkDeviceLike["transferOut"] }
  ).transferOut = async (endpoint, source) => {
    const result = await original(endpoint, source);
    if (hardware.erasedPages.length > erases) {
      erases = hardware.erasedPages.length;
      controller.abort();
    }
    return result;
  };
}

describe("ST-Link (SWD) STM32 writer", () => {
  it("normalises catalog part numbers the way the official flasher does", () => {
    expect(normalizeExpectedCpuType("STM32F103C8T6")).toBe("STM32F103x8T6");
    expect(normalizeExpectedCpuType("STM32F303CCT6")).toBe("STM32F303xCT6");
    expect(normalizeExpectedCpuType("STM32L432KCUx")).toBe("STM32L432xCUX");
    expect(normalizeExpectedCpuType("stm32f1")).toBe("STM32F1");
  });

  it("probes, detects the part, erases exactly the overlapping pages, programs through the on-core writer, reads every block back, locks and resets", async () => {
    const hardware = fakeStlink();
    const firmware = image(3000);
    const stages: string[] = [];
    const result = await flashStm32StlinkFirmware({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: firmware,
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
      onProgress: (event) => stages.push(event.stage),
    });

    expect(result).toMatchObject({
      bytesWritten: 3000,
      baseAddress: 0x0800_8000,
      cleanupVerified: true,
      probe: "V2-1 V2J37M7",
      mcu: {
        core: "Cortex-M3",
        devId: 0x410,
        type: "STM32F103xB",
        flashKb: 128,
        sramKb: 20,
        pageBytes: 1024,
      },
      readBackVerified: true,
    });
    expect(result.targetVoltage).toBeCloseTo(3.3, 2);

    // The probe conversation opens exactly as pystlink's `init()` does.
    expect(hardware.commands.slice(0, 10)).toEqual([
      packed(0xf1, 0x80),
      packed(0xf5),
      packed(0xf2, 0x21), // it was in debug mode: leave it first
      packed(0xf7),
      packed(0xf2, 0x43, 0x01), // 1.8 MHz, because J37 >= J22
      packed(0xf2, 0x30, 0xa3),
      packed(0xf2, 0x22),
      packed(0xf2, 0x36, 0x00, 0xed, 0x00, 0xe0), // CPUID
      packed(0xf2, 0x36, 0x00, 0x20, 0x04, 0xe0), // IDCODE
      packed(0xf2, 0x36, 0xe0, 0xf7, 0xff, 0x1f), // flash size register
    ]);
    // The unlock keys, in order, only after a reset-halt.
    const keyWrites = hardware.commands.filter(
      (command) =>
        command[1] === 0x35 &&
        new DataView(command.buffer).getUint32(2, true) === FLASH_KEYR,
    );
    expect(
      keyWrites.map((command) =>
        new DataView(command.buffer).getUint32(6, true),
      ),
    ).toEqual([0x45670123, 0xcdef89ab]);
    // 3000 bytes at 0x08008000 touch three 1 KB pages and no others.
    expect(hardware.erasedPages).toEqual([
      0x0800_8000, 0x0800_8400, 0x0800_8800,
    ]);
    // The writer went in at the SRAM start, then ran once per 1 KB block.
    expect(hardware.sram.slice(0, 4)).toEqual(
      new Uint8Array([0x03, 0x88, 0x0b, 0x80]),
    );
    expect(hardware.writerRuns).toEqual([
      { source: SRAM_START + 256, destination: 0x0800_8000, length: 1024 },
      { source: SRAM_START + 256, destination: 0x0800_8400, length: 1024 },
      { source: SRAM_START + 256, destination: 0x0800_8800, length: 952 },
    ]);
    expect(hardware.flash.slice(0x8000, 0x8000 + 3000)).toEqual(firmware);
    expect(hardware.flash[0x8000 + 3000]).toBe(0xff);
    // Every programmed block was read back over SWD.
    const readBacks = hardware.commands.filter(
      (command) => command[1] === 0x07,
    );
    expect(
      readBacks.map((command) =>
        new DataView(command.buffer).getUint32(2, true),
      ),
    ).toEqual([0x0800_8000, 0x0800_8400, 0x0800_8800]);
    // Locked, reset into the new firmware (run, not halt), debug released.
    const controlWrites = hardware.commands.filter(
      (command) =>
        command[1] === 0x35 &&
        new DataView(command.buffer).getUint32(2, true) === FLASH_CR,
    );
    expect(new DataView(controlWrites.at(-1)!.buffer).getUint32(6, true)).toBe(
      0x80,
    );
    expect(hardware.debug.get(DEMCR_REG)).toBe(0);
    expect(hardware.debug.get(AIRCR_REG)).toBe(0x05fa0004);
    expect(
      hardware.commands.some(
        (command) => command[0] === 0xf2 && command[1] === 0x21,
      ),
    ).toBe(true);
    expect(hardware.commands.length % 2).toBe(0);
    expect(hardware.device.releaseInterface).toHaveBeenCalledWith(0);
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(
      expect.arrayContaining([
        "BOOTLOADER",
        "ERASE",
        "WRITE",
        "VERIFY",
        "RESET",
      ]),
    );
  });

  it("skips a block that is entirely 0xFF, since erased flash already reads that way", async () => {
    const hardware = fakeStlink();
    const firmware = new Uint8Array(2048).fill(0xff);
    firmware.set(image(100), 0);
    await flashStm32StlinkFirmware({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: firmware,
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(hardware.writerRuns).toHaveLength(1);
    expect(hardware.erasedPages).toEqual([0x0800_8000, 0x0800_8400]);
  });

  it("refuses a part the Target was not built for, before touching the flash", async () => {
    const hardware = fakeStlink();
    const result = await attempt({
      target: target({ cpus: ["STM32F303CCT6"] }),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CPU_MISMATCH",
        detail: {
          expected: "STM32F303CCT6",
          detected: "STM32F101xB or STM32F102xB or STM32F103xB",
        },
      },
    });
    expect(hardware.erasedPages).toEqual([]);
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
  });

  it("refuses a target supply below 2.0 V before erasing anything", async () => {
    const hardware = fakeStlink({ voltage: [1200, 900] }); // 1.80 V
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "TARGET_VOLTAGE_LOW", detail: { voltage: "1.80" } },
    });
    expect(hardware.erasedPages).toEqual([]);
  });

  it("names an ST-Link/V3 and an old probe firmware as unsupported", async () => {
    const v3 = fakeStlink({ productId: 0x374f });
    expect(
      await attempt({
        target: target(),
        segment: {
          name: "firmware.bin",
          address: 0x0800_8000,
          bytes: image(64),
          sha256: "0".repeat(64),
        },
        navigatorObject: { usb: { requestDevice: v3.requestDevice } },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "PROBE_UNSUPPORTED", detail: { probe: "V3" } },
    });
    expect(v3.device.open).not.toHaveBeenCalled();

    const old = fakeStlink({ versionWord: (2 << 12) | (17 << 6) | 4 });
    expect(
      await attempt({
        target: target(),
        segment: {
          name: "firmware.bin",
          address: 0x0800_8000,
          bytes: image(64),
          sha256: "0".repeat(64),
        },
        navigatorObject: { usb: { requestDevice: old.requestDevice } },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "PROBE_FIRMWARE_OLD", detail: { probe: "V2-1 V2J17M4" } },
    });
    expect(old.device.close).toHaveBeenCalledTimes(1);
  });

  it("refuses an STM32L4 by name, because no flash driver exists for it here or in the pinned official flasher", async () => {
    const hardware = fakeStlink({
      cpuid: 0x410fc241, // Cortex-M4
      idcode: 0x10016435, // DEV_ID 0x435
      flashSizeReg: 0x1fff75e0,
      flashKb: 256,
    });
    const result = await attempt({
      target: target({ cpus: ["STM32L432KCUx"], offset: "0x4000" }),
      segment: {
        name: "firmware.bin",
        address: 0x0800_4000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CPU_UNSUPPORTED", detail: { detected: "STM32L432xC" } },
    });
    expect(hardware.erasedPages).toEqual([]);
  });

  it("reports no core on SWD rather than a mismatched part", async () => {
    const hardware = fakeStlink({ coreId: 0 });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CPU_NOT_CONNECTED" },
    });
  });

  it("surfaces a programming error from the flash status register and locks the flash again", async () => {
    const hardware = fakeStlink({ programmingError: true });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "FLASH_ERROR", detail: { status: "0x00000004" } },
    });
    expect((hardware.debug.get(FLASH_CR) ?? 0) & 0x80).toBe(0x80);
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
  });

  it("fails the write when the SWD read-back differs from what was sent", async () => {
    const hardware = fakeStlink({ corruptReadBack: true });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VERIFY_FAILED", detail: { address: "0x08008000" } },
    });
  });

  it("stops on cancellation and still releases the interface and closes the probe", async () => {
    const hardware = fakeStlink();
    const controller = new AbortController();
    let erases = 0;
    const originalTransferOut = hardware.device.transferOut;
    (
      hardware.device as { transferOut: UsbStlinkDeviceLike["transferOut"] }
    ).transferOut = async (endpoint, source) => {
      const result = await originalTransferOut(endpoint, source);
      if (hardware.erasedPages.length > erases) {
        erases = hardware.erasedPages.length;
        controller.abort();
      }
      return result;
    };
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(4096),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
      signal: controller.signal,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "ABORTED" } });
    expect(hardware.writerRuns).toHaveLength(0);
    expect(hardware.device.releaseInterface).toHaveBeenCalledWith(0);
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
  });

  it("reports unverified cleanup when the interface cannot be released", async () => {
    const hardware = fakeStlink({ releaseHangs: true });
    vi.useFakeTimers();
    try {
      const operation = flashStm32StlinkFirmware({
        target: target(),
        segment: {
          name: "firmware.bin",
          address: 0x0800_8000,
          bytes: image(64),
          sha256: "0".repeat(64),
        },
        navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
      });
      const settled = operation.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await vi.advanceTimersByTimeAsync(2_500);
      const result = await settled;
      expect(result).toMatchObject({
        ok: true,
        value: { cleanupVerified: false },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- M1: the status byte of every command is checked --------------------

  it("refuses to continue when the probe answers enter SWD with a SWD fault", async () => {
    const hardware = fakeStlink({ faultEnterSwd: true });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "SWD_FAULT", detail: { status: "0x81" } },
    });
    expect(hardware.erasedPages).toEqual([]);
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
  });

  it("retries a SWD WAIT during enter SWD within a bounded budget, then continues", async () => {
    const hardware = fakeStlink({ enterSwdWaits: 2 });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result.ok).toBe(true);
    const enters = hardware.commands.filter(
      (command) => command[0] === 0xf2 && command[1] === 0x30,
    );
    expect(enters.length).toBe(3); // two WAITs, then the accepted one
  });

  it("gives up on an endless SWD WAIT instead of looping or reporting success", async () => {
    const hardware = fakeStlink({ enterSwdWaits: 99 });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "SWD_WAIT" } });
    expect(hardware.erasedPages).toEqual([]);
  });

  it("surfaces a SWD fault raised while resetting into the new firmware, not success", async () => {
    const hardware = fakeStlink({ faultResetRun: true });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(2000),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "SWD_FAULT" } });
    expect(hardware.writerRuns.length).toBeGreaterThan(0); // written, but the reset failed
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
  });

  it("fails a write when a memory operation leaves a SWD fault in the last-RW status", async () => {
    const hardware = fakeStlink({ lastRwFault: true });
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(64),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "SWD_FAULT" } });
  });

  // ---- M2: cleanup after a cancel is real and honestly reported -----------

  it("re-locks the flash and verifies cleanup after a cancel during the first erase", async () => {
    const hardware = fakeStlink();
    const controller = new AbortController();
    abortAfterFirstErase(hardware, controller);
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(4096),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const error = result.error as Stm32StlinkError;
    expect(error.code).toBe("ABORTED");
    // Left LOCKED (0x80), not mid-erase (0x42 = PER|STRT).
    expect((hardware.debug.get(FLASH_CR) ?? 0) & 0x80).toBe(0x80);
    expect((hardware.debug.get(FLASH_CR) ?? 0) & (0x02 | 0x40)).toBe(0);
    // Cleanup ran on its own budget, so it is honestly verified.
    expect(error.cleanupVerified).toBe(true);
    expect(error.cleanupSteps).toMatchObject({
      flashRelocked: "yes",
      debugExited: "yes",
    });
    expect(hardware.device.releaseInterface).toHaveBeenCalledWith(0);
    expect(hardware.device.close).toHaveBeenCalledTimes(1);
  });

  it("reports unverified cleanup and keeps recovery when the flash will not re-lock", async () => {
    const hardware = fakeStlink({ relockReadsUnlocked: true });
    const controller = new AbortController();
    abortAfterFirstErase(hardware, controller);
    const result = await attempt({
      target: target(),
      segment: {
        name: "firmware.bin",
        address: 0x0800_8000,
        bytes: image(4096),
        sha256: "0".repeat(64),
      },
      navigatorObject: { usb: { requestDevice: hardware.requestDevice } },
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const error = result.error as Stm32StlinkError;
    expect(error.code).toBe("ABORTED");
    expect(error.cleanupVerified).toBe(false);
    expect(error.cleanupSteps).toMatchObject({ flashRelocked: "no" });
  });

  it("validates the Target and segment before asking for a probe", async () => {
    const hardware = fakeStlink();
    const usb = { requestDevice: hardware.requestDevice };
    const segment = {
      name: "firmware.bin",
      address: 0x0800_8000,
      bytes: image(64),
      sha256: "0".repeat(64),
    };
    await expect(
      flashStm32StlinkFirmware({
        target: target({ platform: "esp32" }),
        segment,
        navigatorObject: { usb },
      }),
    ).rejects.toMatchObject({ code: "DEVICE_INVALID" });
    await expect(
      flashStm32StlinkFirmware({
        target: target({ uploadMethods: ["dfu", "download"] }),
        segment,
        navigatorObject: { usb },
      }),
    ).rejects.toMatchObject({ code: "DEVICE_INVALID" });
    await expect(
      flashStm32StlinkFirmware({
        target: target({ offset: "0x4000" }),
        segment,
        navigatorObject: { usb },
      }),
    ).rejects.toMatchObject({ code: "RANGE_INVALID" });
    await expect(
      flashStm32StlinkFirmware({
        target: target({ cpus: [] }),
        segment,
        navigatorObject: { usb },
      }),
    ).rejects.toMatchObject({ code: "DEVICE_INVALID" });
    expect(hardware.requestDevice).not.toHaveBeenCalled();
    expect(new Stm32StlinkError("TIMEOUT", "x").cleanupVerified).toBe(true);
  });
});
