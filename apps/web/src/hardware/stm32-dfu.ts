import { copyToArrayBuffer, isAbortRequested } from "./byte-utils";
import type {
  FirmwareFlashProgressListener,
  FirmwareSegment,
  OfficialTarget,
} from "./parity-types";

const STM32_DFU_VENDOR_ID = 0x0483;
const STM32_DFU_PRODUCT_ID = 0xdf11;
const DEFAULT_TRANSFER_SIZE = 2_048;
const MAX_FIRMWARE_BYTES = 4 * 1024 * 1024;
const TRANSFER_TIMEOUT_MS = 10_000;
const CLEANUP_TIMEOUT_MS = 2_000;
const STM32_FLASH_BASE_ADDRESS = 0x0800_0000;
const VERIFIED_APPLICATION_OFFSETS = new Set([0x1000, 0x4000, 0x8000]);

const DfuRequest = Object.freeze({
  download: 1,
  upload: 2,
  getStatus: 3,
  clearStatus: 4,
  abort: 6,
});

const DfuState = Object.freeze({
  idle: 2,
  downloadSync: 3,
  downloadBusy: 4,
  downloadIdle: 5,
  manifestSync: 6,
  manifest: 7,
  manifestWaitReset: 8,
  uploadIdle: 9,
  error: 10,
});

export interface DfuSePage {
  readonly start: number;
  readonly size: number;
  readonly readable: boolean;
  readonly erasable: boolean;
  readonly writable: boolean;
}

export interface DfuSeMemoryMap {
  readonly name: string;
  readonly baseAddress: number;
  readonly pages: readonly DfuSePage[];
}

interface UsbAlternateLike {
  readonly alternateSetting: number;
  readonly interfaceClass: number;
  readonly interfaceSubclass: number;
  readonly interfaceProtocol: number;
  readonly interfaceName?: string;
}

interface UsbInterfaceLike {
  readonly interfaceNumber: number;
  readonly alternates: readonly UsbAlternateLike[];
}

interface UsbConfigurationLike {
  readonly configurationValue: number;
  readonly interfaces: readonly UsbInterfaceLike[];
}

interface UsbControlTransferSetupLike {
  readonly requestType: "class";
  readonly recipient: "interface";
  readonly request: number;
  readonly value: number;
  readonly index: number;
}

interface UsbTransferOutResultLike {
  readonly status: "ok" | "stall" | "babble";
  readonly bytesWritten?: number;
}

interface UsbTransferInResultLike {
  readonly status: "ok" | "stall" | "babble";
  readonly data?: DataView;
}

export interface UsbDfuDeviceLike {
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
  readonly configuration: UsbConfigurationLike | null;
  readonly configurations: readonly UsbConfigurationLike[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(
    interfaceNumber: number,
    alternateSetting: number,
  ): Promise<void>;
  controlTransferOut(
    setup: UsbControlTransferSetupLike,
    data?: BufferSource,
  ): Promise<UsbTransferOutResultLike>;
  controlTransferIn(
    setup: UsbControlTransferSetupLike,
    length: number,
  ): Promise<UsbTransferInResultLike>;
}

interface UsbApiLike {
  requestDevice(options: {
    readonly filters: readonly Readonly<{
      readonly vendorId: number;
      readonly productId: number;
    }>[];
  }): Promise<UsbDfuDeviceLike>;
}

interface NavigatorWithUsbLike {
  readonly usb?: UsbApiLike;
}

export class Stm32DfuError extends Error {
  public cleanupVerified = true;

  public constructor(
    public readonly code:
      | "UNSUPPORTED"
      | "CANCELLED"
      | "DEVICE_INVALID"
      | "RANGE_INVALID"
      | "TRANSFER_FAILED"
      | "TIMEOUT"
      | "VERIFY_FAILED"
      | "ABORTED",
    message: string,
  ) {
    super(message);
    this.name = "Stm32DfuError";
  }
}

function markCleanupUnverified(error: unknown): void {
  if (error instanceof Stm32DfuError) {
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
    // The primary failure still causes the caller to enter recovery mode.
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

function expectedApplicationAddress(target: OfficialTarget): number {
  const metadata = target.config.raw.stlink;
  const rawOffset = isRecord(metadata) ? metadata.offset : null;
  if (
    typeof rawOffset !== "string" ||
    !/^0[xX][0-9A-Fa-f]{1,8}$/u.test(rawOffset)
  ) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "Selected Target does not declare a verified STM32 application offset",
    );
  }
  const offset = Number.parseInt(rawOffset.slice(2), 16);
  if (!VERIFIED_APPLICATION_OFFSETS.has(offset)) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "Selected Target declares an unsupported STM32 application offset",
    );
  }
  return STM32_FLASH_BASE_ADDRESS + offset;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (isAbortRequested(signal)) {
    throw new Stm32DfuError("ABORTED", "STM32 DFU flashing was cancelled");
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Stm32DfuError("TIMEOUT", message)),
          TRANSFER_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function settleCleanupWithin(
  operation: () => Promise<unknown>,
  timeoutMs = CLEANUP_TIMEOUT_MS,
): Promise<boolean> {
  let task: Promise<unknown>;
  try {
    task = operation();
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (verified: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(verified);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    void task.then(
      () => finish(true),
      () => finish(false),
    );
  });
}

function safeNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "DfuSe memory descriptor contains an invalid page count or size",
    );
  }
  return parsed;
}

function unitMultiplier(unit: string): number {
  switch (unit.toLocaleUpperCase("en-US")) {
    case "B":
      return 1;
    case "K":
      return 1024;
    case "M":
      return 1024 * 1024;
    default:
      throw new Stm32DfuError(
        "DEVICE_INVALID",
        `DfuSe memory descriptor uses unsupported unit ${unit}`,
      );
  }
}

export function parseDfuSeMemoryDescriptor(descriptor: string): DfuSeMemoryMap {
  if (typeof descriptor !== "string" || descriptor.length > 2_048) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "DfuSe memory descriptor is missing or too long",
    );
  }
  const match = /^@([^/]{1,240})\s*\/\s*0x([0-9a-f]{8})\s*\/\s*(.+)$/iu.exec(
    descriptor.trim(),
  );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "DfuSe memory descriptor has an invalid header",
    );
  }
  const baseAddress = Number.parseInt(match[2], 16);
  if (!Number.isSafeInteger(baseAddress) || baseAddress < 0) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "DfuSe memory descriptor has an invalid base address",
    );
  }
  const segments = (match[3] ?? "").split(",").map((value) => value.trim());
  if (segments.length < 1 || segments.length > 128) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "DfuSe memory descriptor has an invalid segment count",
    );
  }

  const pages: DfuSePage[] = [];
  let address = baseAddress;
  for (const segment of segments) {
    const segmentMatch =
      /^(\d{1,4})\s*\*\s*(\d{1,9})\s*([bkm])\s*([a-g])$/iu.exec(segment);
    if (
      segmentMatch === null ||
      segmentMatch[1] === undefined ||
      segmentMatch[2] === undefined ||
      segmentMatch[3] === undefined ||
      segmentMatch[4] === undefined
    ) {
      throw new Stm32DfuError(
        "DEVICE_INVALID",
        `DfuSe memory segment is invalid: ${segment}`,
      );
    }
    const count = safeNumber(segmentMatch[1]);
    const pageSize =
      safeNumber(segmentMatch[2]) * unitMultiplier(segmentMatch[3]);
    const permissionBits =
      segmentMatch[4].toLocaleLowerCase("en-US").charCodeAt(0) - 96;
    if (
      !Number.isSafeInteger(pageSize) ||
      pageSize <= 0 ||
      count > 4_096 ||
      pages.length + count > 4_096
    ) {
      throw new Stm32DfuError(
        "DEVICE_INVALID",
        "DfuSe memory map exceeds bounded page limits",
      );
    }
    for (let index = 0; index < count; index += 1) {
      const nextAddress = address + pageSize;
      if (!Number.isSafeInteger(nextAddress) || nextAddress <= address) {
        throw new Stm32DfuError(
          "DEVICE_INVALID",
          "DfuSe memory map address overflowed",
        );
      }
      pages.push(
        Object.freeze({
          start: address,
          size: pageSize,
          readable: (permissionBits & 0x1) !== 0,
          erasable: (permissionBits & 0x2) !== 0,
          writable: (permissionBits & 0x4) !== 0,
        }),
      );
      address = nextAddress;
    }
  }

  return Object.freeze({
    name: match[1].trim(),
    baseAddress,
    pages: Object.freeze(pages),
  });
}

export function createDfuSeAddressCommand(
  command: "set-address" | "erase",
  address: number,
): Uint8Array {
  if (!Number.isSafeInteger(address) || address < 0 || address > 0xffff_ffff) {
    throw new RangeError("DfuSe command address is outside uint32 range");
  }
  const bytes = new Uint8Array(5);
  bytes[0] = command === "set-address" ? 0x21 : 0x41;
  new DataView(bytes.buffer).setUint32(1, address, true);
  return bytes;
}

function transferSetup(
  interfaceNumber: number,
  request: number,
  value = 0,
): UsbControlTransferSetupLike {
  return Object.freeze({
    requestType: "class",
    recipient: "interface",
    request,
    value,
    index: interfaceNumber,
  });
}

async function transferOut(
  device: UsbDfuDeviceLike,
  interfaceNumber: number,
  request: number,
  value: number,
  bytes: Uint8Array,
): Promise<void> {
  const result = await withTimeout(
    device.controlTransferOut(
      transferSetup(interfaceNumber, request, value),
      copyToArrayBuffer(bytes),
    ),
    "STM32 DFU output transfer timed out",
  );
  if (
    result.status !== "ok" ||
    (result.bytesWritten !== undefined &&
      result.bytesWritten !== bytes.byteLength)
  ) {
    throw new Stm32DfuError(
      "TRANSFER_FAILED",
      "STM32 DFU device rejected an output transfer",
    );
  }
}

async function transferIn(
  device: UsbDfuDeviceLike,
  interfaceNumber: number,
  request: number,
  value: number,
  length: number,
): Promise<Uint8Array> {
  const result = await withTimeout(
    device.controlTransferIn(
      transferSetup(interfaceNumber, request, value),
      length,
    ),
    "STM32 DFU input transfer timed out",
  );
  if (result.status !== "ok" || result.data === undefined) {
    throw new Stm32DfuError(
      "TRANSFER_FAILED",
      "STM32 DFU device rejected an input transfer",
    );
  }
  return new Uint8Array(
    result.data.buffer,
    result.data.byteOffset,
    result.data.byteLength,
  ).slice();
}

async function getStatus(
  device: UsbDfuDeviceLike,
  interfaceNumber: number,
): Promise<Readonly<{ status: number; pollTimeoutMs: number; state: number }>> {
  const bytes = await transferIn(
    device,
    interfaceNumber,
    DfuRequest.getStatus,
    0,
    6,
  );
  if (bytes.byteLength < 6) {
    throw new Stm32DfuError(
      "TRANSFER_FAILED",
      "STM32 DFU GETSTATUS returned a short response",
    );
  }
  return Object.freeze({
    status: bytes[0] ?? 0xff,
    pollTimeoutMs:
      (bytes[1] ?? 0) | ((bytes[2] ?? 0) << 8) | ((bytes[3] ?? 0) << 16),
    state: bytes[4] ?? 0xff,
  });
}

async function waitForDownloadIdle(
  device: UsbDfuDeviceLike,
  interfaceNumber: number,
  signal: AbortSignal | undefined,
  allowManifestReset = false,
): Promise<void> {
  const deadline = Date.now() + TRANSFER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    assertNotAborted(signal);
    const status = await getStatus(device, interfaceNumber);
    if (status.status !== 0 || status.state === DfuState.error) {
      try {
        await transferOut(
          device,
          interfaceNumber,
          DfuRequest.clearStatus,
          0,
          new Uint8Array(),
        );
      } catch {
        // Preserve the original status error.
      }
      throw new Stm32DfuError(
        "TRANSFER_FAILED",
        `STM32 DFU entered error status ${status.status} state ${status.state}`,
      );
    }
    if (
      status.state === DfuState.idle ||
      status.state === DfuState.downloadIdle ||
      status.state === DfuState.uploadIdle ||
      (allowManifestReset && status.state === DfuState.manifestWaitReset)
    ) {
      return;
    }
    if (
      status.state !== DfuState.downloadSync &&
      status.state !== DfuState.downloadBusy &&
      status.state !== DfuState.manifestSync &&
      status.state !== DfuState.manifest
    ) {
      throw new Stm32DfuError(
        "TRANSFER_FAILED",
        `STM32 DFU returned unexpected state ${status.state}`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(Math.max(status.pollTimeoutMs, 1), 250)),
    );
  }
  throw new Stm32DfuError(
    "TIMEOUT",
    "STM32 DFU did not become idle before the deadline",
  );
}

function findDfuAlternate(device: UsbDfuDeviceLike): Readonly<{
  configurationValue: number;
  interfaceNumber: number;
  alternateSetting: number;
  descriptor: string;
}> {
  for (const configuration of device.configurations.slice(0, 16)) {
    for (const iface of configuration.interfaces.slice(0, 64)) {
      for (const alternate of iface.alternates.slice(0, 64)) {
        if (
          alternate.interfaceClass === 0xfe &&
          alternate.interfaceSubclass === 1 &&
          alternate.interfaceProtocol === 2 &&
          typeof alternate.interfaceName === "string" &&
          alternate.interfaceName.startsWith("@")
        ) {
          return Object.freeze({
            configurationValue: configuration.configurationValue,
            interfaceNumber: iface.interfaceNumber,
            alternateSetting: alternate.alternateSetting,
            descriptor: alternate.interfaceName,
          });
        }
      }
    }
  }
  throw new Stm32DfuError(
    "DEVICE_INVALID",
    "Selected USB device exposes no DfuSe memory alternate",
  );
}

function pagesForRange(
  map: DfuSeMemoryMap,
  start: number,
  length: number,
): readonly DfuSePage[] {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(length) ||
    length < 1
  ) {
    throw new Stm32DfuError("RANGE_INVALID", "Firmware range is invalid");
  }
  const end = start + length;
  if (!Number.isSafeInteger(end) || end <= start) {
    throw new Stm32DfuError("RANGE_INVALID", "Firmware range overflowed");
  }
  const pages = map.pages.filter(
    (page) => page.start < end && page.start + page.size > start,
  );
  if (pages.length === 0) {
    throw new Stm32DfuError(
      "RANGE_INVALID",
      "Firmware range is outside the selected DfuSe memory map",
    );
  }
  const coveredStart = pages[0]?.start ?? end;
  const coveredEnd = (pages.at(-1)?.start ?? start) + (pages.at(-1)?.size ?? 0);
  if (start < coveredStart || end > coveredEnd) {
    throw new Stm32DfuError(
      "RANGE_INVALID",
      "Firmware range crosses an unmapped DfuSe gap",
    );
  }
  if (start !== coveredStart) {
    throw new Stm32DfuError(
      "RANGE_INVALID",
      "STM32 application offset is not aligned to the connected device erase geometry",
    );
  }
  if (
    pages.some((page) => !page.readable || !page.writable || !page.erasable)
  ) {
    throw new Stm32DfuError(
      "RANGE_INVALID",
      "Firmware range crosses a protected DfuSe page",
    );
  }
  return Object.freeze(pages);
}

function progress(
  listener: FirmwareFlashProgressListener | undefined,
  stage: "ERASE" | "WRITE" | "VERIFY" | "RESET",
  writtenBytes: number,
  totalBytes: number,
  detail: string,
): void {
  listener?.({ stage, writtenBytes, totalBytes, detail });
}

export async function flashStm32DfuFirmware(input: {
  readonly target: OfficialTarget;
  readonly segment: FirmwareSegment;
  readonly signal?: AbortSignal;
  readonly navigatorObject?: unknown;
  readonly onProgress?: FirmwareFlashProgressListener;
}): Promise<
  Readonly<{
    bytesWritten: number;
    baseAddress: number;
    cleanupVerified: boolean;
  }>
> {
  const platform = input.target.config.platform.toLocaleLowerCase("en-US");
  if (!platform.startsWith("stm32")) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "Selected Target is not an STM32 device",
    );
  }
  if (!input.target.config.uploadMethods.includes("stlink")) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "Selected Target does not advertise the STM32 DFU route",
    );
  }
  if (
    input.segment.bytes.byteLength < 1 ||
    input.segment.bytes.byteLength > MAX_FIRMWARE_BYTES
  ) {
    throw new Stm32DfuError(
      "RANGE_INVALID",
      "STM32 firmware size is outside the 1-byte to 4-MiB limit",
    );
  }
  const expectedAddress = expectedApplicationAddress(input.target);
  if (input.segment.address !== expectedAddress) {
    throw new Stm32DfuError(
      "RANGE_INVALID",
      "STM32 firmware address does not match the selected Target application offset",
    );
  }
  assertNotAborted(input.signal);

  const navigatorObject =
    input.navigatorObject ??
    (typeof navigator === "undefined" ? undefined : navigator);
  if (navigatorObject === null || typeof navigatorObject !== "object") {
    throw new Stm32DfuError("UNSUPPORTED", "WebUSB is unavailable");
  }
  let usb: UsbApiLike | undefined;
  try {
    usb = (navigatorObject as NavigatorWithUsbLike).usb;
  } catch {
    usb = undefined;
  }
  if (usb === undefined || typeof usb.requestDevice !== "function") {
    throw new Stm32DfuError("UNSUPPORTED", "WebUSB is unavailable");
  }

  let device: UsbDfuDeviceLike;
  try {
    device = await usb.requestDevice({
      filters: [
        {
          vendorId: STM32_DFU_VENDOR_ID,
          productId: STM32_DFU_PRODUCT_ID,
        },
      ],
    });
  } catch (error: unknown) {
    const name = errorName(error);
    if (name === "NotFoundError" || name === "AbortError") {
      throw new Stm32DfuError("CANCELLED", "No STM32 DFU device was selected");
    }
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "The STM32 DFU device chooser failed",
    );
  }
  assertNotAborted(input.signal);

  if (
    device === null ||
    typeof device !== "object" ||
    device.vendorId !== STM32_DFU_VENDOR_ID ||
    device.productId !== STM32_DFU_PRODUCT_ID
  ) {
    throw new Stm32DfuError(
      "DEVICE_INVALID",
      "Selected USB device is not the STM32 ROM DfuSe target",
    );
  }

  const alternate = findDfuAlternate(device);
  const memory = parseDfuSeMemoryDescriptor(alternate.descriptor);
  const baseAddress = input.segment.address;
  const affectedPages = pagesForRange(
    memory,
    baseAddress,
    input.segment.bytes.byteLength,
  );

  let claimed = false;
  let completion: {
    bytesWritten: number;
    baseAddress: number;
    cleanupVerified: boolean;
  } | null = null;
  let operationFailure: unknown = null;
  try {
    if (!device.opened) {
      await withTimeout(
        device.open(),
        "Opening the STM32 DFU device timed out",
      );
    }
    if (
      device.configuration === null ||
      device.configuration.configurationValue !== alternate.configurationValue
    ) {
      await withTimeout(
        device.selectConfiguration(alternate.configurationValue),
        "Selecting the STM32 DFU configuration timed out",
      );
    }
    await withTimeout(
      device.claimInterface(alternate.interfaceNumber),
      "Claiming the STM32 DFU interface timed out",
    );
    claimed = true;
    await withTimeout(
      device.selectAlternateInterface(
        alternate.interfaceNumber,
        alternate.alternateSetting,
      ),
      "Selecting the STM32 DfuSe memory alternate timed out",
    );

    try {
      await transferOut(
        device,
        alternate.interfaceNumber,
        DfuRequest.abort,
        0,
        new Uint8Array(),
      );
    } catch {
      // Some ROM bootloaders are already idle and stall ABORT. GETSTATUS below
      // remains the authoritative readiness check.
    }
    await waitForDownloadIdle(device, alternate.interfaceNumber, input.signal);

    progress(
      input.onProgress,
      "ERASE",
      0,
      input.segment.bytes.byteLength,
      `Erasing ${affectedPages.length} overlapping flash page(s)`,
    );
    for (const page of affectedPages) {
      assertNotAborted(input.signal);
      await transferOut(
        device,
        alternate.interfaceNumber,
        DfuRequest.download,
        0,
        createDfuSeAddressCommand("erase", page.start),
      );
      await waitForDownloadIdle(
        device,
        alternate.interfaceNumber,
        input.signal,
      );
    }

    await transferOut(
      device,
      alternate.interfaceNumber,
      DfuRequest.download,
      0,
      createDfuSeAddressCommand("set-address", baseAddress),
    );
    await waitForDownloadIdle(device, alternate.interfaceNumber, input.signal);

    for (
      let offset = 0, block = 2;
      offset < input.segment.bytes.byteLength;
      offset += DEFAULT_TRANSFER_SIZE, block += 1
    ) {
      assertNotAborted(input.signal);
      const chunk = input.segment.bytes.slice(
        offset,
        Math.min(
          offset + DEFAULT_TRANSFER_SIZE,
          input.segment.bytes.byteLength,
        ),
      );
      await transferOut(
        device,
        alternate.interfaceNumber,
        DfuRequest.download,
        block,
        chunk,
      );
      await waitForDownloadIdle(
        device,
        alternate.interfaceNumber,
        input.signal,
      );
      progress(
        input.onProgress,
        "WRITE",
        Math.min(offset + chunk.byteLength, input.segment.bytes.byteLength),
        input.segment.bytes.byteLength,
        `Writing STM32 DFU block ${block - 1}`,
      );
    }

    await transferOut(
      device,
      alternate.interfaceNumber,
      DfuRequest.download,
      0,
      createDfuSeAddressCommand("set-address", baseAddress),
    );
    await waitForDownloadIdle(device, alternate.interfaceNumber, input.signal);

    for (
      let offset = 0, block = 2;
      offset < input.segment.bytes.byteLength;
      offset += DEFAULT_TRANSFER_SIZE, block += 1
    ) {
      assertNotAborted(input.signal);
      const length = Math.min(
        DEFAULT_TRANSFER_SIZE,
        input.segment.bytes.byteLength - offset,
      );
      const observed = await transferIn(
        device,
        alternate.interfaceNumber,
        DfuRequest.upload,
        block,
        length,
      );
      const expected = input.segment.bytes.subarray(offset, offset + length);
      if (
        observed.byteLength !== expected.byteLength ||
        expected.some((byte, index) => observed[index] !== byte)
      ) {
        throw new Stm32DfuError(
          "VERIFY_FAILED",
          `STM32 DFU read-back mismatch at offset ${offset}`,
        );
      }
      progress(
        input.onProgress,
        "VERIFY",
        offset + length,
        input.segment.bytes.byteLength,
        `Verifying STM32 DFU block ${block - 1}`,
      );
    }

    await transferOut(
      device,
      alternate.interfaceNumber,
      DfuRequest.download,
      0,
      new Uint8Array(),
    );
    try {
      await waitForDownloadIdle(
        device,
        alternate.interfaceNumber,
        input.signal,
        true,
      );
    } catch (error: unknown) {
      // A successful manifestation can make the USB device disappear before
      // GETSTATUS completes. Only preserve explicit cancellation.
      if (error instanceof Stm32DfuError && error.code === "ABORTED")
        throw error;
    }
    progress(
      input.onProgress,
      "RESET",
      input.segment.bytes.byteLength,
      input.segment.bytes.byteLength,
      "STM32 DFU leave/reset requested",
    );
    completion = {
      bytesWritten: input.segment.bytes.byteLength,
      baseAddress,
      cleanupVerified: true,
    };
    return completion;
  } catch (error: unknown) {
    operationFailure = error;
    throw error;
  } finally {
    if (claimed) {
      const releaseVerified = await settleCleanupWithin(() =>
        device.releaseInterface(alternate.interfaceNumber),
      );
      if (!releaseVerified) {
        if (completion !== null) {
          completion.cleanupVerified = false;
        } else {
          markCleanupUnverified(operationFailure);
        }
      }
    }
    const closeVerified =
      !device.opened || (await settleCleanupWithin(() => device.close()));
    if (!closeVerified) {
      if (completion !== null) {
        completion.cleanupVerified = false;
      } else {
        markCleanupUnverified(operationFailure);
      }
    }
    if (completion !== null) Object.freeze(completion);
  }
}
