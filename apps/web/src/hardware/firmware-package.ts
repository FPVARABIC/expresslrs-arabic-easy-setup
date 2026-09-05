import { gzipSync, strToU8, zipSync } from "fflate";
import { copyToArrayBuffer } from "./byte-utils";

import { expressLrsBindingUid, md5Bytes } from "./bind-phrase";
import { validateFirmwareOptions } from "./firmware-options";
import {
  EXPRESSLRS_WEB_FLASHER_ASSET_BASE,
  OfficialCatalogError,
  readBoundedResponse,
} from "./official-catalog";
import {
  EXPRESSLRS_REGULATORY_REGIONS,
  regulatoryRegionsForRadioKey,
} from "./regulatory-domain";
import type {
  ExpressLrsFirmwareOptions,
  FirmwareBuildProgressListener,
  FirmwareSegment,
  OfficialRelease,
  OfficialTarget,
  PreparedFirmwarePackage,
} from "./parity-types";

const MAX_FIRMWARE_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_HARDWARE_ENTRY_BYTES = 4 * 1024 * 1024;
const PRODUCT_BLOCK_BYTES = 128;
const LUA_BLOCK_BYTES = 16;
const OPTIONS_BLOCK_BYTES = 512;
const HARDWARE_BLOCK_BYTES = 2_048;
const ESP8285_FLASH_BYTES = 1024 * 1024;
const ESP32_PARTITION_ADDRESS = 0x8000;
const ESP32_BOOT_APP_ADDRESS = 0xe000;
const ESP32_APPLICATION_ADDRESS = 0x10000;
const ESP32_PARTITION_ENTRY_BYTES = 32;
const ESP32_PARTITION_MAGIC = 0x50aa;
const ESP32_PARTITION_MD5_MAGIC = 0xebeb;
const ESP32_FLASH_BYTES = 4 * 1024 * 1024;
const STM32_FLASH_BASE_ADDRESS = 0x0800_0000;
const VERIFIED_STM32_APPLICATION_OFFSETS = Object.freeze([
  0x1000, 0x4000, 0x8000,
]);
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
      | "VERSION_UNSUPPORTED"
      | "ARTIFACT_UNAVAILABLE"
      | "REGULATORY_MISMATCH"
      | "STM32_OFFSET_UNVERIFIED"
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

type AcquisitionStage = "FIRMWARE_ARCHIVE" | "HARDWARE_ARCHIVE";

function encodePathPart(value: string, description: string): string {
  if (
    value.length === 0 ||
    value.length > 240 ||
    value === "." ||
    value === ".." ||
    /[\\/\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new FirmwarePackageError(
      "TARGET_NOT_FOUND",
      `${description} contains an unsafe official asset path component`,
    );
  }
  return encodeURIComponent(value);
}

function encodeArtifactPath(value: string, description: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.length > 512 ||
    normalized.startsWith("/") ||
    normalized.endsWith("/")
  ) {
    throw new FirmwarePackageError(
      "TARGET_NOT_FOUND",
      `${description} contains an unsafe official artifact path`,
    );
  }
  return normalized
    .split("/")
    .map((part) => encodePathPart(part, description))
    .join("/");
}

function isExpectedFinalUrl(value: string, requestedUrl: string): boolean {
  try {
    const finalUrl = new URL(value);
    const requested = new URL(requestedUrl);
    return (
      finalUrl.protocol === "https:" &&
      finalUrl.username === "" &&
      finalUrl.password === "" &&
      finalUrl.origin === requested.origin &&
      finalUrl.pathname === requested.pathname &&
      finalUrl.search === "" &&
      finalUrl.hash === ""
    );
  } catch {
    return false;
  }
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Preserve the acquisition error that caused cancellation.
  }
}

interface AssetRequest {
  readonly url: string;
  readonly maximumBytes: number;
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
  readonly stage: AcquisitionStage;
  readonly onProgress?: FirmwareBuildProgressListener;
  readonly missingCode: "REGION_NOT_FOUND" | "TARGET_NOT_FOUND";
  readonly optional?: boolean;
}

async function fetchAsset(input: AssetRequest): Promise<Uint8Array | null> {
  const bridge = abortBridge(input.signal, 120_000);
  try {
    const response = await (input.fetchImplementation ?? fetch)(input.url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: bridge.signal,
      headers: { Accept: "application/octet-stream, application/json;q=0.9" },
    });
    const finalUrl = response.url || input.url;
    if (!isExpectedFinalUrl(finalUrl, input.url)) {
      await cancelResponse(response);
      throw new FirmwarePackageError(
        "NETWORK",
        "Official firmware asset request ended at an unexpected URL",
      );
    }
    if (response.status === 404) {
      await cancelResponse(response);
      if (input.optional === true) return null;
      throw new FirmwarePackageError(
        input.missingCode,
        `Official ExpressLRS asset was not found: ${new URL(input.url).pathname}`,
      );
    }
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
      error instanceof Error ? error.message : "Firmware asset request failed",
    );
  } finally {
    bridge.dispose();
  }
}

async function fetchRequiredAsset(
  input: Omit<AssetRequest, "optional">,
): Promise<Uint8Array> {
  const bytes = await fetchAsset(input);
  if (bytes === null) {
    throw new FirmwarePackageError(
      input.missingCode,
      "Required official ExpressLRS asset is unavailable",
    );
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

interface SemanticVersion {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[];
}

const MAX_REVIEWED_EXPRESSLRS_VERSION = Object.freeze([4, 1] as const);

function parseSemanticVersion(value: string): SemanticVersion | null {
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      value.trim(),
    );
  if (match === null) return null;
  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (core.some((part) => !Number.isSafeInteger(part))) return null;
  const prerelease = match[4]?.split(".") ?? [];
  if (
    prerelease.some(
      (part) => /^\d+$/u.test(part) && part.length > 1 && part.startsWith("0"),
    )
  ) {
    return null;
  }
  return Object.freeze({
    core: Object.freeze(core),
    prerelease: Object.freeze(prerelease),
  });
}

function compareSemanticVersion(
  left: SemanticVersion,
  right: SemanticVersion,
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length
      ? 0
      : left.prerelease.length === 0
        ? 1
        : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === undefined || b === undefined) {
      return a === b ? 0 : a === undefined ? -1 : 1;
    }
    if (a === b) continue;
    const aNumeric = /^\d+$/u.test(a);
    const bNumeric = /^\d+$/u.test(b);
    if (aNumeric && bNumeric) {
      if (a.length !== b.length) return a.length - b.length;
      return a < b ? -1 : 1;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

function assertReleaseCompatibility(
  release: OfficialRelease,
  target: OfficialTarget,
): void {
  if (target.config.minVersion === null) {
    throw new FirmwarePackageError(
      "VERSION_UNSUPPORTED",
      `Target ${target.config.firmware} does not declare a verifiable minimum version`,
    );
  }
  const required = parseSemanticVersion(target.config.minVersion);
  if (required === null) {
    throw new FirmwarePackageError(
      "VERSION_UNSUPPORTED",
      `Target minimum version ${target.config.minVersion} is not valid semantic version data`,
    );
  }
  const actual = parseSemanticVersion(release.label);
  if (release.channel === "release" && actual === null) {
    throw new FirmwarePackageError(
      "VERSION_UNSUPPORTED",
      `Stable release label ${release.label} is not valid semantic version data`,
    );
  }
  if (actual === null) {
    throw new FirmwarePackageError(
      "VERSION_UNSUPPORTED",
      `Branch ${release.label} cannot prove compatibility with target minimum ${target.config.minVersion}`,
    );
  }
  const [actualMajor, actualMinor] = actual.core;
  const [reviewedMajor, reviewedMinor] = MAX_REVIEWED_EXPRESSLRS_VERSION;
  if (
    actualMajor > reviewedMajor ||
    (actualMajor === reviewedMajor && actualMinor > reviewedMinor)
  ) {
    throw new FirmwarePackageError(
      "VERSION_UNSUPPORTED",
      `Release ${release.label} is newer than the reviewed ExpressLRS ${reviewedMajor}.${reviewedMinor}.x firmware and regulatory-domain layout`,
    );
  }
  if (compareSemanticVersion(actual, required) < 0) {
    throw new FirmwarePackageError(
      "VERSION_UNSUPPORTED",
      `Release ${release.label} is older than target minimum ${target.config.minVersion}`,
    );
  }
}

function assertRegulatorySelection(
  target: OfficialTarget,
  options: ExpressLrsFirmwareOptions,
): void {
  const eligibleKeys = new Set(
    regulatoryRegionsForRadioKey(target.radioKey).map((region) => region.key),
  );
  const selected = EXPRESSLRS_REGULATORY_REGIONS.find(
    (region) =>
      eligibleKeys.has(region.key) &&
      region.artifactDirectory === options.region &&
      region.domain === options.domain,
  );
  if (selected === undefined) {
    throw new FirmwarePackageError(
      "REGULATORY_MISMATCH",
      `Region directory ${options.region} and domain ${options.domain} do not match radio ${target.radioKey}`,
    );
  }
}

function assertStm32AssetSupport(release: OfficialRelease): void {
  const version = parseSemanticVersion(release.label);
  if (
    release.channel !== "release" ||
    version === null ||
    version.core[0] !== 3 ||
    version.prerelease.length !== 0
  ) {
    throw new FirmwarePackageError(
      "ARTIFACT_UNAVAILABLE",
      `The official Web Flasher mirror does not provide verified STM32 package assets for ${release.label}; select a stable 3.x release`,
    );
  }
}

function validatedStm32SegmentAddress(target: OfficialTarget): number {
  const stlink = target.config.raw.stlink;
  const rawOffset = isRecord(stlink) ? stlink.offset : null;
  if (
    typeof rawOffset !== "string" ||
    !/^0[xX][0-9A-Fa-f]{1,8}$/u.test(rawOffset)
  ) {
    throw new FirmwarePackageError(
      "STM32_OFFSET_UNVERIFIED",
      `Target ${target.config.firmware} does not declare a verified STM32 application offset`,
    );
  }
  const offset = Number.parseInt(rawOffset.slice(2), 16);
  if (
    !Number.isSafeInteger(offset) ||
    !VERIFIED_STM32_APPLICATION_OFFSETS.some(
      (verifiedOffset) => verifiedOffset === offset,
    )
  ) {
    throw new FirmwarePackageError(
      "STM32_OFFSET_UNVERIFIED",
      `Target ${target.config.firmware} declares an unsupported STM32 application offset`,
    );
  }
  return STM32_FLASH_BASE_ADDRESS + offset;
}

function applyLayoutOverlay(
  base: Readonly<Record<string, unknown>>,
  overlay: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      continue;
    }
    merged[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
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

type PlatformFamily = "esp8285" | "esp32" | "stm32";

function expectedEsp32ImageChipId(platform: string): number {
  switch (platform.toLocaleLowerCase("en-US")) {
    case "esp32":
      return 0;
    case "esp32-s2":
      return 2;
    case "esp32-c3":
      return 5;
    case "esp32-s3":
      return 9;
    default:
      throw new FirmwarePackageError(
        "PLATFORM_UNSUPPORTED",
        `Unsupported ESP32 image platform: ${platform}`,
      );
  }
}

function findEspImageEnd(
  bytes: Uint8Array,
  family: Exclude<PlatformFamily, "stm32">,
  platform: string,
): number {
  const imageOffset = family === "esp8285" ? 0x1000 : 0;
  const headerBytes = family === "esp8285" ? 8 : 24;
  if (
    bytes.byteLength < imageOffset + headerBytes ||
    bytes[imageOffset] !== 0xe9
  ) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP application does not contain a valid image header",
    );
  }
  const segmentCount = bytes[imageOffset + 1] ?? 0;
  if (segmentCount < 1 || segmentCount > 16) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP application declares an invalid segment count",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (family === "esp32") {
    const observedChipId = view.getUint16(imageOffset + 12, true);
    const expectedChipId = expectedEsp32ImageChipId(platform);
    if (observedChipId !== expectedChipId) {
      throw new FirmwarePackageError(
        "INVALID_FIRMWARE",
        `ESP32 image chip id ${observedChipId} does not match ${platform}`,
      );
    }
  }
  let offset = imageOffset + headerBytes;
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
  if (family === "esp32" && (bytes[23] ?? 0) === 1) offset += 32;
  if (offset > bytes.byteLength) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP application checksum/hash area is truncated",
    );
  }
  return offset;
}

function validatedEsp32ApplicationPartitionSize(bytes: Uint8Array): number {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > ESP32_BOOT_APP_ADDRESS - ESP32_PARTITION_ADDRESS ||
    bytes.byteLength % ESP32_PARTITION_ENTRY_BYTES !== 0
  ) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP32 partition table has an invalid flash boundary",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const partitions: Array<
    Readonly<{ type: number; start: number; size: number }>
  > = [];
  let terminated = false;
  for (
    let offset = 0;
    offset + ESP32_PARTITION_ENTRY_BYTES <= bytes.byteLength;
    offset += ESP32_PARTITION_ENTRY_BYTES
  ) {
    const magic = view.getUint16(offset, true);
    if (magic === ESP32_PARTITION_MD5_MAGIC) {
      const observedDigest = bytes.subarray(offset + 16, offset + 32);
      const expectedDigest = md5Bytes(bytes.subarray(0, offset));
      if (
        observedDigest.byteLength !== expectedDigest.byteLength ||
        observedDigest.some((byte, index) => byte !== expectedDigest[index])
      ) {
        throw new FirmwarePackageError(
          "INVALID_FIRMWARE",
          "ESP32 partition table failed its embedded checksum",
        );
      }
      terminated = true;
      break;
    }
    if (magic === 0xffff) break;
    if (magic !== ESP32_PARTITION_MAGIC) {
      throw new FirmwarePackageError(
        "INVALID_FIRMWARE",
        "ESP32 partition table contains an invalid entry",
      );
    }
    const type = bytes[offset + 2] ?? 0xff;
    const start = view.getUint32(offset + 4, true);
    const size = view.getUint32(offset + 8, true);
    const end = start + size;
    if (size === 0 || !Number.isSafeInteger(end) || end > ESP32_FLASH_BYTES) {
      throw new FirmwarePackageError(
        "INVALID_FIRMWARE",
        "ESP32 partition table contains an invalid address range",
      );
    }
    partitions.push(Object.freeze({ type, start, size }));
  }
  if (!terminated || partitions.length === 0) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP32 partition table is unterminated or empty",
    );
  }
  const sorted = [...partitions].sort(
    (left, right) => left.start - right.start,
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      current.start < previous.start + previous.size
    ) {
      throw new FirmwarePackageError(
        "INVALID_FIRMWARE",
        "ESP32 partition table contains overlapping ranges",
      );
    }
  }
  const applicationPartitions = partitions.filter(
    (partition) =>
      partition.type === 0 && partition.start === ESP32_APPLICATION_ADDRESS,
  );
  if (applicationPartitions.length !== 1) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP32 partition table does not define one application at 0x10000",
    );
  }
  return applicationPartitions[0]?.size ?? 0;
}

function validateEsp32SupportAssets(
  platform: string,
  assets: readonly [Uint8Array, Uint8Array, Uint8Array],
): number {
  const bootAddress = esp32BootAddress(platform);
  if (
    assets[0].byteLength === 0 ||
    bootAddress + assets[0].byteLength > ESP32_PARTITION_ADDRESS
  ) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP32 bootloader crosses the partition-table address",
    );
  }
  if (findEspImageEnd(assets[0], "esp32", platform) !== assets[0].byteLength) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP32 bootloader contains trailing data outside its verified image",
    );
  }
  if (
    assets[2].byteLength !==
    ESP32_APPLICATION_ADDRESS - ESP32_BOOT_APP_ADDRESS
  ) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP32 boot_app0 image does not fill its exact flash partition",
    );
  }
  const bootAppView = new DataView(
    assets[2].buffer,
    assets[2].byteOffset,
    assets[2].byteLength,
  );
  if (
    bootAppView.getUint32(0, true) !== 1 ||
    bootAppView.getUint32(28, true) !== 0x4743_989a ||
    bootAppView.getUint32(4096, true) !== 0
  ) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "ESP32 boot_app0 image has invalid OTA selection metadata",
    );
  }
  return validatedEsp32ApplicationPartitionSize(assets[1]);
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
    "flash-discriminator": randomU32(),
    "fan-runtime": options.fanRuntime,
  };
  if (
    regulatoryRegionsForRadioKey(target.radioKey).some(
      (region) => region.family !== "2.4GHz",
    )
  ) {
    value.domain = options.domain;
  }
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
  readonly family: Exclude<PlatformFamily, "stm32">;
  readonly target: OfficialTarget;
  readonly options: ExpressLrsFirmwareOptions;
  readonly layout: Readonly<Record<string, unknown>>;
  readonly logo: Uint8Array | null;
}): Uint8Array {
  const firmwareEnd = findEspImageEnd(
    input.application,
    input.family,
    input.target.config.platform,
  );
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
  if (input.target.radioKey.toLocaleLowerCase("en-US").endsWith("_900")) {
    configured[offset] = input.options.domain & 0xff;
  }
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
  const writePackedFlags = (
    values: readonly Readonly<{ mask: number; enabled: boolean }>[],
  ) => {
    requireSpace(1);
    let flags = configured[offset] ?? 0;
    for (const value of values) {
      flags = value.enabled ? flags | value.mask : flags & ~value.mask;
    }
    configured[offset] = flags & 0xff;
    offset += 1;
  };

  if (versionAtLeast(input.release.label, [3, 4, 0])) writeU32(randomU32());
  if (versionAtLeast(input.release.label, [3, 5, 0])) {
    writeU32(input.options.fanRuntime);
  }
  if (input.target.role === "tx") {
    writeU32(input.options.telemetryInterval);
    if (!versionAtLeast(input.release.label, [3, 5, 0])) {
      writeU32(input.options.fanRuntime);
    }
    writePackedFlags([
      { mask: 1 << 0, enabled: input.options.uartInverted },
      { mask: 1 << 1, enabled: input.options.unlockHigherPower },
    ]);
  } else {
    writeU32(input.options.receiverUartBaud);
    writePackedFlags([
      { mask: 1 << 0, enabled: input.options.receiverInvertTx },
      { mask: 1 << 1, enabled: input.options.lockOnFirstConnection },
      { mask: 1 << 2, enabled: input.options.r9mmMiniSbus },
    ]);
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
  layoutBytes: Uint8Array | null,
): Readonly<Record<string, unknown>> {
  let layout: Readonly<Record<string, unknown>> =
    target.config.customLayout ?? Object.freeze({});
  if (target.config.layoutFile !== null) {
    if (layoutBytes === null) {
      throw new FirmwarePackageError(
        "TARGET_NOT_FOUND",
        `Official hardware layout ${target.config.layoutFile} is unavailable`,
      );
    }
    layout = parseLayout(layoutBytes);
  }
  if (target.config.overlay !== null) {
    layout = applyLayoutOverlay(layout, target.config.overlay);
  }
  return layout;
}

function platformFamily(platform: string): PlatformFamily {
  const normalized = platform.toLocaleLowerCase("en-US");
  if (normalized.includes("8285") || normalized.includes("8266")) {
    return "esp8285";
  }
  if (["esp32", "esp32-c3", "esp32-s2", "esp32-s3"].includes(normalized)) {
    return "esp32";
  }
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
  assertRegulatorySelection(input.target, validatedOptions);
  assertReleaseCompatibility(input.release, input.target);
  const family = platformFamily(input.target.config.platform);
  if (family === "stm32" && input.release.channel !== "release") {
    throw new FirmwarePackageError(
      "VERSION_UNSUPPORTED",
      "STM32 branch packaging is locked because its configuration-block version cannot be verified from a branch label",
    );
  }
  if (family === "stm32") assertStm32AssetSupport(input.release);
  const stm32SegmentAddress =
    family === "stm32" ? validatedStm32SegmentAddress(input.target) : null;
  const revision = encodePathPart(input.release.revision, "release revision");
  const region = encodePathPart(validatedOptions.region, "regulatory region");
  const firmware = encodePathPart(
    input.target.config.firmware,
    "firmware target",
  );
  const firmwareRoot = `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/${revision}/${region}/${firmware}`;
  const commonRequest = {
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: input.fetchImplementation }),
    ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
  };

  const application = await fetchRequiredAsset({
    url: `${firmwareRoot}/firmware.bin`,
    maximumBytes: MAX_FIRMWARE_ENTRY_BYTES,
    stage: "FIRMWARE_ARCHIVE",
    missingCode: "REGION_NOT_FOUND",
    ...commonRequest,
  });
  const esp32BootAssets =
    family === "esp32"
      ? await Promise.all([
          fetchRequiredAsset({
            url: `${firmwareRoot}/bootloader.bin`,
            maximumBytes: MAX_FIRMWARE_ENTRY_BYTES,
            stage: "FIRMWARE_ARCHIVE",
            missingCode: "TARGET_NOT_FOUND",
            ...commonRequest,
          }),
          fetchRequiredAsset({
            url: `${firmwareRoot}/partitions.bin`,
            maximumBytes: MAX_FIRMWARE_ENTRY_BYTES,
            stage: "FIRMWARE_ARCHIVE",
            missingCode: "TARGET_NOT_FOUND",
            ...commonRequest,
          }),
          fetchRequiredAsset({
            url: `${firmwareRoot}/boot_app0.bin`,
            maximumBytes: MAX_FIRMWARE_ENTRY_BYTES,
            stage: "FIRMWARE_ARCHIVE",
            missingCode: "TARGET_NOT_FOUND",
            ...commonRequest,
          }),
        ] as const)
      : null;
  const esp32ApplicationPartitionSize =
    esp32BootAssets === null
      ? null
      : validateEsp32SupportAssets(
          input.target.config.platform,
          esp32BootAssets,
        );

  let layoutBytes: Uint8Array | null = null;
  let logoBytes: Uint8Array | null = null;
  if (family !== "stm32" && input.target.config.layoutFile !== null) {
    const role = input.target.role === "tx" ? "TX" : "RX";
    const layoutPath = encodeArtifactPath(
      input.target.config.layoutFile,
      "hardware layout",
    );
    layoutBytes = await fetchRequiredAsset({
      url: `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/hardware/${role}/${layoutPath}`,
      maximumBytes: MAX_HARDWARE_ENTRY_BYTES,
      stage: "HARDWARE_ARCHIVE",
      missingCode: "TARGET_NOT_FOUND",
      ...commonRequest,
    });
  }
  if (family !== "stm32" && input.target.config.logoFile !== null) {
    const logoPath = encodeArtifactPath(input.target.config.logoFile, "logo");
    logoBytes = await fetchAsset({
      url: `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/${revision}/hardware/logo/${logoPath}`,
      maximumBytes: MAX_HARDWARE_ENTRY_BYTES,
      stage: "HARDWARE_ARCHIVE",
      missingCode: "TARGET_NOT_FOUND",
      optional: true,
      ...commonRequest,
    });
    logoBytes ??= await fetchRequiredAsset({
      url: `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/hardware/logo/${logoPath}`,
      maximumBytes: MAX_HARDWARE_ENTRY_BYTES,
      stage: "HARDWARE_ARCHIVE",
      missingCode: "TARGET_NOT_FOUND",
      ...commonRequest,
    });
  }

  input.onProgress?.({ stage: "EXTRACT", receivedBytes: 0, totalBytes: null });

  input.onProgress?.({
    stage: "CONFIGURE",
    receivedBytes: 0,
    totalBytes: null,
  });
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
          family,
          target: input.target,
          options: validatedOptions,
          layout: targetLayout(input.target, layoutBytes),
          logo: logoBytes,
        });
  if (
    (family === "esp8285" &&
      configuredApplication.byteLength > ESP8285_FLASH_BYTES) ||
    (family === "esp32" &&
      (esp32ApplicationPartitionSize === null ||
        configuredApplication.byteLength > esp32ApplicationPartitionSize))
  ) {
    throw new FirmwarePackageError(
      "INVALID_FIRMWARE",
      "Configured firmware image exceeds its verified application partition",
    );
  }

  let unhashedSegments: ReadonlyArray<{
    readonly name: string;
    readonly address: number;
    readonly bytes: Uint8Array;
  }>;
  if (family === "esp32") {
    if (esp32BootAssets === null) {
      throw new FirmwarePackageError(
        "TARGET_NOT_FOUND",
        "Official ESP32 boot assets are incomplete",
      );
    }
    unhashedSegments = [
      {
        name: "bootloader.bin",
        address: esp32BootAddress(input.target.config.platform),
        bytes: esp32BootAssets[0],
      },
      {
        name: "partitions.bin",
        address: ESP32_PARTITION_ADDRESS,
        bytes: esp32BootAssets[1],
      },
      {
        name: "boot_app0.bin",
        address: ESP32_BOOT_APP_ADDRESS,
        bytes: esp32BootAssets[2],
      },
      {
        name: "firmware.bin",
        address: ESP32_APPLICATION_ADDRESS,
        bytes: configuredApplication,
      },
    ];
  } else {
    unhashedSegments = [
      {
        name: "firmware.bin",
        address: stm32SegmentAddress ?? 0,
        bytes: configuredApplication,
      },
    ];
  }

  input.onProgress?.({ stage: "HASH", receivedBytes: 0, totalBytes: null });
  const segments = await createSegments(unhashedSegments);
  input.onProgress?.({ stage: "PACKAGE", receivedBytes: 0, totalBytes: null });

  const baseName = input.target.targetKey.replace(/[^A-Za-z0-9_.-]+/gu, "-");
  const primaryFileName =
    family === "esp8285"
      ? `${baseName}-${input.release.label}.bin.gz`
      : `${baseName}-${input.release.label}.bin`;
  const primaryDownload =
    family === "esp8285"
      ? gzipSync(configuredApplication, { level: 9 })
      : configuredApplication;
  const primaryMimeType =
    family === "esp8285" ? "application/gzip" : "application/octet-stream";
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
