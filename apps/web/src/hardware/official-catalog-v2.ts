import { unzipSync } from "fflate";

import { parseOfficialReleaseIndexFlexible } from "./official-index";
import { fetchOfficialExpressLrsResource } from "./official-source";
import { parseOfficialTargetsFlexible } from "./official-target-index";
import type { OfficialCatalog } from "./parity-types";

const MAX_INDEX_BYTES = 512 * 1024;
const MAX_HARDWARE_ARCHIVE_BYTES = 24 * 1024 * 1024;
const MAX_TARGET_JSON_BYTES = 8 * 1024 * 1024;

export class OfficialCatalogV2Error extends Error {
  public constructor(
    public readonly code:
      | "NETWORK"
      | "TOO_LARGE"
      | "JSON"
      | "ARCHIVE"
      | "TARGETS_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "OfficialCatalogV2Error";
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
  const timer = setTimeout(
    () => controller.abort(new DOMException("Official request timed out", "TimeoutError")),
    timeoutMs,
  );
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted === true) onAbort();
  return Object.freeze({
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  });
}

async function readBounded(
  response: Response,
  maximumBytes: number,
  onProgress?: (received: number, total: number | null) => void,
): Promise<Uint8Array> {
  if (!response.ok) {
    throw new OfficialCatalogV2Error(
      "NETWORK",
      `Official ExpressLRS source returned HTTP ${response.status}`,
    );
  }
  const declaredValue = response.headers.get("content-length");
  const declared =
    declaredValue === null ? null : Number.parseInt(declaredValue, 10);
  if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0)) {
    throw new OfficialCatalogV2Error(
      "NETWORK",
      "Official source returned an invalid Content-Length",
    );
  }
  if (declared !== null && declared > maximumBytes) {
    throw new OfficialCatalogV2Error(
      "TOO_LARGE",
      `Official response exceeds ${maximumBytes} bytes`,
    );
  }
  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw new OfficialCatalogV2Error("TOO_LARGE", "Official response is too large");
    }
    onProgress?.(bytes.byteLength, declared);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (result.value.byteLength === 0) continue;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new OfficialCatalogV2Error("TOO_LARGE", "Official response is too large");
      }
      chunks.push(result.value.slice());
      onProgress?.(total, declared);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new OfficialCatalogV2Error(
      "JSON",
      "Official ExpressLRS JSON could not be decoded safely",
    );
  }
}

function targetJsonFromArchive(bytes: Uint8Array): Uint8Array {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        return (
          /(^|\/)targets\.json$/iu.test(file.name.replaceAll("\\", "/")) &&
          file.originalSize <= MAX_TARGET_JSON_BYTES
        );
      },
    });
  } catch {
    throw new OfficialCatalogV2Error(
      "ARCHIVE",
      "Official hardware archive could not be decompressed safely",
    );
  }
  const matches = Object.entries(entries).filter(([name, value]) => {
    const normalized = name.replaceAll("\\", "/");
    return (
      /(^|\/)targets\.json$/iu.test(normalized) &&
      value.byteLength <= MAX_TARGET_JSON_BYTES
    );
  });
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new OfficialCatalogV2Error(
      "TARGETS_NOT_FOUND",
      `Expected one targets.json entry, found ${matches.length}`,
    );
  }
  return matches[0][1];
}

export async function loadOfficialExpressLrsCatalogV2(input: {
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
  readonly onProgress?: (
    stage: "INDEX" | "TARGETS",
    receivedBytes: number,
    totalBytes: number | null,
  ) => void;
} = {}): Promise<OfficialCatalog> {
  const bridge = abortBridge(input.signal, 60_000);
  try {
    const indexResponse = await fetchOfficialExpressLrsResource({
      path: "index.json",
      signal: bridge.signal,
      ...(input.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: input.fetchImplementation }),
      accept: "application/json",
    });
    const indexBytes = await readBounded(
      indexResponse,
      MAX_INDEX_BYTES,
      (received, total) => input.onProgress?.("INDEX", received, total),
    );
    const hardwareResponse = await fetchOfficialExpressLrsResource({
      path: "hardware.zip",
      signal: bridge.signal,
      ...(input.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: input.fetchImplementation }),
      accept: "application/zip",
    });
    const hardwareBytes = await readBounded(
      hardwareResponse,
      MAX_HARDWARE_ARCHIVE_BYTES,
      (received, total) => input.onProgress?.("TARGETS", received, total),
    );
    const releases = parseOfficialReleaseIndexFlexible(parseJson(indexBytes));
    const targets = parseOfficialTargetsFlexible(
      parseJson(targetJsonFromArchive(hardwareBytes)),
    );
    return Object.freeze({
      source: "EXPRESSLRS_ARTIFACTORY",
      loadedAt: new Date().toISOString(),
      releases,
      targets,
    });
  } catch (error: unknown) {
    if (error instanceof OfficialCatalogV2Error) throw error;
    throw new OfficialCatalogV2Error(
      "NETWORK",
      error instanceof Error ? error.message : "Official catalog request failed",
    );
  } finally {
    bridge.dispose();
  }
}
