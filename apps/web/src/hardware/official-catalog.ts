import { unzipSync } from "fflate";

import type {
  ExpressLrsFlashMethod,
  OfficialCatalog,
  OfficialRelease,
  OfficialTarget,
  OfficialTargetConfig,
} from "./parity-types";

export const EXPRESSLRS_ARTIFACT_BASE =
  "https://artifactory.expresslrs.org/ExpressLRS" as const;

const MAX_INDEX_BYTES = 512 * 1024;
const MAX_HARDWARE_ARCHIVE_BYTES = 24 * 1024 * 1024;
const MAX_TARGET_JSON_BYTES = 8 * 1024 * 1024;
const SAFE_KEY = /^[A-Za-z0-9_.@+ -]{1,160}$/u;
const SAFE_REVISION = /^[A-Za-z0-9._-]{1,128}$/u;

export class OfficialCatalogError extends Error {
  public constructor(
    public readonly code:
      | "NETWORK"
      | "HTTP"
      | "TOO_LARGE"
      | "INVALID_JSON"
      | "INVALID_SCHEMA"
      | "ARCHIVE",
    message: string,
  ) {
    super(message);
    this.name = "OfficialCatalogError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeKey(value: unknown): string | null {
  return typeof value === "string" && SAFE_KEY.test(value) ? value : null;
}

function safeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return safeKey(value);
}

function safeRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? Object.freeze({ ...value }) : null;
}

function abortBridge(signal: AbortSignal | undefined, timeoutMs: number): {
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

export async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
  onProgress?: (received: number, total: number | null) => void,
): Promise<Uint8Array> {
  if (!response.ok) {
    throw new OfficialCatalogError(
      "HTTP",
      `Official ExpressLRS server returned HTTP ${response.status}`,
    );
  }
  const declared = Number(response.headers.get("content-length"));
  const total = Number.isSafeInteger(declared) && declared >= 0 ? declared : null;
  if (total !== null && total > maximumBytes) {
    throw new OfficialCatalogError(
      "TOO_LARGE",
      `Official response exceeds the ${maximumBytes}-byte limit`,
    );
  }

  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw new OfficialCatalogError("TOO_LARGE", "Official response is too large");
    }
    onProgress?.(bytes.byteLength, total);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (result.value.byteLength === 0) continue;
      received += result.value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        throw new OfficialCatalogError(
          "TOO_LARGE",
          `Official response crossed the ${maximumBytes}-byte limit`,
        );
      }
      chunks.push(result.value);
      onProgress?.(received, total);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

async function fetchBytes(input: {
  readonly url: string;
  readonly maximumBytes: number;
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
  readonly onProgress?: (received: number, total: number | null) => void;
}): Promise<Uint8Array> {
  const bridge = abortBridge(input.signal, 45_000);
  try {
    const fetchImplementation = input.fetchImplementation ?? fetch;
    const response = await fetchImplementation(input.url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: bridge.signal,
      headers: { Accept: "application/json, application/zip;q=0.9" },
    });
    return await readBoundedResponse(
      response,
      input.maximumBytes,
      input.onProgress,
    );
  } catch (error: unknown) {
    if (error instanceof OfficialCatalogError) throw error;
    throw new OfficialCatalogError(
      "NETWORK",
      error instanceof Error ? error.message : "Official catalog request failed",
    );
  } finally {
    bridge.dispose();
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new OfficialCatalogError(
      "INVALID_JSON",
      "Official ExpressLRS data is not valid UTF-8 JSON",
    );
  }
}

function compareReleaseLabels(left: string, right: string): number {
  const numberParts = (value: string) =>
    value
      .replace(/^v/u, "")
      .split(/[.-]/u)
      .slice(0, 4)
      .map((part) => Number.parseInt(part, 10));
  const a = numberParts(left);
  const b = numberParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (b[index] ?? -1) - (a[index] ?? -1);
    if (delta !== 0) return delta;
  }
  return right.localeCompare(left, "en");
}

export function parseOfficialReleaseIndex(value: unknown): readonly OfficialRelease[] {
  if (!isRecord(value)) {
    throw new OfficialCatalogError("INVALID_SCHEMA", "Release index is not an object");
  }
  const releases: OfficialRelease[] = [];
  for (const [property, channel] of [
    ["tags", "release"],
    ["branches", "branch"],
  ] as const) {
    const entries = value[property];
    if (!isRecord(entries)) continue;
    for (const [labelValue, revisionValue] of Object.entries(entries)) {
      const label = safeKey(labelValue);
      const revision =
        typeof revisionValue === "string" && SAFE_REVISION.test(revisionValue)
          ? revisionValue
          : null;
      if (label === null || revision === null) continue;
      releases.push(Object.freeze({ label, revision, channel }));
      if (releases.length >= 128) break;
    }
  }
  if (releases.length === 0) {
    throw new OfficialCatalogError(
      "INVALID_SCHEMA",
      "Release index contains no bounded release entries",
    );
  }
  releases.sort((left, right) => compareReleaseLabels(left.label, right.label));
  return Object.freeze(releases);
}

function normalizeUploadMethod(value: unknown): ExpressLrsFlashMethod | null {
  if (typeof value !== "string") return null;
  switch (value.toLocaleLowerCase("en-US")) {
    case "uart":
      return "uart";
    case "bf":
    case "betaflight":
      return "betaflight";
    case "etx":
    case "edgetx":
      return "edgetx";
    case "passthru":
    case "passthrough":
      return "passthru";
    case "wifi":
      return "wifi";
    case "stlink":
      return "stlink";
    case "dir":
    case "stock":
    case "download":
      return "download";
    default:
      return null;
  }
}

function parseTargetConfig(value: unknown): OfficialTargetConfig | null {
  if (!isRecord(value)) return null;
  const productName = safeKey(value.product_name);
  const platform = safeKey(value.platform);
  const firmware = safeKey(value.firmware);
  if (productName === null || platform === null || firmware === null) return null;
  const methods = Array.isArray(value.upload_methods)
    ? value.upload_methods
        .map(normalizeUploadMethod)
        .filter((method): method is ExpressLrsFlashMethod => method !== null)
    : [];
  const deduplicated = [...new Set(methods)];
  if (!deduplicated.includes("download")) deduplicated.push("download");
  return Object.freeze({
    productName,
    platform,
    firmware,
    luaName: safeOptionalString(value.lua_name),
    layoutFile: safeOptionalString(value.layout_file),
    logoFile: safeOptionalString(value.logo_file),
    uploadMethods: Object.freeze(deduplicated),
    minVersion: safeOptionalString(value.min_version),
    customLayout: safeRecord(value.custom_layout),
    overlay: safeRecord(value.overlay),
    raw: Object.freeze({ ...value }),
  });
}

export function parseOfficialTargets(value: unknown): readonly OfficialTarget[] {
  if (!isRecord(value)) {
    throw new OfficialCatalogError("INVALID_SCHEMA", "Target catalog is not an object");
  }
  const targets: OfficialTarget[] = [];
  for (const [vendorKeyValue, vendorValue] of Object.entries(value)) {
    const vendorKey = safeKey(vendorKeyValue);
    if (vendorKey === null || !isRecord(vendorValue)) continue;
    const vendorName = safeKey(vendorValue.name) ?? vendorKey;
    for (const [radioKeyValue, radioValue] of Object.entries(vendorValue)) {
      const radioKey = safeKey(radioKeyValue);
      if (radioKey === null || !isRecord(radioValue)) continue;
      const role = radioKey.startsWith("tx_")
        ? "tx"
        : radioKey.startsWith("rx_")
          ? "rx"
          : null;
      if (role === null) continue;
      for (const [targetKeyValue, configValue] of Object.entries(radioValue)) {
        const targetKey = safeKey(targetKeyValue);
        const config = parseTargetConfig(configValue);
        if (targetKey === null || config === null) continue;
        targets.push(
          Object.freeze({
            id: `${vendorKey}/${radioKey}/${targetKey}`,
            role,
            vendorKey,
            vendorName,
            radioKey,
            targetKey,
            config,
          }),
        );
        if (targets.length > 4_096) {
          throw new OfficialCatalogError(
            "INVALID_SCHEMA",
            "Target catalog exceeds the bounded target count",
          );
        }
      }
    }
  }
  if (targets.length === 0) {
    throw new OfficialCatalogError(
      "INVALID_SCHEMA",
      "Target catalog contains no TX/RX definitions",
    );
  }
  targets.sort((left, right) =>
    `${left.role}/${left.vendorName}/${left.radioKey}/${left.config.productName}`.localeCompare(
      `${right.role}/${right.vendorName}/${right.radioKey}/${right.config.productName}`,
      "en",
    ),
  );
  return Object.freeze(targets);
}

function targetJsonFromHardwareArchive(archive: Uint8Array): Uint8Array {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archive, {
      filter(file) {
        return /(^|\/)targets\.json$/iu.test(file.name);
      },
    });
  } catch {
    throw new OfficialCatalogError(
      "ARCHIVE",
      "Official hardware archive could not be decompressed",
    );
  }
  const matches = Object.entries(entries).filter(([name]) =>
    /(^|\/)targets\.json$/iu.test(name),
  );
  if (matches.length !== 1) {
    throw new OfficialCatalogError(
      "ARCHIVE",
      "Official hardware archive does not contain one unambiguous targets.json",
    );
  }
  const bytes = matches[0]?.[1];
  if (bytes === undefined || bytes.byteLength > MAX_TARGET_JSON_BYTES) {
    throw new OfficialCatalogError(
      "TOO_LARGE",
      "Official targets.json is missing or exceeds its size limit",
    );
  }
  return bytes;
}

export async function loadOfficialExpressLrsCatalog(input: {
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
  readonly onProgress?: (
    stage: "INDEX" | "HARDWARE",
    received: number,
    total: number | null,
  ) => void;
} = {}): Promise<OfficialCatalog> {
  const indexBytes = await fetchBytes({
    url: `${EXPRESSLRS_ARTIFACT_BASE}/index.json`,
    maximumBytes: MAX_INDEX_BYTES,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: input.fetchImplementation }),
    onProgress: (received, total) =>
      input.onProgress?.("INDEX", received, total),
  });
  const hardwareBytes = await fetchBytes({
    url: `${EXPRESSLRS_ARTIFACT_BASE}/hardware.zip`,
    maximumBytes: MAX_HARDWARE_ARCHIVE_BYTES,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: input.fetchImplementation }),
    onProgress: (received, total) =>
      input.onProgress?.("HARDWARE", received, total),
  });
  const releases = parseOfficialReleaseIndex(parseJson(indexBytes));
  const targets = parseOfficialTargets(
    parseJson(targetJsonFromHardwareArchive(hardwareBytes)),
  );
  return Object.freeze({
    source: "EXPRESSLRS_ARTIFACTORY",
    loadedAt: new Date().toISOString(),
    releases,
    targets,
  });
}
