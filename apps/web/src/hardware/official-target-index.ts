import type {
  ExpressLrsFlashMethod,
  OfficialTarget,
  OfficialTargetConfig,
} from "./parity-types";

export class OfficialTargetIndexError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OfficialTargetIndexError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeKey(value: unknown, maximum = 160): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    /^[A-Za-z0-9_.@+ /()-]+$/u.test(value)
    ? value
    : null;
}

function safeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return safeKey(value);
}

function safeRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? Object.freeze({ ...value }) : null;
}

function normalizeMethod(value: unknown): ExpressLrsFlashMethod | null {
  if (typeof value !== "string") return null;
  switch (value.toLocaleLowerCase("en-US")) {
    case "uart":
    case "serial":
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
    case "st-link":
      return "stlink";
    case "dir":
    case "stock":
    case "download":
      return "download";
    default:
      return null;
  }
}

function roleFromValue(value: unknown): OfficialTarget["role"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLocaleLowerCase("en-US");
  if (normalized === "tx" || normalized.includes("transmitter")) return "tx";
  if (normalized === "rx" || normalized.includes("receiver")) return "rx";
  return null;
}

function roleFromPath(path: readonly string[]): OfficialTarget["role"] | null {
  for (const part of path.toReversed()) {
    const normalized = part.toLocaleLowerCase("en-US");
    if (
      /^tx(?:_|-|$)/u.test(normalized) ||
      normalized.includes("transmitter")
    ) {
      return "tx";
    }
    if (/^rx(?:_|-|$)/u.test(normalized) || normalized.includes("receiver")) {
      return "rx";
    }
  }
  return null;
}

function configFromRecord(
  value: Readonly<Record<string, unknown>>,
): OfficialTargetConfig | null {
  const productName = safeKey(value.product_name);
  const platform = safeKey(value.platform);
  const firmware = safeKey(value.firmware);
  if (productName === null || platform === null || firmware === null)
    return null;
  const sourceMethods = Array.isArray(value.upload_methods)
    ? value.upload_methods
    : typeof value.upload_method === "string"
      ? [value.upload_method]
      : [];
  const methods = sourceMethods
    .map(normalizeMethod)
    .filter((method): method is ExpressLrsFlashMethod => method !== null);
  const uploadMethods = [...new Set(methods)];
  if (!uploadMethods.includes("download")) uploadMethods.push("download");
  return Object.freeze({
    productName,
    platform,
    firmware,
    luaName: safeOptionalString(value.lua_name),
    layoutFile: safeOptionalString(value.layout_file),
    logoFile: safeOptionalString(value.logo_file),
    uploadMethods: Object.freeze(uploadMethods),
    minVersion: safeOptionalString(value.min_version),
    customLayout: safeRecord(value.custom_layout),
    overlay: safeRecord(value.overlay),
    raw: Object.freeze({ ...value }),
  });
}

interface WalkContext {
  readonly path: readonly string[];
  readonly vendorKey: string;
  readonly vendorName: string;
}

export function parseOfficialTargetsFlexible(
  value: unknown,
): readonly OfficialTarget[] {
  if (!isRecord(value)) {
    throw new OfficialTargetIndexError(
      "Official target catalog is not an object",
    );
  }
  const output = new Map<string, OfficialTarget>();
  const visited = new Set<object>();

  const walk = (
    node: Readonly<Record<string, unknown>>,
    context: WalkContext,
    depth: number,
  ) => {
    if (depth > 6 || output.size > 4_096 || visited.has(node)) return;
    visited.add(node);
    const config = configFromRecord(node);
    if (config !== null) {
      const role =
        roleFromValue(node.device_type) ??
        roleFromValue(node.role) ??
        roleFromPath(context.path);
      const targetKey = safeKey(context.path.at(-1) ?? "");
      const radioKey =
        [...context.path]
          .toReversed()
          .find((part) => roleFromPath([part]) !== null) ??
        safeKey(node.radio) ??
        `${role ?? "unknown"}_unknown`;
      if (role !== null && targetKey !== null && safeKey(radioKey) !== null) {
        const id = `${context.vendorKey}/${radioKey}/${targetKey}`;
        output.set(
          id,
          Object.freeze({
            id,
            role,
            vendorKey: context.vendorKey,
            vendorName: context.vendorName,
            radioKey,
            targetKey,
            config,
          }),
        );
      }
      return;
    }

    for (const [keyValue, child] of Object.entries(node).slice(0, 1_024)) {
      if (
        keyValue === "__proto__" ||
        keyValue === "prototype" ||
        keyValue === "constructor"
      ) {
        continue;
      }
      const key = safeKey(keyValue);
      if (key === null || !isRecord(child)) continue;
      const nextVendorKey = depth === 0 ? key : context.vendorKey;
      const nextVendorName =
        depth === 0 ? (safeKey(child.name) ?? key) : context.vendorName;
      walk(
        child,
        {
          path: Object.freeze([...context.path, key]),
          vendorKey: nextVendorKey,
          vendorName: nextVendorName,
        },
        depth + 1,
      );
    }
  };

  walk(
    value,
    { path: Object.freeze([]), vendorKey: "unknown", vendorName: "Unknown" },
    0,
  );
  if (output.size === 0) {
    throw new OfficialTargetIndexError(
      "Official target catalog contains no bounded TX/RX definitions",
    );
  }
  return Object.freeze(
    [...output.values()].sort((left, right) =>
      `${left.role}/${left.vendorName}/${left.radioKey}/${left.config.productName}`.localeCompare(
        `${right.role}/${right.vendorName}/${right.radioKey}/${right.config.productName}`,
        "en",
      ),
    ),
  );
}
