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

function cleanText(value: string, maximum: number): string | null {
  const normalized = value
    .normalize("NFC")
    .trim()
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "");
  return normalized.length > 0 &&
    normalized.length <= maximum &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)
    ? normalized
    : null;
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = cleanText(value, 160);
  if (
    normalized === null ||
    normalized.includes("..") ||
    /[\\/]/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function safeDisplay(value: unknown): string | null {
  return typeof value === "string" ? cleanText(value, 200) : null;
}

function safeArtifactName(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = cleanText(value.replaceAll("\\", "/"), 240);
  if (
    normalized === null ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
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
    case "dfu":
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
  for (const part of [...path].reverse()) {
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

function radioKeyFromPath(path: readonly string[]): string | null {
  for (const part of [...path].reverse()) {
    const normalized = part.toLocaleLowerCase("en-US");
    if (/^(?:tx|rx)(?:_|-|$)/u.test(normalized)) return part;
  }
  return (
    [...path].reverse().find((part) => roleFromPath([part]) !== null) ?? null
  );
}

function configFromRecord(
  value: Readonly<Record<string, unknown>>,
): OfficialTargetConfig | null {
  const productName = safeDisplay(value.product_name);
  const platform = safeIdentifier(value.platform);
  const firmware = safeIdentifier(value.firmware);
  if (productName === null || platform === null || firmware === null)
    return null;
  const sourceMethods = Array.isArray(value.upload_methods)
    ? value.upload_methods
    : typeof value.upload_method === "string"
      ? [value.upload_method]
      : [];
  const methods = sourceMethods
    .slice(0, 32)
    .map(normalizeMethod)
    .filter((method): method is ExpressLrsFlashMethod => method !== null);
  const uploadMethods = [...new Set(methods)];
  if (!uploadMethods.includes("download")) uploadMethods.push("download");
  return Object.freeze({
    productName,
    platform,
    firmware,
    luaName: safeArtifactName(value.lua_name),
    layoutFile: safeArtifactName(value.layout_file),
    logoFile: safeArtifactName(value.logo_file),
    uploadMethods: Object.freeze(uploadMethods),
    minVersion: safeDisplay(value.min_version),
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
  ): void => {
    if (depth > 7 || output.size >= 4096 || visited.has(node)) return;
    visited.add(node);
    const config = configFromRecord(node);
    if (config !== null) {
      const role =
        roleFromValue(node.device_type) ??
        roleFromValue(node.role) ??
        roleFromPath(context.path);
      const targetKey = safeIdentifier(context.path.at(-1) ?? "");
      const radioKey = radioKeyFromPath(context.path);
      if (role !== null && targetKey !== null && radioKey !== null) {
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

    for (const [rawKey, child] of Object.entries(node).slice(0, 1024)) {
      if (
        rawKey === "__proto__" ||
        rawKey === "prototype" ||
        rawKey === "constructor" ||
        !isRecord(child)
      ) {
        continue;
      }
      const key = safeIdentifier(rawKey);
      if (key === null) continue;
      const vendorKey = depth === 0 ? key : context.vendorKey;
      const vendorName =
        depth === 0 ? (safeDisplay(child.name) ?? key) : context.vendorName;
      walk(
        child,
        {
          path: Object.freeze([...context.path, key]),
          vendorKey,
          vendorName,
        },
        depth + 1,
      );
    }
  };

  walk(
    value,
    {
      path: Object.freeze([]),
      vendorKey: "unknown",
      vendorName: "Unknown",
    },
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
