import { unzipSync } from "fflate";

import {
  EXPRESSLRS_ARTIFACT_BASE,
  OfficialCatalogError,
  readBoundedResponse,
} from "./official-catalog";
import type { OfficialRelease, OfficialTarget } from "./parity-types";

const MAX_LUA_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_LUA_SCRIPT_BYTES = 512 * 1024;

export class LuaPackageError extends Error {
  public constructor(
    public readonly code:
      | "NOT_AVAILABLE"
      | "NETWORK"
      | "ARCHIVE"
      | "SCRIPT_NOT_FOUND"
      | "SCRIPT_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "LuaPackageError";
  }
}

function normalizedLeaf(path: string): string {
  return (path.replaceAll("\\", "/").split("/").at(-1) ?? "").toLocaleLowerCase(
    "en-US",
  );
}

export async function acquireOfficialLuaScript(input: {
  readonly release: OfficialRelease;
  readonly target: OfficialTarget;
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
}): Promise<Readonly<{ fileName: string; bytes: Uint8Array }>> {
  const luaName = input.target.config.luaName;
  if (input.target.role !== "tx" || luaName === null) {
    throw new LuaPackageError(
      "NOT_AVAILABLE",
      "The selected Target does not declare a transmitter Lua script",
    );
  }
  let response: Response;
  try {
    response = await (input.fetchImplementation ?? fetch)(
      `${EXPRESSLRS_ARTIFACT_BASE}/${encodeURIComponent(input.release.revision)}/lua.zip`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        headers: { Accept: "application/zip" },
      },
    );
  } catch (error: unknown) {
    throw new LuaPackageError(
      "NETWORK",
      error instanceof Error ? error.message : "Lua archive request failed",
    );
  }
  let archive: Uint8Array;
  try {
    archive = await readBoundedResponse(response, MAX_LUA_ARCHIVE_BYTES);
  } catch (error: unknown) {
    if (error instanceof OfficialCatalogError && error.code === "TOO_LARGE") {
      throw new LuaPackageError("SCRIPT_TOO_LARGE", error.message);
    }
    throw new LuaPackageError(
      "NETWORK",
      error instanceof Error ? error.message : "Lua archive request failed",
    );
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archive, {
      filter(file) {
        return (
          normalizedLeaf(file.name) === luaName.toLocaleLowerCase("en-US") &&
          file.originalSize <= MAX_LUA_SCRIPT_BYTES
        );
      },
    });
  } catch {
    throw new LuaPackageError(
      "ARCHIVE",
      "Official Lua archive could not be decompressed safely",
    );
  }
  const matches = Object.entries(entries).filter(
    ([path, bytes]) =>
      normalizedLeaf(path) === luaName.toLocaleLowerCase("en-US") &&
      bytes.byteLength <= MAX_LUA_SCRIPT_BYTES,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new LuaPackageError(
      "SCRIPT_NOT_FOUND",
      `Expected one ${luaName} script, found ${matches.length}`,
    );
  }
  return Object.freeze({
    fileName: luaName,
    bytes: matches[0][1],
  });
}
