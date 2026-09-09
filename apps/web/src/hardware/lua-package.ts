import { OfficialCatalogError, readBoundedResponse } from "./official-catalog";
import { isTrustedOfficialExpressLrsUrl } from "./official-source";
import type { OfficialRelease, OfficialTarget } from "./parity-types";

const MAX_LUA_SCRIPT_BYTES = 512 * 1024;
const EXPRESSLRS_WEB_FLASHER_ASSET_BASE =
  "https://expresslrs.github.io/web-flasher/assets/firmware";
const LUA_SCRIPT_V3 = "elrsV3.lua";
const LUA_SCRIPT_V4 = "elrs.lua";

export class LuaPackageError extends Error {
  public constructor(
    public readonly code:
      | "NOT_AVAILABLE"
      | "NETWORK"
      | "ABORTED"
      | "TIMEOUT"
      | "UNTRUSTED_REDIRECT"
      | "SCRIPT_NOT_FOUND"
      | "SCRIPT_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "LuaPackageError";
  }
}

function abortBridge(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Readonly<{
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
}> {
  const controller = new AbortController();
  let timeoutReached = false;
  const relay = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", relay, { once: true });
  if (signal?.aborted === true) relay();
  const timer = setTimeout(() => {
    timeoutReached = true;
    controller.abort(
      new DOMException("Lua download timed out", "TimeoutError"),
    );
  }, timeoutMs);
  return Object.freeze({
    signal: controller.signal,
    timedOut: () => timeoutReached,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
    },
  });
}

function abortError(timedOut: boolean): LuaPackageError {
  return timedOut
    ? new LuaPackageError(
        "TIMEOUT",
        "Official Lua script request exceeded its bounded deadline",
      )
    : new LuaPackageError("ABORTED", "Lua script request was cancelled");
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function scriptForRelease(release: OfficialRelease): string {
  const match = /^v?(\d+)(?:\.|$)/iu.exec(release.label.trim());
  if (match?.[1] === undefined) return LUA_SCRIPT_V4;
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major) || major < 0) return LUA_SCRIPT_V4;
  return major < 4 ? LUA_SCRIPT_V3 : LUA_SCRIPT_V4;
}

function isExpectedFinalUrl(value: string, requestedUrl: string): boolean {
  if (!isTrustedOfficialExpressLrsUrl(value)) return false;
  try {
    const finalUrl = new URL(value);
    const requested = new URL(requestedUrl);
    return (
      finalUrl.origin === requested.origin &&
      finalUrl.pathname === requested.pathname &&
      finalUrl.search === "" &&
      finalUrl.hash === ""
    );
  } catch {
    return false;
  }
}

export async function acquireOfficialLuaScript(input: {
  readonly release: OfficialRelease;
  readonly target: OfficialTarget;
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
}): Promise<Readonly<{ fileName: string; bytes: Uint8Array }>> {
  if (input.target.role !== "tx") {
    throw new LuaPackageError(
      "NOT_AVAILABLE",
      "The ExpressLRS Lua script is only available for transmitters",
    );
  }
  if (input.signal?.aborted === true) {
    throw abortError(false);
  }
  const fileName = scriptForRelease(input.release);
  const requestedUrl = `${EXPRESSLRS_WEB_FLASHER_ASSET_BASE}/${encodeURIComponent(input.release.revision)}/lua/${fileName}`;
  const bridge = abortBridge(input.signal, 45_000);
  let response: Response | null = null;
  try {
    response = await withAbort(
      (input.fetchImplementation ?? fetch)(requestedUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: bridge.signal,
        headers: { Accept: "text/plain, application/octet-stream;q=0.9" },
      }),
      bridge.signal,
    );
    const finalUrl = response.url || requestedUrl;
    if (!isExpectedFinalUrl(finalUrl, requestedUrl)) {
      try {
        await response.body?.cancel();
      } catch {
        // Preserve the source-integrity error.
      }
      throw new LuaPackageError(
        "UNTRUSTED_REDIRECT",
        "Official Lua script request ended at an unexpected URL",
      );
    }
    if (response.status === 404) {
      throw new LuaPackageError(
        "SCRIPT_NOT_FOUND",
        `Official ${fileName} was not found`,
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = await withAbort(
        readBoundedResponse(response, MAX_LUA_SCRIPT_BYTES),
        bridge.signal,
      );
    } catch (error: unknown) {
      if (bridge.signal.aborted) throw abortError(bridge.timedOut());
      if (error instanceof OfficialCatalogError && error.code === "TOO_LARGE") {
        throw new LuaPackageError("SCRIPT_TOO_LARGE", error.message);
      }
      throw new LuaPackageError(
        "NETWORK",
        error instanceof Error ? error.message : "Lua script request failed",
      );
    }
    if (bytes.byteLength === 0) {
      throw new LuaPackageError(
        "SCRIPT_NOT_FOUND",
        `Official ${fileName} is empty`,
      );
    }
    return Object.freeze({
      fileName,
      bytes,
    });
  } catch (error: unknown) {
    if (bridge.signal.aborted) throw abortError(bridge.timedOut());
    if (error instanceof LuaPackageError) throw error;
    throw new LuaPackageError(
      "NETWORK",
      error instanceof Error ? error.message : "Lua script request failed",
    );
  } finally {
    bridge.dispose();
    if (bridge.signal.aborted && response?.body != null) {
      void response.body.cancel().catch(() => undefined);
    }
  }
}
