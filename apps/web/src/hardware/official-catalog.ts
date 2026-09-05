import { parseOfficialTargetsFlexible } from "./official-target-index";
import type {
  OfficialCatalog,
  OfficialRelease,
  OfficialTarget,
} from "./parity-types";

export const EXPRESSLRS_WEB_FLASHER_ASSET_BASE =
  "https://expresslrs.github.io/web-flasher/assets/firmware" as const;

const MAX_INDEX_BYTES = 512 * 1024;
const MAX_TARGET_JSON_BYTES = 8 * 1024 * 1024;
const MAX_RELEASES = 128;
const MAX_RESPONSE_CHUNKS = 16_384;
const SAFE_KEY = /^[A-Za-z0-9_.@+ -]{1,160}$/u;
const SAFE_REVISION = /^[0-9a-f]{40}$/u;

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

export async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
  onProgress?: (received: number, total: number | null) => void,
): Promise<Uint8Array> {
  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // Preserve the bounded HTTP failure even if stream cancellation fails.
    }
    throw new OfficialCatalogError(
      "HTTP",
      `Official ExpressLRS server returned HTTP ${response.status}`,
    );
  }
  const declaredHeader = response.headers.get("content-length");
  const declared =
    declaredHeader === null ? Number.NaN : Number(declaredHeader);
  const total =
    Number.isSafeInteger(declared) && declared >= 0 ? declared : null;
  if (total !== null && total > maximumBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // Preserve the declared-size failure even if stream cancellation fails.
    }
    throw new OfficialCatalogError(
      "TOO_LARGE",
      `Official response exceeds the ${maximumBytes}-byte limit`,
    );
  }

  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw new OfficialCatalogError(
        "TOO_LARGE",
        "Official response is too large",
      );
    }
    onProgress?.(bytes.byteLength, total);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let chunkCount = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunkCount += 1;
      if (chunkCount > MAX_RESPONSE_CHUNKS) {
        await reader.cancel();
        throw new OfficialCatalogError(
          "TOO_LARGE",
          "Official response contains too many streaming chunks",
        );
      }
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
      headers: { Accept: "application/json" },
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
      error instanceof Error
        ? error.message
        : "Official catalog request failed",
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
  const parse = (value: string) => {
    const match =
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
        value,
      );
    if (match === null) return null;
    return {
      core: match.slice(1, 4) as [string, string, string],
      prerelease: match[4]?.split(".") ?? [],
    };
  };
  const compareNumeric = (a: string, b: string): number => {
    if (a.length !== b.length) return a.length - b.length;
    return a === b ? 0 : a < b ? -1 : 1;
  };
  const compareNatural = (a: string, b: string): number => {
    const aParts = a.match(/\d+|\D+/gu) ?? [];
    const bParts = b.match(/\d+|\D+/gu) ?? [];
    const length = Math.max(aParts.length, bParts.length);
    for (let index = 0; index < length; index += 1) {
      const aPart = aParts[index];
      const bPart = bParts[index];
      if (aPart === undefined || bPart === undefined) {
        return aPart === bPart ? 0 : aPart === undefined ? -1 : 1;
      }
      if (aPart === bPart) continue;
      const aNumeric = /^\d+$/u.test(aPart);
      const bNumeric = /^\d+$/u.test(bPart);
      if (aNumeric && bNumeric) return compareNumeric(aPart, bPart);
      return aPart < bPart ? -1 : 1;
    }
    return 0;
  };
  const comparePrerelease = (
    a: readonly string[],
    b: readonly string[],
  ): number => {
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const aPart = a[index];
      const bPart = b[index];
      if (aPart === undefined || bPart === undefined) {
        return aPart === bPart ? 0 : aPart === undefined ? -1 : 1;
      }
      if (aPart === bPart) continue;
      const aNumeric = /^\d+$/u.test(aPart);
      const bNumeric = /^\d+$/u.test(bPart);
      if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
      return aNumeric
        ? compareNumeric(aPart, bPart)
        : compareNatural(aPart, bPart);
    }
    return 0;
  };
  const a = parse(left);
  const b = parse(right);
  if (a !== null && b !== null) {
    for (let index = 0; index < 3; index += 1) {
      const delta = compareNumeric(a.core[index] ?? "0", b.core[index] ?? "0");
      if (delta !== 0) return -delta;
    }
    if (a.prerelease.length === 0 || b.prerelease.length === 0) {
      if (a.prerelease.length !== b.prerelease.length) {
        return a.prerelease.length === 0 ? -1 : 1;
      }
    } else {
      const delta = comparePrerelease(a.prerelease, b.prerelease);
      if (delta !== 0) return -delta;
    }
  } else if (a !== null) {
    return -1;
  } else if (b !== null) {
    return 1;
  }
  return right.localeCompare(left, "en");
}

export function parseOfficialReleaseIndex(
  value: unknown,
): readonly OfficialRelease[] {
  if (!isRecord(value)) {
    throw new OfficialCatalogError(
      "INVALID_SCHEMA",
      "Release index is not an object",
    );
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
    }
  }
  if (releases.length === 0) {
    throw new OfficialCatalogError(
      "INVALID_SCHEMA",
      "Release index contains no bounded release entries",
    );
  }
  releases.sort((left, right) => compareReleaseLabels(left.label, right.label));
  return Object.freeze(releases.slice(0, MAX_RELEASES));
}

export function parseOfficialTargets(
  value: unknown,
): readonly OfficialTarget[] {
  try {
    return parseOfficialTargetsFlexible(value);
  } catch (error: unknown) {
    throw new OfficialCatalogError(
      "INVALID_SCHEMA",
      error instanceof Error
        ? error.message
        : "Official target catalog could not be decoded",
    );
  }
}

export async function loadOfficialExpressLrsCatalog(
  input: {
    readonly signal?: AbortSignal;
    readonly fetchImplementation?: typeof fetch;
    readonly onProgress?: (
      stage: "INDEX" | "HARDWARE",
      received: number,
      total: number | null,
    ) => void;
  } = {},
): Promise<OfficialCatalog> {
  const indexBytes = await fetchBytes({
    url: `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/index.json`,
    maximumBytes: MAX_INDEX_BYTES,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: input.fetchImplementation }),
    onProgress: (received, total) =>
      input.onProgress?.("INDEX", received, total),
  });
  const targetBytes = await fetchBytes({
    url: `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/hardware/targets.json`,
    maximumBytes: MAX_TARGET_JSON_BYTES,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: input.fetchImplementation }),
    onProgress: (received, total) =>
      input.onProgress?.("HARDWARE", received, total),
  });
  const releases = parseOfficialReleaseIndex(parseJson(indexBytes));
  const targets = parseOfficialTargets(parseJson(targetBytes));
  return Object.freeze({
    source: "EXPRESSLRS_WEB_FLASHER_MIRROR",
    loadedAt: new Date().toISOString(),
    releases,
    targets,
  });
}
