/**
 * The ST-Link route for STM32 Targets: SWD over a WebUSB ST-Link/V2 or V2-1
 * probe, the way the official flasher does it (`web-flasher/src/js/stlink.js`
 * on top of `src/js/stlink/lib/*`, which is a port of pystlink, MIT).
 *
 * This is the method every STM32 Target in the catalog advertises as
 * `stlink`. It is not DFU: DFU talks to the MCU's own ROM bootloader over its
 * USB port and needs the BOOT0 pin, while this talks to a debug probe wired to
 * the MCU's SWDIO/SWCLK pads and can program a completely blank part.
 *
 * What it does, in order, and what each step proves:
 *   1. probe identity and firmware (GET_VERSION), leave whatever mode the probe
 *      is in, read the target supply voltage, enter SWD;
 *   2. read CPUID, IDCODE and the flash-size register, so the Target's declared
 *      MCU is checked against the part that is actually wired up;
 *   3. reset-halt the core, unlock the flash controller, erase exactly the
 *      pages the image overlaps, program it through the small on-core writer
 *      pystlink uses for the F0/F1/F3 flash interface, and
 *   4. read every programmed block back over SWD and compare it byte for
 *      byte, lock the flash, reset the core into the new firmware, and leave
 *      debug mode.
 *
 * Only the application is written, at the Target's declared offset; the
 * official page passes no bootloader either (`STLinkFlash.vue` calls
 * `flash(files, undefined, …)`). The one deliberate difference: after the
 * write, the official flasher leaves the core halted in debug until it is
 * power-cycled; this resets it so the device boots and can be identified.
 */
import { copyToArrayBuffer, isAbortRequested } from "./byte-utils";
import type {
  FirmwareFlashProgressListener,
  FirmwareSegment,
  OfficialTarget,
} from "./parity-types";

// ---- constants -------------------------------------------------------------

const STLINK_VENDOR_ID = 0x0483;
/** The probes the official flasher accepts, with their bulk pipes. */
const PROBE_TYPES = Object.freeze([
  Object.freeze({
    version: "V2",
    productId: 0x3748,
    outEndpoint: 2,
    inEndpoint: 1,
  }),
  Object.freeze({
    version: "V2-1",
    productId: 0x374b,
    outEndpoint: 1,
    inEndpoint: 1,
  }),
]);
/** Probes that answer the version command differently and are refused by name. */
const OTHER_STLINK_PRODUCT_IDS = Object.freeze(
  new Map<number, string>([
    [0x374e, "V3"],
    [0x374f, "V3"],
    [0x3753, "V3"],
    [0x3754, "V3"],
    [0x3755, "V3"],
    [0x3757, "V3"],
  ]),
);

const CMD_GET_VERSION = 0xf1;
const CMD_DEBUG = 0xf2;
const CMD_DFU = 0xf3;
const CMD_SWIM = 0xf4;
const CMD_GET_CURRENT_MODE = 0xf5;
const CMD_GET_TARGET_VOLTAGE = 0xf7;

const MODE_DFU = 0x00;
const MODE_DEBUG = 0x02;
const MODE_SWIM = 0x03;

const DFU_EXIT = 0x07;
const SWIM_EXIT = 0x01;

const DEBUG_READMEM_32BIT = 0x07;
const DEBUG_WRITEMEM_32BIT = 0x08;
const DEBUG_WRITEMEM_8BIT = 0x0d;
const DEBUG_EXIT = 0x21;
const DEBUG_READCOREID = 0x22;
const DEBUG_APIV2_ENTER = 0x30;
const DEBUG_APIV2_READREG = 0x33;
const DEBUG_APIV2_WRITEREG = 0x34;
const DEBUG_APIV2_WRITEDEBUGREG = 0x35;
const DEBUG_APIV2_READDEBUGREG = 0x36;
const DEBUG_APIV2_SWD_SET_FREQ = 0x43;
const DEBUG_APIV2_GETLASTRWSTATUS2 = 0x3e;
const DEBUG_ENTER_SWD = 0xa3;
/** The 1.8 MHz divisor, the probe's own default. */
const SWD_FREQ_1800KHZ_DIVISOR = 1;

/**
 * The SWD access status a command answers in byte 0. `0x80` is success;
 * `0x10`/`0x14` are the AP/DP WAIT the debug port raises when it is momentarily
 * busy and mean "ask again", not "done"; anything else is a fault. The pinned
 * official web-flasher checks this byte only for the frequency command; every
 * command that carries it is checked here.
 */
const STLINK_STATUS_OK = 0x80;
const STLINK_STATUS_AP_WAIT = 0x10;
const STLINK_STATUS_DP_WAIT = 0x14;
const MAX_SWD_WAIT_RETRIES = 4;
const SWD_WAIT_RETRY_MS = 10;

const COMMAND_SIZE = 16;
const MAX_TRANSFER_SIZE = 1024;
const MAX_8BIT_TRANSFER_SIZE = 64;

/** Cortex-M core registers used by the writer. */
const REG_R0 = 0;
const REG_R1 = 1;
const REG_R2 = 2;
const REG_R4 = 4;
const REG_R5 = 5;
const REG_R6 = 6;
const REG_PC = 15;

const CPUID_REG = 0xe000ed00;
const AIRCR_REG = 0xe000ed0c;
const DHCSR_REG = 0xe000edf0;
const DEMCR_REG = 0xe000edfc;
const AIRCR_SYSRESETREQ = 0x05fa0004;
const DHCSR_DEBUGEN = 0xa05f0001;
const DHCSR_HALT = 0xa05f0003;
const DHCSR_STATUS_HALT_BIT = 0x00020000;
const DHCSR_STATUS_LOCKUP_BIT = 0x00080000;
const DEMCR_RUN_AFTER_RESET = 0;
const DEMCR_HALT_AFTER_RESET = 1;

const SRAM_START = 0x20000000;
const FLASH_START = 0x08000000;
const STM32_FLASH_BASE_ADDRESS = FLASH_START;
const VERIFIED_APPLICATION_OFFSETS = new Set([0x1000, 0x4000, 0x8000]);
const MAX_FIRMWARE_BYTES = 4 * 1024 * 1024;

/** The F0/F1/F3 flash interface registers (single bank). */
const FLASH_KEYR_REG = 0x40022004;
const FLASH_SR_REG = 0x4002200c;
const FLASH_CR_REG = 0x40022010;
const FLASH_AR_REG = 0x40022014;
const FLASH_KEY1 = 0x45670123;
const FLASH_KEY2 = 0xcdef89ab;
const FLASH_CR_PG = 0x01;
const FLASH_CR_PER = 0x02;
const FLASH_CR_STRT = 0x40;
const FLASH_CR_LOCK = 0x80;
const FLASH_SR_BSY = 0x01;
const FLASH_SR_EOP = 0x20;
const MINIMUM_PROGRAMMING_VOLTAGE = 2.0;

/**
 * The on-core writer: copies halfwords from R0 to R1 for R2 bytes, waiting
 * on the flash status register (R4) for BSY (R5) to clear and EOP (R6) to
 * appear after each one, then hits a breakpoint. Thumb encoding as published
 * by pystlink (`lib/stm32fp.py`, MIT), reproduced here as instruction bytes.
 */
const FLASH_WRITER_CODE: readonly number[] = Object.freeze([
  0x03,
  0x88, // ldrh r3, [r0]
  0x0b,
  0x80, // strh r3, [r1]
  0x23,
  0x68, // ldr  r3, [r4]
  0x2b,
  0x42, // tst  r3, r5
  0xfc,
  0xd1, // bne  test_busy
  0x33,
  0x42, // tst  r3, r6
  0x04,
  0xd0, // beq  exit
  0x02,
  0x30, // adds r0, #2
  0x02,
  0x31, // adds r1, #2
  0x02,
  0x3a, // subs r2, #2
  0x00,
  0x2a, // cmp  r2, #0
  0xf3,
  0xd1, // bne  write
  0x00,
  0xbe, // bkpt 0x00
]);
const FLASH_WRITER_OFFSET = SRAM_START;
const FLASH_DATA_OFFSET = SRAM_START + 256;

const TRANSFER_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 2_000;
/** A single cleanup transfer's deadline — shorter than an operation transfer,
 * because cleanup runs after a failure and must not hang the whole page. */
const CLEANUP_TRANSFER_TIMEOUT_MS = 1_000;
const ERASE_WAIT_MS = 400;
const WRITER_WAIT_MS = 400;
const POLL_INTERVAL_MS = 5;

// ---- the parts this driver can program -------------------------------------

interface McuVariant {
  readonly type: string;
  readonly flashKb: number;
  readonly sramKb: number;
}

interface McuFamily {
  readonly devId: number;
  readonly flashSizeReg: number;
  /** Page size for erase, or null where the pinned official flasher has no driver. */
  readonly pageBytes: number | null;
  readonly variants: readonly McuVariant[];
}

/**
 * The families the catalog's STM32 Targets name (`stlink.cpus`), keyed by
 * DEV_ID, with what pystlink's device table records for them. `pageBytes`
 * null means the official flasher has no flash driver for the part either.
 */
const MCU_FAMILIES: readonly McuFamily[] = Object.freeze([
  {
    devId: 0x410,
    flashSizeReg: 0x1ffff7e0,
    pageBytes: 1024,
    variants: [
      { type: "STM32F101x8", flashKb: 64, sramKb: 10 },
      { type: "STM32F101xB", flashKb: 128, sramKb: 16 },
      { type: "STM32F102x8", flashKb: 64, sramKb: 10 },
      { type: "STM32F102xB", flashKb: 128, sramKb: 16 },
      { type: "STM32F103x8", flashKb: 64, sramKb: 20 },
      { type: "STM32F103xB", flashKb: 128, sramKb: 20 },
    ],
  },
  {
    devId: 0x412,
    flashSizeReg: 0x1ffff7e0,
    pageBytes: 1024,
    variants: [
      { type: "STM32F101x4", flashKb: 16, sramKb: 4 },
      { type: "STM32F101x6", flashKb: 32, sramKb: 6 },
      { type: "STM32F102x4", flashKb: 16, sramKb: 4 },
      { type: "STM32F102x6", flashKb: 32, sramKb: 6 },
      { type: "STM32F103x4", flashKb: 16, sramKb: 6 },
      { type: "STM32F103x6", flashKb: 32, sramKb: 10 },
    ],
  },
  {
    devId: 0x414,
    flashSizeReg: 0x1ffff7e0,
    pageBytes: 2048,
    variants: [
      { type: "STM32F101xC", flashKb: 256, sramKb: 32 },
      { type: "STM32F101xD", flashKb: 384, sramKb: 48 },
      { type: "STM32F101xE", flashKb: 512, sramKb: 48 },
      { type: "STM32F103xC", flashKb: 256, sramKb: 48 },
      { type: "STM32F103xD", flashKb: 384, sramKb: 64 },
      { type: "STM32F103xE", flashKb: 512, sramKb: 64 },
    ],
  },
  {
    devId: 0x422,
    flashSizeReg: 0x1ffff7cc,
    pageBytes: 2048,
    variants: [
      { type: "STM32F302xB", flashKb: 128, sramKb: 32 },
      { type: "STM32F302xC", flashKb: 256, sramKb: 40 },
      { type: "STM32F303xB", flashKb: 128, sramKb: 32 },
      { type: "STM32F303xC", flashKb: 256, sramKb: 40 },
      { type: "STM32F358xC", flashKb: 256, sramKb: 40 },
    ],
  },
  {
    devId: 0x432,
    flashSizeReg: 0x1ffff7cc,
    pageBytes: 2048,
    variants: [
      { type: "STM32F373x8", flashKb: 64, sramKb: 16 },
      { type: "STM32F373xB", flashKb: 128, sramKb: 24 },
      { type: "STM32F373xC", flashKb: 256, sramKb: 32 },
      { type: "STM32F378xC", flashKb: 256, sramKb: 32 },
    ],
  },
  {
    devId: 0x438,
    flashSizeReg: 0x1ffff7cc,
    pageBytes: 2048,
    variants: [
      { type: "STM32F303x6", flashKb: 32, sramKb: 16 },
      { type: "STM32F303x8", flashKb: 64, sramKb: 16 },
      { type: "STM32F328x8", flashKb: 64, sramKb: 16 },
      { type: "STM32F334x4", flashKb: 16, sramKb: 16 },
      { type: "STM32F334x6", flashKb: 32, sramKb: 16 },
      { type: "STM32F334x8", flashKb: 64, sramKb: 16 },
    ],
  },
  {
    devId: 0x435,
    flashSizeReg: 0x1fff75e0,
    pageBytes: null,
    variants: [
      { type: "STM32L431xB", flashKb: 128, sramKb: 64 },
      { type: "STM32L431xC", flashKb: 256, sramKb: 64 },
      { type: "STM32L432xB", flashKb: 128, sramKb: 64 },
      { type: "STM32L432xC", flashKb: 256, sramKb: 64 },
      { type: "STM32L433xB", flashKb: 128, sramKb: 64 },
      { type: "STM32L433xC", flashKb: 256, sramKb: 64 },
      { type: "STM32L442xC", flashKb: 256, sramKb: 64 },
      { type: "STM32L443xC", flashKb: 256, sramKb: 64 },
    ],
  },
]);

/** Cortex-M3 and Cortex-M4 read their IDCODE at the same place. */
const CORE_IDCODE_REGISTERS: ReadonlyMap<
  number,
  { name: string; idcodeReg: number }
> = new Map([
  [0xc23, { name: "Cortex-M3", idcodeReg: 0xe0042000 }],
  [0xc24, { name: "Cortex-M4", idcodeReg: 0xe0042000 }],
]);

// ---- WebUSB shapes ---------------------------------------------------------

interface UsbInterfaceLike {
  readonly interfaceNumber: number;
  readonly claimed?: boolean;
}

interface UsbConfigurationLike {
  readonly configurationValue: number;
  readonly interfaces: readonly UsbInterfaceLike[];
}

interface UsbTransferOutResultLike {
  readonly status: "ok" | "stall" | "babble";
  readonly bytesWritten?: number;
}

interface UsbTransferInResultLike {
  readonly status: "ok" | "stall" | "babble";
  readonly data?: DataView;
}

export interface UsbStlinkDeviceLike {
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
  readonly configuration: UsbConfigurationLike | null;
  readonly productName?: string;
  readonly serialNumber?: string;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(
    interfaceNumber: number,
    alternateSetting: number,
  ): Promise<void>;
  transferOut(
    endpointNumber: number,
    data: BufferSource,
  ): Promise<UsbTransferOutResultLike>;
  transferIn(
    endpointNumber: number,
    length: number,
  ): Promise<UsbTransferInResultLike>;
}

interface UsbApiLike {
  requestDevice(options: {
    readonly filters: readonly Readonly<{
      readonly vendorId: number;
      readonly productId: number;
    }>[];
  }): Promise<UsbStlinkDeviceLike>;
}

interface NavigatorWithUsbLike {
  readonly usb?: UsbApiLike;
}

// ---- errors ----------------------------------------------------------------

export type Stm32StlinkErrorCode =
  | "UNSUPPORTED"
  | "CANCELLED"
  | "DEVICE_INVALID"
  | "RANGE_INVALID"
  | "PROBE_UNSUPPORTED"
  | "PROBE_FIRMWARE_OLD"
  | "TARGET_VOLTAGE_LOW"
  | "CPU_NOT_CONNECTED"
  | "CPU_UNSUPPORTED"
  | "CPU_MISMATCH"
  | "FLASH_LOCKED"
  | "FLASH_NOT_LOCKED"
  | "FLASH_ERROR"
  | "TRANSFER_FAILED"
  | "SWD_FAULT"
  | "SWD_WAIT"
  | "TIMEOUT"
  | "VERIFY_FAILED"
  | "ABORTED"
  | "CLEANUP_UNCONFIRMED";

export class Stm32StlinkError extends Error {
  public cleanupVerified = true;
  /**
   * What the cleanup after a failure actually managed to confirm, kept apart so
   * a caller (and the recovery journal) can tell a re-locked flash from a
   * released USB interface from a left debug session — "yes", "no" or "n/a"
   * per step.
   */
  public cleanupSteps: Readonly<Record<string, string>> = {};

  public constructor(
    public readonly code: Stm32StlinkErrorCode,
    message: string,
    /** Facts the operator's message is built from. */
    public detail: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "Stm32StlinkError";
  }
}

function markCleanupUnverified(error: unknown): void {
  if (error instanceof Stm32StlinkError) {
    error.cleanupVerified = false;
    return;
  }
  if (
    error === null ||
    typeof error !== "object" ||
    !Object.isExtensible(error)
  )
    return;
  try {
    Object.defineProperty(error, "cleanupVerified", {
      value: false,
      enumerable: true,
    });
  } catch {
    // The primary failure still sends the caller into recovery.
  }
}

function errorName(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name;
  }
  return error instanceof Error ? error.name : "";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (isAbortRequested(signal)) {
    throw new Stm32StlinkError("ABORTED", "ST-Link write was cancelled");
  }
}

function hex32(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function hex8(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
}

function withDeadline<T>(
  operation: () => Promise<T>,
  what: string,
  signal: AbortSignal | undefined,
  timeoutMs: number = TRANSFER_TIMEOUT_MS,
): Promise<T> {
  assertNotAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (settler: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settler();
    };
    const onAbort = () =>
      finish(() =>
        reject(new Stm32StlinkError("ABORTED", "ST-Link write was cancelled")),
      );
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Stm32StlinkError(
              "TIMEOUT",
              `ST-Link ${what} did not complete in time`,
            ),
          ),
        ),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    let task: Promise<T>;
    try {
      task = operation();
    } catch (error: unknown) {
      finish(() => reject(error));
      return;
    }
    void task.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function settleCleanupWithin(
  operation: () => Promise<unknown>,
): Promise<boolean> {
  let task: Promise<unknown>;
  try {
    task = operation();
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(confirmed);
    };
    const timer = setTimeout(() => finish(false), CLEANUP_TIMEOUT_MS);
    void task.then(
      () => finish(true),
      () => finish(false),
    );
  });
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Stm32StlinkError("ABORTED", "ST-Link write was cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// ---- the probe --------------------------------------------------------------

/**
 * The ST-Link command channel: a 16-byte command on the OUT pipe, optional
 * payload after it, optional answer on the IN pipe. Answers shorter than 64
 * bytes are read as 64 and truncated, as the probe expects.
 */
class StlinkProbe {
  public transferCount = 0;
  public versionString = "";
  public jtagVersion = 0;
  public targetVoltage: number | null = null;
  private activeSignal: AbortSignal | undefined;
  private transferTimeout = TRANSFER_TIMEOUT_MS;

  public constructor(
    private readonly device: UsbStlinkDeviceLike,
    public readonly probeType: (typeof PROBE_TYPES)[number],
    signal: AbortSignal | undefined,
  ) {
    this.activeSignal = signal;
  }

  /**
   * Switch to a cleanup budget: forget the operation's (possibly aborted)
   * signal and use a shorter per-transfer deadline, so re-locking the flash
   * and leaving debug after a cancel are actually sent rather than rejected by
   * the very cancellation that triggered them.
   */
  public beginCleanup(): void {
    this.activeSignal = undefined;
    this.transferTimeout = CLEANUP_TRANSFER_TIMEOUT_MS;
  }

  public async xfer(
    command: readonly number[] | Uint8Array,
    options: { readonly data?: Uint8Array; readonly rxLength?: number } = {},
  ): Promise<DataView> {
    const packet = new Uint8Array(COMMAND_SIZE);
    packet.set(command.slice(0, COMMAND_SIZE));
    await this.write(packet, "command");
    if (options.data !== undefined) {
      await this.write(options.data, "payload");
    }
    if (options.rxLength === undefined) {
      return new DataView(new ArrayBuffer(0));
    }
    return this.read(options.rxLength);
  }

  private async write(bytes: Uint8Array, what: string): Promise<void> {
    this.transferCount += 1;
    let result: UsbTransferOutResultLike;
    try {
      result = await withDeadline(
        () =>
          this.device.transferOut(
            this.probeType.outEndpoint,
            copyToArrayBuffer(bytes),
          ),
        `${what} write`,
        this.activeSignal,
        this.transferTimeout,
      );
    } catch (error: unknown) {
      if (error instanceof Stm32StlinkError) throw error;
      throw new Stm32StlinkError(
        "TRANSFER_FAILED",
        `ST-Link ${what} write failed: ${errorName(error) || "USB error"}`,
      );
    }
    if (
      result.status !== "ok" ||
      (result.bytesWritten ?? 0) !== bytes.byteLength
    ) {
      throw new Stm32StlinkError(
        "TRANSFER_FAILED",
        `ST-Link ${what} write transferred ${result.bytesWritten ?? 0} of ${bytes.byteLength} bytes (${result.status})`,
      );
    }
  }

  private async read(length: number): Promise<DataView> {
    let readSize = length;
    if (readSize < 64) readSize = 64;
    else if (readSize % 4 !== 0) readSize = (readSize + 3) & 0xffc;
    let result: UsbTransferInResultLike;
    try {
      result = await withDeadline(
        () => this.device.transferIn(this.probeType.inEndpoint, readSize),
        "answer read",
        this.activeSignal,
        this.transferTimeout,
      );
    } catch (error: unknown) {
      if (error instanceof Stm32StlinkError) throw error;
      throw new Stm32StlinkError(
        "TRANSFER_FAILED",
        `ST-Link answer read failed: ${errorName(error) || "USB error"}`,
      );
    }
    if (result.status !== "ok" || result.data === undefined) {
      throw new Stm32StlinkError(
        "TRANSFER_FAILED",
        `ST-Link answer read returned ${result.status}`,
      );
    }
    if (result.data.byteLength < length) {
      throw new Stm32StlinkError(
        "TRANSFER_FAILED",
        `ST-Link answered ${result.data.byteLength} bytes where ${length} were expected`,
      );
    }
    return new DataView(result.data.buffer, result.data.byteOffset, length);
  }

  /**
   * Issues a command whose answer carries an SWD status in byte 0, and checks
   * it. A WAIT (the debug port is momentarily busy) is retried a bounded number
   * of times; anything other than OK or WAIT is a fault the caller must see —
   * never silently accepted as success. The whole command is re-sent on WAIT
   * (each of these is idempotent: reading a register, or writing a value that
   * is written again), so this never re-runs an operation on a plain failure.
   */
  private async statusCommand(
    command: readonly number[] | Uint8Array,
    rxLength: number,
    what: string,
    data?: Uint8Array,
  ): Promise<DataView> {
    for (let attempt = 0; ; attempt += 1) {
      const rx = await this.xfer(command, { rxLength, data });
      const status = rx.getUint8(0);
      if (status === STLINK_STATUS_OK) return rx;
      const isWait =
        status === STLINK_STATUS_AP_WAIT || status === STLINK_STATUS_DP_WAIT;
      if (isWait && attempt < MAX_SWD_WAIT_RETRIES) {
        await sleep(SWD_WAIT_RETRY_MS, this.activeSignal);
        continue;
      }
      throw new Stm32StlinkError(
        isWait ? "SWD_WAIT" : "SWD_FAULT",
        isWait
          ? `ST-Link ${what} kept answering SWD WAIT (${hex8(status)}) after ${MAX_SWD_WAIT_RETRIES} retries`
          : `ST-Link ${what} failed with SWD status ${hex8(status)}`,
        { what, status: hex8(status) },
      );
    }
  }

  /**
   * The status the probe recorded for the last memory read or write. The debug
   * port can accept a memory command and only then fault on the bus, so the
   * transfer completing is not the same as the access succeeding; this reads
   * `GETLASTRWSTATUS2` and refuses a fault. (More than the pinned web-flasher
   * checks, which does not query it at all.)
   */
  private async assertLastRwOk(what: string): Promise<void> {
    const rx = await this.xfer([CMD_DEBUG, DEBUG_APIV2_GETLASTRWSTATUS2], {
      rxLength: 12,
    });
    const status = rx.getUint8(0);
    if (status === STLINK_STATUS_OK) return;
    const isWait =
      status === STLINK_STATUS_AP_WAIT || status === STLINK_STATUS_DP_WAIT;
    throw new Stm32StlinkError(
      isWait ? "SWD_WAIT" : "SWD_FAULT",
      `ST-Link ${what} left SWD status ${hex8(status)}`,
      { what, status: hex8(status) },
    );
  }

  public async readVersion(): Promise<void> {
    const rx = await this.xfer([CMD_GET_VERSION, 0x80], { rxLength: 6 });
    const version = rx.getUint16(0);
    const stlinkVersion = (version >> 12) & 0x0f;
    const jtagVersion = (version >> 6) & 0x3f;
    const minor = version & 0x3f;
    this.jtagVersion = jtagVersion;
    this.versionString = `${this.probeType.version} V${stlinkVersion}J${jtagVersion}${
      this.probeType.version === "V2" ? `S${minor}` : `M${minor}`
    }`;
    // JTAG API v1 (J11 and older) has none of the commands used below, and
    // the official flasher refuses anything older than J21 as well.
    if (jtagVersion <= 11 || jtagVersion < 21) {
      throw new Stm32StlinkError(
        "PROBE_FIRMWARE_OLD",
        `ST-Link ${this.versionString} firmware is too old; update it with STM32CubeProgrammer first`,
        { probe: this.versionString },
      );
    }
  }

  public async leaveState(): Promise<void> {
    const rx = await this.xfer([CMD_GET_CURRENT_MODE], { rxLength: 2 });
    const state = rx.getUint8(0);
    if (state === MODE_DFU) await this.xfer([CMD_DFU, DFU_EXIT]);
    else if (state === MODE_DEBUG) await this.xfer([CMD_DEBUG, DEBUG_EXIT]);
    else if (state === MODE_SWIM) await this.xfer([CMD_SWIM, SWIM_EXIT]);
  }

  public async readTargetVoltage(): Promise<number | null> {
    const rx = await this.xfer([CMD_GET_TARGET_VOLTAGE], { rxLength: 8 });
    const a0 = rx.getUint32(0, true);
    const a1 = rx.getUint32(4, true);
    this.targetVoltage = a0 === 0 ? null : (2 * a1 * 1.2) / a0;
    return this.targetVoltage;
  }

  public async setSwdFrequency(): Promise<void> {
    await this.statusCommand(
      [CMD_DEBUG, DEBUG_APIV2_SWD_SET_FREQ, SWD_FREQ_1800KHZ_DIVISOR],
      2,
      "SWD frequency",
    );
  }

  public async enterSwd(): Promise<void> {
    await this.statusCommand(
      [CMD_DEBUG, DEBUG_APIV2_ENTER, DEBUG_ENTER_SWD],
      2,
      "enter SWD",
    );
  }

  public async exitDebug(): Promise<void> {
    await this.xfer([CMD_DEBUG, DEBUG_EXIT]);
  }

  public async readCoreId(): Promise<number> {
    const rx = await this.xfer([CMD_DEBUG, DEBUG_READCOREID], { rxLength: 4 });
    return rx.getUint32(0, true);
  }

  /** The macOS parity workaround pystlink carries: an even number of transfers. */
  public async cleanExit(): Promise<void> {
    if ((this.transferCount & 1) !== 0) {
      await this.xfer([CMD_GET_CURRENT_MODE], { rxLength: 2 });
    }
  }

  public async readDebugReg32(address: number): Promise<number> {
    const command = new Uint8Array(6);
    const view = new DataView(command.buffer);
    view.setUint8(0, CMD_DEBUG);
    view.setUint8(1, DEBUG_APIV2_READDEBUGREG);
    view.setUint32(2, address >>> 0, true);
    const rx = await this.statusCommand(command, 8, "read debug register");
    return rx.getUint32(4, true);
  }

  public async readDebugReg16(address: number): Promise<number> {
    const word = await this.readDebugReg32(address & 0xfffffffc);
    return (address % 4 === 0 ? word : word >>> 16) & 0xffff;
  }

  public async writeDebugReg32(address: number, value: number): Promise<void> {
    const command = new Uint8Array(10);
    const view = new DataView(command.buffer);
    view.setUint8(0, CMD_DEBUG);
    view.setUint8(1, DEBUG_APIV2_WRITEDEBUGREG);
    view.setUint32(2, address >>> 0, true);
    view.setUint32(6, value >>> 0, true);
    await this.statusCommand(command, 2, "write debug register");
  }

  public async readReg(register: number): Promise<number> {
    const rx = await this.statusCommand(
      [CMD_DEBUG, DEBUG_APIV2_READREG, register],
      8,
      "read core register",
    );
    return rx.getUint32(4, true);
  }

  public async writeReg(register: number, value: number): Promise<void> {
    const command = new Uint8Array(7);
    const view = new DataView(command.buffer);
    view.setUint8(0, CMD_DEBUG);
    view.setUint8(1, DEBUG_APIV2_WRITEREG);
    view.setUint8(2, register);
    view.setUint32(3, value >>> 0, true);
    await this.statusCommand(command, 2, "write core register");
  }

  public async readMem32(address: number, length: number): Promise<Uint8Array> {
    if (address % 4 !== 0 || length % 4 !== 0 || length > MAX_TRANSFER_SIZE) {
      throw new Stm32StlinkError(
        "RANGE_INVALID",
        "ST-Link 32-bit memory read needs a word-aligned address and length up to 1024",
      );
    }
    const command = new Uint8Array(10);
    const view = new DataView(command.buffer);
    view.setUint8(0, CMD_DEBUG);
    view.setUint8(1, DEBUG_READMEM_32BIT);
    view.setUint32(2, address >>> 0, true);
    view.setUint32(6, length, true);
    const rx = await this.xfer(command, { rxLength: length });
    const bytes = new Uint8Array(
      rx.buffer,
      rx.byteOffset,
      rx.byteLength,
    ).slice();
    await this.assertLastRwOk("32-bit memory read");
    return bytes;
  }

  public async writeMem32(address: number, data: Uint8Array): Promise<void> {
    if (
      address % 4 !== 0 ||
      data.byteLength % 4 !== 0 ||
      data.byteLength > MAX_TRANSFER_SIZE
    ) {
      throw new Stm32StlinkError(
        "RANGE_INVALID",
        "ST-Link 32-bit memory write needs a word-aligned address and length up to 1024",
      );
    }
    const command = new Uint8Array(10);
    const view = new DataView(command.buffer);
    view.setUint8(0, CMD_DEBUG);
    view.setUint8(1, DEBUG_WRITEMEM_32BIT);
    view.setUint32(2, address >>> 0, true);
    view.setUint32(6, data.byteLength, true);
    await this.xfer(command, { data });
    await this.assertLastRwOk("32-bit memory write");
  }

  public async writeMem8(address: number, data: Uint8Array): Promise<void> {
    if (data.byteLength > MAX_8BIT_TRANSFER_SIZE) {
      throw new Stm32StlinkError(
        "RANGE_INVALID",
        "ST-Link 8-bit memory write is limited to 64 bytes",
      );
    }
    const command = new Uint8Array(10);
    const view = new DataView(command.buffer);
    view.setUint8(0, CMD_DEBUG);
    view.setUint8(1, DEBUG_WRITEMEM_8BIT);
    view.setUint32(2, address >>> 0, true);
    view.setUint32(6, data.byteLength, true);
    await this.xfer(command, { data });
    await this.assertLastRwOk("8-bit memory write");
  }
}

// ---- MCU detection ---------------------------------------------------------

export interface DetectedStm32 {
  readonly core: string;
  readonly devId: number;
  readonly type: string;
  readonly flashKb: number;
  readonly sramKb: number;
  readonly pageBytes: number;
}

/**
 * The official `fix_cpu_type`: the tenth character of a full part number is
 * the package code, which the detected type does not carry.
 */
export function normalizeExpectedCpuType(cpuType: string): string {
  const upper = cpuType.trim().toLocaleUpperCase("en-US");
  if (!upper.startsWith("STM32")) return upper;
  if (upper.length > 9) return `${upper.slice(0, 9)}x${upper.slice(10)}`;
  return upper;
}

function expectedCpuTypes(target: OfficialTarget): readonly string[] {
  const metadata = target.config.raw.stlink;
  const cpus = isRecord(metadata) ? metadata.cpus : null;
  if (
    !Array.isArray(cpus) ||
    cpus.length === 0 ||
    !cpus.every((cpu) => typeof cpu === "string")
  ) {
    throw new Stm32StlinkError(
      "DEVICE_INVALID",
      "Selected Target does not declare which STM32 parts its ST-Link route may program",
    );
  }
  return cpus.map((cpu) => cpu.trim()).filter((cpu) => cpu.length > 0);
}

function expectedApplicationAddress(target: OfficialTarget): number {
  const metadata = target.config.raw.stlink;
  const rawOffset = isRecord(metadata) ? metadata.offset : null;
  if (
    typeof rawOffset !== "string" ||
    !/^0[xX][0-9A-Fa-f]{1,8}$/u.test(rawOffset)
  ) {
    throw new Stm32StlinkError(
      "DEVICE_INVALID",
      "Selected Target does not declare a verified STM32 application offset",
    );
  }
  const offset = Number.parseInt(rawOffset.slice(2), 16);
  if (!VERIFIED_APPLICATION_OFFSETS.has(offset)) {
    throw new Stm32StlinkError(
      "DEVICE_INVALID",
      "Selected Target declares an unsupported STM32 application offset",
    );
  }
  return STM32_FLASH_BASE_ADDRESS + offset;
}

async function detectMcu(
  probe: StlinkProbe,
  expected: readonly string[],
): Promise<DetectedStm32> {
  const cpuid = await probe.readDebugReg32(CPUID_REG);
  if (cpuid === 0) {
    throw new Stm32StlinkError(
      "CPU_NOT_CONNECTED",
      "The ST-Link is not connected to a CPU (CPUID reads as zero)",
    );
  }
  const partNumber = (cpuid >>> 4) & 0xfff;
  const core = CORE_IDCODE_REGISTERS.get(partNumber);
  if (core === undefined) {
    throw new Stm32StlinkError(
      "CPU_UNSUPPORTED",
      `The connected core (PART_NO 0x${partNumber.toString(16)}) is not one this route can program`,
      { partNumber: `0x${partNumber.toString(16)}` },
    );
  }
  const idcode = await probe.readDebugReg32(core.idcodeReg);
  const devId = idcode & 0xfff;
  const family = MCU_FAMILIES.find((candidate) => candidate.devId === devId);
  if (family === undefined) {
    throw new Stm32StlinkError(
      "CPU_UNSUPPORTED",
      `The connected ${core.name} with DEV_ID 0x${devId.toString(16)} is not one this route can program`,
      { core: core.name, devId: `0x${devId.toString(16)}` },
    );
  }
  const flashKb = await probe.readDebugReg16(family.flashSizeReg);
  const bySize = family.variants.filter(
    (variant) => variant.flashKb === flashKb,
  );
  if (bySize.length === 0) {
    throw new Stm32StlinkError(
      "CPU_UNSUPPORTED",
      `The connected ${core.name} (DEV_ID 0x${devId.toString(16)}) reports ${flashKb} KB of flash, which no known variant has`,
      {
        core: core.name,
        devId: `0x${devId.toString(16)}`,
        flashKb: String(flashKb),
      },
    );
  }
  const normalizedExpected = expected.map(normalizeExpectedCpuType);
  const matching = bySize.filter((variant) =>
    normalizedExpected.some((cpu) => cpu.startsWith(variant.type)),
  );
  if (matching.length === 0) {
    throw new Stm32StlinkError(
      "CPU_MISMATCH",
      `The Target is for ${expected.join(", ")} but the connected part is ${bySize.map((variant) => variant.type).join(" or ")}`,
      {
        expected: expected.join(", "),
        detected: bySize.map((variant) => variant.type).join(" or "),
      },
    );
  }
  if (family.pageBytes === null) {
    throw new Stm32StlinkError(
      "CPU_UNSUPPORTED",
      `${matching.map((variant) => variant.type).join("/")} flash programming is not implemented in this route (nor in the pinned official flasher)`,
      { detected: matching.map((variant) => variant.type).join("/") },
    );
  }
  // With several variants left, take the smallest SRAM, as the official does.
  const chosen = [...matching].sort(
    (left, right) => left.sramKb - right.sramKb,
  )[0];
  if (chosen === undefined) {
    throw new Stm32StlinkError("CPU_UNSUPPORTED", "No matching STM32 variant");
  }
  return Object.freeze({
    core: core.name,
    devId,
    type: chosen.type,
    flashKb,
    sramKb: chosen.sramKb,
    pageBytes: family.pageBytes,
  });
}

// ---- flash programming (F0/F1/F3 page interface) ---------------------------

/**
 * What the driver knows about the flash controller's LOCK bit, tracked by
 * intent rather than by a flag set after an await. A boolean that only turns
 * "unlocked" once a read-back has confirmed it cannot describe the window in
 * which the keys have reached the part but the read-back was cancelled — and a
 * cleanup that consults such a flag then sees nothing to re-lock while the
 * flash is open. So the state moves to MAYBE_UNLOCKED the moment the keys are
 * about to go out, and only a verified re-lock moves it back to LOCKED. Any
 * state but LOCKED means the cleanup must re-lock and read it back, or report
 * the cleanup as unconfirmed and keep the recovery journal.
 */
type FlashLockState = "LOCKED" | "MAYBE_UNLOCKED" | "UNLOCKED";

class FlashController {
  public lockState: FlashLockState = "LOCKED";

  public constructor(
    private readonly probe: StlinkProbe,
    private readonly signal: AbortSignal | undefined,
  ) {}

  public async resetHalt(): Promise<void> {
    await this.probe.writeDebugReg32(DHCSR_REG, DHCSR_HALT);
    await this.probe.writeDebugReg32(DEMCR_REG, DEMCR_HALT_AFTER_RESET);
    await this.probe.writeDebugReg32(AIRCR_REG, AIRCR_SYSRESETREQ);
    await this.probe.readDebugReg32(AIRCR_REG);
  }

  public async resetRun(): Promise<void> {
    await this.probe.writeDebugReg32(DEMCR_REG, DEMCR_RUN_AFTER_RESET);
    await this.probe.writeDebugReg32(AIRCR_REG, AIRCR_SYSRESETREQ);
    await this.probe.readDebugReg32(AIRCR_REG);
  }

  public async unlock(): Promise<void> {
    await this.resetHalt();
    let control = await this.probe.readDebugReg32(FLASH_CR_REG);
    // From here the flash may be open even if the very next transfer or the
    // read-back below is cancelled: the keys are on their way, or the part
    // was already open. Marked before the first key, never after a read-back
    // that may not complete.
    this.lockState = "MAYBE_UNLOCKED";
    if ((control & FLASH_CR_LOCK) !== 0) {
      await this.probe.writeDebugReg32(FLASH_KEYR_REG, FLASH_KEY1);
      await this.probe.writeDebugReg32(FLASH_KEYR_REG, FLASH_KEY2);
    }
    control = await this.probe.readDebugReg32(FLASH_CR_REG);
    if ((control & FLASH_CR_LOCK) !== 0) {
      throw new Stm32StlinkError(
        "FLASH_LOCKED",
        "The flash controller stayed locked after the unlock keys",
      );
    }
    this.lockState = "UNLOCKED";
  }

  public async lock(): Promise<void> {
    // LOCKED means "a read-back showed LOCK set", on the happy path too: a
    // lock write that merely returned is not a confirmed lock. An interruption
    // or a read-back that shows the flash still open leaves MAYBE_UNLOCKED, so
    // the cleanup re-locks and confirms rather than trusting an unseen write —
    // and the operation is not reported as a success nor reset into.
    await this.relockAndVerify();
    await this.resetHalt();
  }

  /**
   * Locks the flash and reads the control register back to prove it: LOCK
   * set, and no erase or program bit left standing (a cancel mid-erase leaves
   * CR at PER|STRT). Used both at the end of a verified write and by the
   * cleanup after a cancelled or failed one. Throws if the lock cannot be
   * confirmed, so the caller reports it (and the cleanup as unverified) rather
   * than assuming a safe device. No reset here: a partially written image is
   * not booted by the cleanup.
   */
  public async relockAndVerify(): Promise<void> {
    await this.probe.writeDebugReg32(FLASH_CR_REG, FLASH_CR_LOCK);
    const control = await this.probe.readDebugReg32(FLASH_CR_REG);
    const locked = (control & FLASH_CR_LOCK) !== 0;
    const idle = (control & (FLASH_CR_PER | FLASH_CR_STRT | FLASH_CR_PG)) === 0;
    // Only a read-back that shows LOCK set and no erase/program bit standing
    // counts as locked; anything else stays "maybe open" so it is reported.
    this.lockState = locked && idle ? "LOCKED" : "MAYBE_UNLOCKED";
    if (!locked || !idle) {
      throw new Stm32StlinkError(
        "FLASH_NOT_LOCKED",
        `The flash controller did not report LOCK after the lock write (CR ${hex32(control)})`,
        { control: hex32(control) },
      );
    }
  }

  private async endOfOperation(status: number): Promise<void> {
    if (status !== FLASH_SR_EOP) {
      throw new Stm32StlinkError(
        "FLASH_ERROR",
        `The flash controller reported status ${hex32(status)} instead of end-of-operation`,
        { status: hex32(status) },
      );
    }
    await this.probe.writeDebugReg32(FLASH_SR_REG, status);
  }

  private async waitNotBusy(waitMs: number): Promise<void> {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const status = await this.probe.readDebugReg32(FLASH_SR_REG);
      if ((status & FLASH_SR_BSY) === 0) {
        await this.endOfOperation(status);
        return;
      }
      if (Date.now() >= deadline) {
        throw new Stm32StlinkError(
          "TIMEOUT",
          "The flash controller stayed busy past its deadline",
        );
      }
      await sleep(POLL_INTERVAL_MS, this.signal);
    }
  }

  public async erasePage(pageAddress: number): Promise<void> {
    await this.probe.writeDebugReg32(FLASH_CR_REG, FLASH_CR_PER);
    await this.probe.writeDebugReg32(FLASH_AR_REG, pageAddress);
    await this.probe.writeDebugReg32(
      FLASH_CR_REG,
      FLASH_CR_PER | FLASH_CR_STRT,
    );
    await this.waitNotBusy(ERASE_WAIT_MS);
  }

  public async loadWriter(): Promise<void> {
    await this.probe.writeMem8(
      FLASH_WRITER_OFFSET,
      new Uint8Array(FLASH_WRITER_CODE),
    );
    await this.probe.writeReg(REG_R4, FLASH_SR_REG);
    await this.probe.writeReg(REG_R5, FLASH_SR_BSY);
    await this.probe.writeReg(REG_R6, FLASH_SR_EOP);
    await this.probe.writeDebugReg32(FLASH_CR_REG, FLASH_CR_PG);
  }

  public async writeBlock(address: number, block: Uint8Array): Promise<void> {
    await this.probe.writeMem32(FLASH_DATA_OFFSET, block);
    await this.probe.writeReg(REG_PC, FLASH_WRITER_OFFSET);
    await this.probe.writeReg(REG_R0, FLASH_DATA_OFFSET);
    await this.probe.writeReg(REG_R1, address);
    await this.probe.writeReg(REG_R2, block.byteLength);
    await this.probe.writeDebugReg32(DHCSR_REG, DHCSR_DEBUGEN);
    const deadline = Date.now() + WRITER_WAIT_MS;
    for (;;) {
      const dhcsr = await this.probe.readDebugReg32(DHCSR_REG);
      if ((dhcsr & DHCSR_STATUS_LOCKUP_BIT) !== 0) {
        throw new Stm32StlinkError(
          "FLASH_ERROR",
          "The on-core flash writer locked up",
          { status: hex32(dhcsr) },
        );
      }
      if ((dhcsr & DHCSR_STATUS_HALT_BIT) !== 0) break;
      if (Date.now() >= deadline) {
        throw new Stm32StlinkError(
          "TIMEOUT",
          "The on-core flash writer did not reach its breakpoint in time",
        );
      }
      await sleep(POLL_INTERVAL_MS, this.signal);
    }
    const status = await this.probe.readDebugReg32(FLASH_SR_REG);
    await this.endOfOperation(status);
  }
}

// ---- the operation ---------------------------------------------------------

export interface Stm32StlinkWriteResult {
  readonly bytesWritten: number;
  readonly baseAddress: number;
  readonly cleanupVerified: boolean;
  /** `"V2"` or `"V2-1"` plus the probe's own version string. */
  readonly probe: string;
  readonly mcu: DetectedStm32;
  readonly targetVoltage: number | null;
  /** Every programmed byte was read back over SWD and compared. */
  readonly readBackVerified: true;
  readonly verification: "SWD_READ_BACK_MATCHED";
}

function progress(
  listener: FirmwareFlashProgressListener | undefined,
  stage: Parameters<FirmwareFlashProgressListener>[0]["stage"],
  writtenBytes: number,
  totalBytes: number,
  detail: string,
): void {
  listener?.({ stage, writtenBytes, totalBytes, detail });
}

function pagesOverlapping(
  address: number,
  length: number,
  pageBytes: number,
): readonly number[] {
  const pages: number[] = [];
  const first = address - ((address - FLASH_START) % pageBytes);
  for (let page = first; page < address + length; page += pageBytes) {
    pages.push(page);
  }
  return pages;
}

export async function flashStm32StlinkFirmware(input: {
  readonly target: OfficialTarget;
  readonly segment: FirmwareSegment;
  readonly signal?: AbortSignal;
  readonly navigatorObject?: unknown;
  readonly onProgress?: FirmwareFlashProgressListener;
}): Promise<Readonly<Stm32StlinkWriteResult>> {
  const platform = input.target.config.platform.toLocaleLowerCase("en-US");
  if (!platform.startsWith("stm32")) {
    throw new Stm32StlinkError(
      "DEVICE_INVALID",
      "Selected Target is not an STM32 device",
    );
  }
  if (!input.target.config.uploadMethods.includes("stlink")) {
    throw new Stm32StlinkError(
      "DEVICE_INVALID",
      "Selected Target does not advertise the ST-Link route",
    );
  }
  const expected = expectedCpuTypes(input.target);
  if (
    input.segment.bytes.byteLength < 1 ||
    input.segment.bytes.byteLength > MAX_FIRMWARE_BYTES
  ) {
    throw new Stm32StlinkError(
      "RANGE_INVALID",
      "STM32 firmware size is outside the 1-byte to 4-MiB limit",
    );
  }
  const baseAddress = expectedApplicationAddress(input.target);
  if (input.segment.address !== baseAddress) {
    throw new Stm32StlinkError(
      "RANGE_INVALID",
      "STM32 firmware address does not match the selected Target application offset",
    );
  }
  assertNotAborted(input.signal);

  const navigatorObject =
    input.navigatorObject ??
    (typeof navigator === "undefined" ? undefined : navigator);
  if (navigatorObject === null || typeof navigatorObject !== "object") {
    throw new Stm32StlinkError("UNSUPPORTED", "WebUSB is unavailable");
  }
  let usb: UsbApiLike | undefined;
  try {
    usb = (navigatorObject as NavigatorWithUsbLike).usb;
  } catch {
    usb = undefined;
  }
  if (usb === undefined || typeof usb.requestDevice !== "function") {
    throw new Stm32StlinkError("UNSUPPORTED", "WebUSB is unavailable");
  }

  let device: UsbStlinkDeviceLike;
  try {
    device = await usb.requestDevice({
      filters: [
        ...PROBE_TYPES.map((probe) => ({
          vendorId: STLINK_VENDOR_ID,
          productId: probe.productId,
        })),
        ...[...OTHER_STLINK_PRODUCT_IDS.keys()].map((productId) => ({
          vendorId: STLINK_VENDOR_ID,
          productId,
        })),
      ],
    });
  } catch (error: unknown) {
    const name = errorName(error);
    if (name === "NotFoundError" || name === "AbortError") {
      throw new Stm32StlinkError("CANCELLED", "No ST-Link probe was selected");
    }
    throw new Stm32StlinkError(
      "DEVICE_INVALID",
      "The ST-Link device chooser failed",
    );
  }
  const probeType = PROBE_TYPES.find(
    (candidate) =>
      device.vendorId === STLINK_VENDOR_ID &&
      device.productId === candidate.productId,
  );
  if (probeType === undefined) {
    const other = OTHER_STLINK_PRODUCT_IDS.get(device.productId);
    throw new Stm32StlinkError(
      "PROBE_UNSUPPORTED",
      other === undefined
        ? `The selected USB device (${hex32(device.vendorId).slice(-4)}:${hex32(device.productId).slice(-4)}) is not an ST-Link/V2 or V2-1`
        : `ST-Link/${other} probes are not supported by this route (nor by the pinned official flasher); use an ST-Link/V2 or V2-1`,
      { probe: other ?? "unknown" },
    );
  }

  const totalBytes = input.segment.bytes.byteLength;
  const probe = new StlinkProbe(device, probeType, input.signal);
  const flash = new FlashController(probe, input.signal);
  let claimed = false;
  let inDebug = false;
  let completion: {
    bytesWritten: number;
    baseAddress: number;
    cleanupVerified: boolean;
    probe: string;
    mcu: DetectedStm32;
    targetVoltage: number | null;
    readBackVerified: true;
    verification: "SWD_READ_BACK_MATCHED";
  } | null = null;
  let operationFailure: unknown = null;
  // What the post-failure cleanup managed to confirm, kept per step.
  let flashRelocked = "n/a";
  let debugExited = "n/a";

  try {
    progress(
      input.onProgress,
      "BOOTLOADER",
      0,
      totalBytes,
      "Opening the ST-Link probe",
    );
    await withDeadline(() => device.open(), "open", input.signal);
    if (device.configuration?.configurationValue !== 1) {
      await withDeadline(
        () => device.selectConfiguration(1),
        "configuration",
        input.signal,
      );
    }
    await withDeadline(() => device.claimInterface(0), "claim", input.signal);
    claimed = true;
    await withDeadline(
      () => device.selectAlternateInterface(0, 0),
      "alternate",
      input.signal,
    );

    await probe.readVersion();
    await probe.leaveState();
    const voltage = await probe.readTargetVoltage();
    if (probe.jtagVersion >= 22) await probe.setSwdFrequency();
    // Noted before the command goes out, not after it returns: a cancel that
    // lands once enter-SWD has been sent leaves the probe in debug either way,
    // and the cleanup must then leave it — which DEBUG_EXIT does harmlessly
    // if the probe never got there.
    inDebug = true;
    await probe.enterSwd();
    const coreId = await probe.readCoreId();
    if (coreId === 0) {
      throw new Stm32StlinkError(
        "CPU_NOT_CONNECTED",
        "The ST-Link reports no core on SWD; check SWDIO, SWCLK, GND and power",
      );
    }
    progress(
      input.onProgress,
      "BOOTLOADER",
      0,
      totalBytes,
      `ST-Link ${probe.versionString} connected; target supply ${voltage === null ? "unknown" : `${voltage.toFixed(2)} V`}`,
    );
    const mcu = await detectMcu(probe, expected);
    progress(
      input.onProgress,
      "BOOTLOADER",
      0,
      totalBytes,
      `Detected ${mcu.type} (${mcu.core}, ${mcu.flashKb} KB flash, ${mcu.sramKb} KB SRAM)`,
    );
    if (baseAddress + totalBytes > FLASH_START + mcu.flashKb * 1024) {
      throw new Stm32StlinkError(
        "RANGE_INVALID",
        `The image (${totalBytes} bytes at ${hex32(baseAddress)}) does not fit the ${mcu.flashKb} KB flash`,
      );
    }
    if (voltage === null || voltage < MINIMUM_PROGRAMMING_VOLTAGE) {
      throw new Stm32StlinkError(
        "TARGET_VOLTAGE_LOW",
        `The target supply is ${voltage === null ? "unknown" : `${voltage.toFixed(2)} V`}; flash programming needs at least ${MINIMUM_PROGRAMMING_VOLTAGE.toFixed(1)} V`,
        { voltage: voltage === null ? "unknown" : voltage.toFixed(2) },
      );
    }

    await flash.unlock();
    const pages = pagesOverlapping(baseAddress, totalBytes, mcu.pageBytes);
    progress(
      input.onProgress,
      "ERASE",
      0,
      totalBytes,
      `Erasing ${pages.length} flash page(s) of ${mcu.pageBytes} bytes from ${hex32(pages[0] ?? baseAddress)}`,
    );
    for (const page of pages) {
      assertNotAborted(input.signal);
      await flash.erasePage(page);
    }

    await flash.loadWriter();
    const padded = new Uint8Array(Math.ceil(totalBytes / 4) * 4).fill(0xff);
    padded.set(input.segment.bytes);
    for (
      let offset = 0;
      offset < padded.byteLength;
      offset += MAX_TRANSFER_SIZE
    ) {
      assertNotAborted(input.signal);
      const block = padded.subarray(
        offset,
        Math.min(offset + MAX_TRANSFER_SIZE, padded.byteLength),
      );
      // Erased flash already reads as 0xFF; such a block is not written.
      if (!block.every((byte) => byte === 0xff)) {
        await flash.writeBlock(baseAddress + offset, block);
      }
      progress(
        input.onProgress,
        "WRITE",
        Math.min(offset + block.byteLength, totalBytes),
        totalBytes,
        `Programmed ${hex32(baseAddress + offset)}`,
      );
    }

    for (
      let offset = 0;
      offset < padded.byteLength;
      offset += MAX_TRANSFER_SIZE
    ) {
      assertNotAborted(input.signal);
      const expectedBlock = padded.subarray(
        offset,
        Math.min(offset + MAX_TRANSFER_SIZE, padded.byteLength),
      );
      const observed = await probe.readMem32(
        baseAddress + offset,
        expectedBlock.byteLength,
      );
      if (
        observed.byteLength !== expectedBlock.byteLength ||
        expectedBlock.some((byte, index) => observed[index] !== byte)
      ) {
        throw new Stm32StlinkError(
          "VERIFY_FAILED",
          `SWD read-back mismatch at ${hex32(baseAddress + offset)}`,
          { address: hex32(baseAddress + offset) },
        );
      }
      progress(
        input.onProgress,
        "VERIFY",
        Math.min(offset + expectedBlock.byteLength, totalBytes),
        totalBytes,
        `Read back ${hex32(baseAddress + offset)} over SWD and compared`,
      );
    }

    await flash.lock();
    progress(
      input.onProgress,
      "RESET",
      totalBytes,
      totalBytes,
      "Resetting the core into the new firmware",
    );
    await flash.resetRun();
    await probe.exitDebug();
    inDebug = false;
    await probe.cleanExit();
    completion = {
      bytesWritten: totalBytes,
      baseAddress,
      cleanupVerified: true,
      probe: probe.versionString,
      mcu,
      targetVoltage: voltage,
      readBackVerified: true,
      verification: "SWD_READ_BACK_MATCHED",
    };
    return completion;
  } catch (error: unknown) {
    operationFailure = error;
    // Cleanup runs on its own budget, never the operation's signal: after a
    // cancel that signal is already aborted, and every cleanup transfer would
    // be rejected before it was sent — which left the flash unlocked mid-erase
    // (CR at PER|STRT) while we still reported the cleanup as verified.
    probe.beginCleanup();
    // Re-lock the flash and confirm it whenever it may be open — not only
    // when a read-back had confirmed it open, since a cancel can land between
    // the keys reaching the part and that read-back. "n/a" below therefore
    // means the keys never went out at all.
    if (flash.lockState !== "LOCKED") {
      const relocked = await settleCleanupWithin(() => flash.relockAndVerify());
      flashRelocked = relocked ? "yes" : "no";
      if (!relocked) markCleanupUnverified(operationFailure);
    }
    // Leaving debug is a separate step from re-locking the flash.
    if (inDebug) {
      const exited = await settleCleanupWithin(() => probe.exitDebug());
      debugExited = exited ? "yes" : "no";
      if (!exited) markCleanupUnverified(operationFailure);
    }
    throw error;
  } finally {
    // Closing USB is a third, separate step; move to the cleanup budget so a
    // hung transfer is bounded even though release/close do not use the signal.
    probe.beginCleanup();
    let usbReleased = "n/a";
    if (claimed) {
      const released = await settleCleanupWithin(() =>
        device.releaseInterface(0),
      );
      usbReleased = released ? "yes" : "no";
      if (!released) {
        if (completion !== null) completion.cleanupVerified = false;
        else markCleanupUnverified(operationFailure);
      }
    }
    const closed =
      !device.opened || (await settleCleanupWithin(() => device.close()));
    const usbClosed = closed ? "yes" : "no";
    if (!closed) {
      if (completion !== null) completion.cleanupVerified = false;
      else markCleanupUnverified(operationFailure);
    }
    if (operationFailure instanceof Stm32StlinkError) {
      operationFailure.cleanupSteps = Object.freeze({
        flashRelocked,
        debugExited,
        usbReleased,
        usbClosed,
      });
    }
    if (completion !== null) Object.freeze(completion);
  }
}
