import { gzipSync, strToU8, unzipSync, zipSync } from "fflate";
import { copyToArrayBuffer } from "./byte-utils";

import { expressLrsBindingUid } from "./bind-phrase";
import { validateFirmwareOptions } from "./firmware-options";
import {
  EXPRESSLRS_ARTIFACT_BASE,
  OfficialCatalogError,
  readBoundedResponse,
} from "./official-catalog";
import type {
  ExpressLrsFirmwareOptions,
  FirmwareBuildProgressListener,
  FirmwareSegment,
  OfficialRelease,
  OfficialTarget,
  PreparedFirmwarePackage,
} from "./parity-types";

const MAX_FIRMWARE_ARCHIVE_BYTES = 160 * 1024 * 1024;
const MAX_FIRMWARE_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_FIRMWARE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_HARDWARE_ARCHIVE_BYTES = 24 * 1024 * 1024;
const MAX_HARDWARE_ENTRY_BYTES = 4 * 1024 * 1024;
const PRODUCT_BLOCK_BYTES = 128;
const LUA_BLOCK_BYTES = 16;
const OPTIONS_BLOCK_BYTES = 512;
const HARDWARE_BLOCK_BYTES = 2_048;
const STM32_CONFIG_MAGIC = new Uint8Array([
  0xbe, 0xef, 0xba, 0xbe, 0xca, 0xfe, 0xf0, 0x0d,
]);

export class FirmwarePackageError extends Error {
  public constructor(
    public readonly code:
      | "NETWORK"
      | "ARCHIVE"
      | "TARGET_NOT_FOUND"
      | "REGION_NOT_FOUND"
      | "PLATFORM_UNSUPPORTED"
      | "CONFIG_TOO_LARGE"
      | "INVALID_FIRMWARE"
      | "HASH_UNAVAILABLE"
      | "RECOVERY_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "FirmwarePackageError";
  }
}

function abortBridge(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const relay = () => controller.abort();
  signal?.addEventListener("abort", relay, { once: true });
  if (signal?.aborted === true) controller.abort();
  return Object.freeze({
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
    },
  });
}

async function fetchArchive(input: {
  readonly url: string;
  readonly maximumBytes: number;
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
  readonly stage: "FIRMWARE_ARCHIVE" | "HARDWARE_ARCHIVE";
  readonly onProgress?: FirmwareBuildProgressListener;
}): Promise<Uint8Array> {
  const bridge = abortBridge(input.signal, 120_000);
  try {
    const response = await (input.fetchImplementation ?? fetch)(input.url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: bridge.signal,
      headers: { Accept: "application/zip" },
    });
    return await readBoundedResponse(
      response,
      input.maximumBytes,
      (receivedBytes, totalBytes) =>
        input.onProgress?.({
          stage: input.stage,
          receivedBytes,
          totalBytes,
        }),
    );
  } catch (error: unknown) {
    if (error instanceof OfficialCatalogError) {
      throw new FirmwarePackageError("NETWORK", error.message);
    }
    if (error instanceof FirmwarePackageError) throw error;
    throw new FirmwarePackageError(
      "NETWORK",
      error instanceof Error
        ? error.message
        : "Firmware archive request failed",
    );
  } finally {
    bridge.dispose();
  }
}

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
}

function safeArchivePath(value: string): boolean {
  const path = normalizedPath(value);
  return (
    path.length > 0 &&
    path.length <= 512 &&
    !path.startsWith("../") &&
    !path.includes("/../") &&
    !path.includes("\0")
  );
}

function unzipSelected(input: {
  readonly archive: Uint8Array;
  readonly maximumEntryBytes: number;
  readonly maximumTotalBytes: number;
  readonly include: (name: string) => boolean;
}): Readonly<Record<string, Uint8Array>> {
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(input.archive, {
      filter(file) {
        const name = normalizedPath(file.name);
        if (!safeArchivePath(name) || !input.include(name)) return false;
        if (file.originalSize > input.maximumEntryBytes) {
          throw new FirmwarePackageError(
            "ARCHIVE",
            `Archive entry ${name} exceeds its bounded size`,
          );
        }
        total += file.originalSize;
        if (total > input.maximumTotalBytes) {
          throw new FirmwarePackageError(
            "ARCHIVE",
            "Selected archive entries exceed their total size limit",
          );
        }
        return true;
      },
    });
  } catch (error: unknown) {
    if (error instanceof FirmwarePackageError) throw error;
    throw new FirmwarePackageError(
      "ARCHIVE",
      "Firmware archive could not be decompressed safely",
    );
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(entries).map(([name, bytes]) => [
        normalizedPath(name),
        bytes,
      ]),
    ),
  );
}

function canonical(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "");
}

function targetPathMatch(
  path: string,
  target: OfficialTarget,
  region: string,
): boolean {
  const parts = normalizedPath(path).split("/");
  const firmwareIndex = parts.findIndex(
    (part) => canonical(part) === canonical(target.config.firmware),
  );
  if (firmwareIndex < 0) return false;
  return parts
    .slice(0, firmwareIndex)
    .some((part) => canonical(part) === canonical(region));
}

function findUniqueEntry(
  entries: Readonly<Record<string, Uint8Array>>,
  predicate: (name: string) => boolean,
  description: string,
): Uint8Array {
  const matches = Object.entries(entries).filter(([name]) => predicate(name));
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new FirmwarePackageError(
      "TARGET_NOT_FOUND",
      `Expected one ${description}, found ${matches.length}`,
    );
  }
  return matches[0][1];
}

function findOptionalEntry(
  entries: Readonly<Record<string, Uint8Array>>,
  predicate: (name: string) => boolean,
): Uint8Array | null {
  const matches = Object.entries(entries).filter(([name]) => predicate(name));
  return matches.length === 1 && matches[0] !== undefined
    ? matches[0][1]
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeJson(
  base: Readonly<Record<string, unknown>>,
  overlay: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      continue;
    }
    const previous = merged[key];
    merged[key] =
      isRecord(previous) && isRecord(value)
        ? mergeJson(previous, value)
        : Array.isArray(value)
          ? Object.freeze([...value])
          : value;
  }
  return Object.freeze(merged);
}

function parseLayout(bytes: Uint8Array): Readonly<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!isRecord(value)) throw new TypeError("layout is not an object");
    return Object.freeze({ ...value });
  } catch {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "The selected hardware layout is not valid bounded JSON",
    );
  }
}

function encodeFixedString(
  value: string,
  size: number,
  field: string,
): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength >= size) {
    throw new FirmwarePackageError(
      "CONFIG_TOO_LARGE",
      `${field} exceeds its ${size - 1}-byte firmware field`,
    );
  }
  const block = new Uint8Array(size);
  block.set(encoded);
  return block;
}

function encodeJsonBlock(
  value: Readonly<Record<string, unknown>>,
  size: number,
  field: string,
): Uint8Array {
  return encodeFixedString(JSON.stringify(value), size, field);
}

function findEspImageEnd(bytes: Uint8Array): number {
  if (bytes.byteLength < 24 || bytes[0] !== 0xe9) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP application does not contain a valid image header",
    );
  }
  const segmentCount = bytes[1] ?? 0;
  if (segmentCount < 1 || segmentCount > 16) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP application declares an invalid segment count",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 24;
  for (let index = 0; index < segmentCount; index += 1) {
    if (offset + 8 > bytes.byteLength) {
      throw new FirmwarePackageError(
        "INVALID_FIRMWARE",
        "ESP segment header is truncated",
      );
    }
    const size = view.getUint32(offset + 4, true);
    if (
      size > MAX_FIRMWARE_ENTRY_BYTES ||
      offset + 8 + size > bytes.byteLength
    ) {
      throw new FirmwarePackageError(
        "INVALID_FIRMWARE",
        "ESP segment exceeds the application boundary",
      );
    }
    offset += 8 + size;
  }
  offset += 1;
  offset = (offset + 15) & ~15;
  if ((bytes[23] ?? 0) === 1) offset += 32;
  if (offset > bytes.byteLength) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP application checksum/hash area is truncated",
    );
  }
  return offset;
}

function randomU32(): number {
  const words = new Uint32Array(1);
  crypto.getRandomValues(words);
  return words[0] ?? 0;
}

function buildFirmwareOptionObject(
  target: OfficialTarget,
  options: ExpressLrsFirmwareOptions,
): Readonly<Record<string, unknown>> {
  const uid = expressLrsBindingUid(options.bindPhrase);
  const value: Record<string, unknown> = {
    domain: options.domain,
    "flash-discriminator": randomU32(),
    "fan-runtime": options.fanRuntime,
  };
  if (uid.byteLength === 6) value.uid = [...uid];
  if (options.wifiSsid.length > 0) value["wifi-ssid"] = options.wifiSsid;
  if (options.wifiPassword.length > 0) {
    value["wifi-password"] = options.wifiPassword;
  }
  if (options.wifiAutoOnInterval > 0) {
    value["wifi-on-interval"] = options.wifiAutoOnInterval;
  }
  if (target.role === "tx") {
    value["tlm-interval"] = options.telemetryInterval;
    value["tlm-report"] = options.telemetryInterval;
    value["uart-inverted"] = options.uartInverted;
    value["unlock-higher-power"] = options.unlockHigherPower;
  } else {
    value["rcvr-uart-baud"] = options.receiverUartBaud;
    value["rcvr-invert-tx"] = options.receiverInvertTx;
    value["lock-on-first-connection"] = options.lockOnFirstConnection;
    value["r9mm-mini-sbus"] = options.r9mmMiniSbus;
    value["is-airport"] = options.receiverAsTransmitter;
  }
  return Object.freeze(value);
}

function configuredEspApplication(input: {
  readonly application: Uint8Array;
  readonly target: OfficialTarget;
  readonly options: ExpressLrsFirmwareOptions;
  readonly layout: Readonly<Record<string, unknown>>;
  readonly logo: Uint8Array | null;
}): Uint8Array {
  const firmwareEnd = findEspImageEnd(input.application);
  const product = encodeFixedString(
    input.target.config.productName,
    PRODUCT_BLOCK_BYTES,
    "product name",
  );
  const lua = encodeFixedString(
    input.target.config.luaName ?? "",
    LUA_BLOCK_BYTES,
    "Lua name",
  );
  const options = encodeJsonBlock(
    buildFirmwareOptionObject(input.target, input.options),
    OPTIONS_BLOCK_BYTES,
    "firmware options",
  );
  const hardware = encodeJsonBlock(
    input.layout,
    HARDWARE_BLOCK_BYTES,
    "hardware layout",
  );
  const logo = input.logo ?? new Uint8Array();
  const configured = new Uint8Array(
    firmwareEnd +
      product.byteLength +
      lua.byteLength +
      options.byteLength +
      hardware.byteLength +
      logo.byteLength,
  );
  configured.set(input.application.slice(0, firmwareEnd), 0);
  let offset = firmwareEnd;
  for (const block of [product, lua, options, hardware, logo]) {
    configured.set(block, offset);
    offset += block.byteLength;
  }
  return configured;
}

function findMagic(bytes: Uint8Array, magic: Uint8Array): number {
  outer: for (
    let offset = 0;
    offset <= bytes.byteLength - magic.byteLength;
    offset += 1
  ) {
    for (let index = 0; index < magic.byteLength; index += 1) {
      if (bytes[offset + index] !== magic[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function versionAtLeast(label: string, required: readonly number[]): boolean {
  const actual = label
    .replace(/^v/u, "")
    .split(/[.-]/u)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < required.length; index += 1) {
    const delta = (actual[index] ?? 0) - (required[index] ?? 0);
    if (delta !== 0) return delta > 0;
  }
  return true;
}

function configuredStm32Application(input: {
  readonly application: Uint8Array;
  readonly release: OfficialRelease;
  readonly target: OfficialTarget;
  readonly options: ExpressLrsFirmwareOptions;
}): Uint8Array {
  const configured = input.application.slice();
  const magicOffset = findMagic(configured, STM32_CONFIG_MAGIC);
  if (magicOffset < 0) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "STM32 firmware does not expose the ExpressLRS configuration block",
    );
  }
  let offset = magicOffset + STM32_CONFIG_MAGIC.byteLength;
  const requireSpace = (count: number) => {
    if (offset + count > configured.byteLength) {
      throw new FirmwarePackageError(
        "INVALID_FIRMWARE",
        "STM32 configuration block is truncated",
      );
    }
  };
  requireSpace(2);
  const configVersion =
    (configured[offset] ?? 0) | ((configured[offset + 1] ?? 0) << 8);
  offset += 2;
  if (configVersion === 0) {
    requireSpace(1);
    offset += 1;
  }

  requireSpace(8);
  configured[offset] = input.options.domain & 0xff;
  offset += 1;
  const uid = expressLrsBindingUid(input.options.bindPhrase);
  configured[offset] = uid.byteLength === 6 ? 1 : 0;
  offset += 1;
  configured.fill(0, offset, offset + 6);
  if (uid.byteLength === 6) configured.set(uid, offset);
  offset += 6;

  const view = new DataView(
    configured.buffer,
    configured.byteOffset,
    configured.byteLength,
  );
  const writeU32 = (value: number) => {
    requireSpace(4);
    view.setUint32(offset, value >>> 0, true);
    offset += 4;
  };
  const writeBool = (value: boolean) => {
    requireSpace(1);
    configured[offset] = value ? 1 : 0;
    offset += 1;
  };

  if (versionAtLeast(input.release.label, [3, 4, 0])) writeU32(randomU32());
  if (versionAtLeast(input.release.label, [3, 5, 0])) {
    writeU32(input.options.fanRuntime);
  }
  if (input.target.role === "tx") {
    writeU32(input.options.telemetryInterval);
    writeBool(input.options.uartInverted);
    writeBool(input.options.unlockHigherPower);
  } else {
    writeU32(input.options.receiverUartBaud);
    writeBool(input.options.receiverInvertTx);
    writeBool(input.options.lockOnFirstConnection);
    writeBool(input.options.r9mmMiniSbus);
  }
  return configured;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (crypto.subtle === undefined) {
    throw new FirmwarePackageError(
      "HASH_UNAVAILABLE",
      "Web Crypto SHA-256 is unavailable",
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    copyToArrayBuffer(bytes),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function createSegments(
  input: readonly Readonly<{
    name: string;
    address: number;
    bytes: Uint8Array;
  }>[],
): Promise<readonly FirmwareSegment[]> {
  return Object.freeze(
    await Promise.all(
      input.map(async (segment) =>
        Object.freeze({
          ...segment,
          sha256: await sha256Hex(segment.bytes),
        }),
      ),
    ),
  );
}

function targetLayout(
  target: OfficialTarget,
  hardwareEntries: Readonly<Record<string, Uint8Array>>,
): Readonly<Record<string, unknown>> {
  let layout: Readonly<Record<string, unknown>> =
    target.config.customLayout ?? Object.freeze({});
  if (target.config.layoutFile !== null) {
    const wanted = canonical(target.config.layoutFile);
    const bytes = findUniqueEntry(
      hardwareEntries,
      (name) => canonical(name.split("/").at(-1) ?? "") === wanted,
      `hardware layout ${target.config.layoutFile}`,
    );
    layout = parseLayout(bytes);
  }
  if (target.config.overlay !== null) {
    layout = mergeJson(layout, target.config.overlay);
  }
  return layout;
}

function targetLogo(
  target: OfficialTarget,
  hardwareEntries: Readonly<Record<string, Uint8Array>>,
): Uint8Array | null {
  if (target.config.logoFile === null) return null;
  const wanted = canonical(target.config.logoFile);
  return findOptionalEntry(
    hardwareEntries,
    (name) => canonical(name.split("/").at(-1) ?? "") === wanted,
  );
}

function platformFamily(platform: string): "esp8285" | "esp32" | "stm32" {
  const normalized = platform.toLocaleLowerCase("en-US");
  if (normalized.includes("8285") || normalized.includes("8266")) {
    return "esp8285";
  }
  if (normalized.startsWith("esp32")) return "esp32";
  if (normalized.startsWith("stm32")) return "stm32";
  throw new FirmwarePackageError(
    "PLATFORM_UNSUPPORTED",
    `Unsupported ExpressLRS platform: ${platform}`,
  );
}

function esp32BootAddress(platform: string): number {
  return platform.toLocaleLowerCase("en-US").startsWith("esp32-") ? 0 : 0x1000;
}

function recoveryManifest(
  release: OfficialRelease,
  target: OfficialTarget,
  options: ExpressLrsFirmwareOptions,
  segments: readonly FirmwareSegment[],
): Uint8Array {
  return strToU8(
    JSON.stringify(
      {
        schemaVersion: 1,
        release: { label: release.label, revision: release.revision },
        target: {
          id: target.id,
          role: target.role,
          productName: target.config.productName,
          platform: target.config.platform,
          firmware: target.config.firmware,
        },
        options: {
          region: options.region,
          domain: options.domain,
          bindingConfigured: options.bindPhrase.length > 0,
          wifiConfigured:
            options.wifiSsid.length > 0 || options.wifiPassword.length > 0,
        },
        segments: segments.map((segment) => ({
          name: segment.name,
          address: segment.address,
          size: segment.bytes.byteLength,
          sha256: segment.sha256,
        })),
      },
      null,
      2,
    ),
  );
}

export async function prepareOfficialFirmwarePackage(input: {
  readonly release: OfficialRelease;
  readonly target: OfficialTarget;
  readonly options: ExpressLrsFirmwareOptions;
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
  readonly onProgress?: FirmwareBuildProgressListener;
}): Promise<PreparedFirmwarePackage> {
  const validatedOptions = validateFirmwareOptions({
    target: input.target,
    options: input.options,
  });
  const revision = encodeURIComponent(input.release.revision);
  const firmwareArchive = await fetchArchive({
    url: `${EXPRESSLRS_ARTIFACT_BASE}/${revision}/firmware.zip`,
    maximumBytes: MAX_FIRMWARE_ARCHIVE_BYTES,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: input.fetchImplementation }),
    stage: "FIRMWARE_ARCHIVE",
    ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
  });
  const needsHardware =
    input.target.config.layoutFile !== null ||
    input.target.config.logoFile !== null;
  const hardwareArchive = needsHardware
    ? await fetchArchive({
        url: `${EXPRESSLRS_ARTIFACT_BASE}/hardware.zip`,
        maximumBytes: MAX_HARDWARE_ARCHIVE_BYTES,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.fetchImplementation === undefined
          ? {}
          : { fetchImplementation: input.fetchImplementation }),
        stage: "HARDWARE_ARCHIVE",
        ...(input.onProgress === undefined
          ? {}
          : { onProgress: input.onProgress }),
      })
    : null;

  input.onProgress?.({ stage: "EXTRACT", receivedBytes: 0, totalBytes: null });
  const firmwareEntries = unzipSelected({
    archive: firmwareArchive,
    maximumEntryBytes: MAX_FIRMWARE_ENTRY_BYTES,
    maximumTotalBytes: MAX_FIRMWARE_UNCOMPRESSED_BYTES,
    include: (name) =>
      targetPathMatch(name, input.target, validatedOptions.region),
  });
  if (Object.keys(firmwareEntries).length === 0) {
    throw new FirmwarePackageError(
      "REGION_NOT_FOUND",
      `No firmware files matched ${validatedOptions.region}/${input.target.config.firmware}`,
    );
  }
  const hardwareEntries =
    hardwareArchive === null
      ? Object.freeze({})
      : unzipSelected({
          archive: hardwareArchive,
          maximumEntryBytes: MAX_HARDWARE_ENTRY_BYTES,
          maximumTotalBytes: 12 * 1024 * 1024,
          include: (name) => {
            const leaf = canonical(name.split("/").at(-1) ?? "");
            return (
              (input.target.config.layoutFile !== null &&
                leaf === canonical(input.target.config.layoutFile)) ||
              (input.target.config.logoFile !== null &&
                leaf === canonical(input.target.config.logoFile))
            );
          },
        });

  input.onProgress?.({
    stage: "CONFIGURE",
    receivedBytes: 0,
    totalBytes: null,
  });
  const application = findUniqueEntry(
    firmwareEntries,
    (name) => /(^|\/)firmware\.bin$/iu.test(name),
    "firmware.bin",
  );
  const family = platformFamily(input.target.config.platform);
  const configuredApplication =
    family === "stm32"
      ? configuredStm32Application({
          application,
          release: input.release,
          target: input.target,
          options: validatedOptions,
        })
      : configuredEspApplication({
          application,
          target: input.target,
          options: validatedOptions,
          layout: targetLayout(input.target, hardwareEntries),
          logo: targetLogo(input.target, hardwareEntries),
        });

  const unhashedSegments: ReadonlyArray<{
    readonly name: string;
    readonly address: number;
    readonly bytes: Uint8Array;
  }> =
    family === "esp32"
      ? [
          {
            name: "bootloader.bin",
            address: esp32BootAddress(input.target.config.platform),
            bytes: findUniqueEntry(
              firmwareEntries,
              (name) => /(^|\/)bootloader\.bin$/iu.test(name),
              "bootloader.bin",
            ),
          },
          {
            name: "partitions.bin",
            address: 0x8000,
            bytes: findUniqueEntry(
              firmwareEntries,
              (name) => /(^|\/)partitions\.bin$/iu.test(name),
              "partitions.bin",
            ),
          },
          {
            name: "boot_app0.bin",
            address: 0xe000,
            bytes: findUniqueEntry(
              firmwareEntries,
              (name) => /(^|\/)boot_app0\.bin$/iu.test(name),
              "boot_app0.bin",
            ),
          },
          {
            name: "firmware.bin",
            address: 0x10000,
            bytes: configuredApplication,
          },
        ]
      : [
          {
            name: "firmware.bin",
            address: 0,
            bytes: configuredApplication,
          },
        ];

  input.onProgress?.({ stage: "HASH", receivedBytes: 0, totalBytes: null });
  const segments = await createSegments(unhashedSegments);
  input.onProgress?.({ stage: "PACKAGE", receivedBytes: 0, totalBytes: null });

  const baseName = input.target.targetKey.replace(/[^A-Za-z0-9_.-]+/gu, "-");
  const primaryFileName =
    family === "esp32"
      ? `${baseName}-${input.release.label}.zip`
      : family === "esp8285"
        ? `${baseName}-${input.release.label}.bin.gz`
        : `${baseName}-${input.release.label}.bin`;
  const primaryDownload =
    family === "esp32"
      ? zipSync(
          Object.fromEntries(
            segments.map((segment) => [segment.name, segment.bytes]),
          ),
          { level: 6 },
        )
      : family === "esp8285"
        ? gzipSync(configuredApplication, { level: 9 })
        : configuredApplication;
  const primaryMimeType =
    family === "esp32"
      ? "application/zip"
      : family === "esp8285"
        ? "application/gzip"
        : "application/octet-stream";
  const recoveryFileName = `${baseName}-${input.release.label}-recovery.zip`;
  const recoveryArchive = zipSync(
    {
      "manifest.json": recoveryManifest(
        input.release,
        input.target,
        validatedOptions,
        segments,
      ),
      ...Object.fromEntries(
        segments.map((segment) => [`segments/${segment.name}`, segment.bytes]),
      ),
    },
    { level: 6 },
  );

  return Object.freeze({
    schemaVersion: 1,
    release: input.release,
    target: input.target,
    optionsSummary: Object.freeze({
      region: validatedOptions.region,
      domain: validatedOptions.domain,
      bindingConfigured: validatedOptions.bindPhrase.length > 0,
      wifiConfigured:
        validatedOptions.wifiSsid.length > 0 ||
        validatedOptions.wifiPassword.length > 0,
    }),
    segments,
    primaryFileName,
    primaryDownload,
    primaryMimeType,
    recoveryFileName,
    recoveryArchive,
    createdAt: new Date().toISOString(),
  });
}

export function downloadPreparedBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): void {
  const blob = new Blob([copyToArrayBuffer(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}
