export const platformHosts = [
  "WEB_DESKTOP",
  "WEB_ANDROID",
  "ANDROID_NATIVE",
] as const;

export type PlatformHost = (typeof platformHosts)[number];

export const platformAdapterKinds = [
  "LOCAL_HTTP",
  "WEB_SERIAL",
  "WEB_USB",
  "NATIVE_USB",
] as const;

export type PlatformAdapterKind = (typeof platformAdapterKinds)[number];

export interface PlatformAdapterAvailability {
  readonly adapter: PlatformAdapterKind;
  readonly implemented: boolean;
}

export interface PlatformReadinessInput {
  readonly host: PlatformHost;
  readonly adapters: readonly PlatformAdapterAvailability[];
}

export type NativeBridgeDisposition =
  | "NOT_REQUIRED_BY_SOFTWARE_CAPABILITIES"
  | "CANDIDATE_REQUIRED"
  | "NATIVE_HOST_SELECTED"
  | "BLOCKED_INVALID_INPUT";

export type PlatformReadinessNextGate =
  | "HARDWARE_BROWSER_MATRIX"
  | "NATIVE_BRIDGE_SPIKE"
  | "ANDROID_HARDWARE_MATRIX"
  | "NO_IMPLEMENTED_READ_ADAPTER"
  | "INVALID_INPUT";

export interface PlatformReadinessPlan {
  readonly schemaVersion: 1;
  readonly type: "PLATFORM_READINESS_PLAN";
  readonly status: "VALID" | "INVALID";
  readonly invalidReason: null | "INVALID_HOST" | "INVALID_ADAPTERS";
  readonly host: PlatformHost | null;
  readonly readCandidates: readonly PlatformAdapterKind[];
  readonly preferredReadCandidate: PlatformAdapterKind | null;
  readonly nativeBridgeDisposition: NativeBridgeDisposition;
  readonly nextGate: PlatformReadinessNextGate;
  readonly validationLevel: "SOFTWARE_ONLY";
  readonly hardwareValidation: "NONE";
  readonly writeDisposition: "BLOCKED_PENDING_HARDWARE_VALIDATION";
}

const hostPreference = Object.freeze({
  WEB_DESKTOP: Object.freeze(["LOCAL_HTTP", "WEB_SERIAL", "WEB_USB"] as const),
  WEB_ANDROID: Object.freeze(["LOCAL_HTTP", "WEB_SERIAL", "WEB_USB"] as const),
  ANDROID_NATIVE: Object.freeze(["NATIVE_USB", "LOCAL_HTTP"] as const),
}) satisfies Readonly<Record<PlatformHost, readonly PlatformAdapterKind[]>>;

function readOwnDataProperty(value: unknown, key: PropertyKey): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function implementedAdapters(
  input: unknown,
): ReadonlySet<PlatformAdapterKind> | null {
  if (!Array.isArray(input)) {
    return null;
  }
  const length = readOwnDataProperty(input, "length");
  if (
    !Number.isInteger(length) ||
    (length as number) < 0 ||
    (length as number) > 32
  ) {
    return null;
  }

  const implemented = new Set<PlatformAdapterKind>();
  for (let index = 0; index < (length as number); index += 1) {
    const item = readOwnDataProperty(input, index);
    const adapter = readOwnDataProperty(item, "adapter");
    const available = readOwnDataProperty(item, "implemented");
    if (
      typeof adapter !== "string" ||
      !platformAdapterKinds.includes(adapter as PlatformAdapterKind) ||
      typeof available !== "boolean"
    ) {
      return null;
    }
    if (available) {
      implemented.add(adapter as PlatformAdapterKind);
    }
  }
  return implemented;
}

function invalidPlan(
  reason: Exclude<PlatformReadinessPlan["invalidReason"], null>,
): PlatformReadinessPlan {
  return Object.freeze({
    schemaVersion: 1,
    type: "PLATFORM_READINESS_PLAN",
    status: "INVALID",
    invalidReason: reason,
    host: null,
    readCandidates: Object.freeze([]),
    preferredReadCandidate: null,
    nativeBridgeDisposition: "BLOCKED_INVALID_INPUT",
    nextGate: "INVALID_INPUT",
    validationLevel: "SOFTWARE_ONLY",
    hardwareValidation: "NONE",
    writeDisposition: "BLOCKED_PENDING_HARDWARE_VALIDATION",
  });
}

/**
 * Produces a software-only host plan. It can rank already-implemented read
 * adapters, but it deliberately cannot grant write authority or Hardware
 * validation. Physical Browser/USB behavior stays a separate gate.
 */
export function createPlatformReadinessPlan(
  input: PlatformReadinessInput | unknown,
): PlatformReadinessPlan {
  const host = readOwnDataProperty(input, "host");
  if (
    typeof host !== "string" ||
    !platformHosts.includes(host as PlatformHost)
  ) {
    return invalidPlan("INVALID_HOST");
  }
  const implemented = implementedAdapters(
    readOwnDataProperty(input, "adapters"),
  );
  if (implemented === null) {
    return invalidPlan("INVALID_ADAPTERS");
  }
  const readCandidates = Object.freeze(
    hostPreference[host as PlatformHost].filter((adapter) =>
      implemented.has(adapter),
    ),
  );
  const preferredReadCandidate = readCandidates[0] ?? null;

  let nativeBridgeDisposition: NativeBridgeDisposition;
  let nextGate: PlatformReadinessNextGate;

  if (host === "ANDROID_NATIVE") {
    nativeBridgeDisposition = "NATIVE_HOST_SELECTED";
    nextGate =
      preferredReadCandidate === null
        ? "NO_IMPLEMENTED_READ_ADAPTER"
        : "ANDROID_HARDWARE_MATRIX";
  } else if (host === "WEB_ANDROID" && preferredReadCandidate === null) {
    nativeBridgeDisposition = "CANDIDATE_REQUIRED";
    nextGate = "NATIVE_BRIDGE_SPIKE";
  } else {
    nativeBridgeDisposition = "NOT_REQUIRED_BY_SOFTWARE_CAPABILITIES";
    nextGate =
      preferredReadCandidate === null
        ? "NO_IMPLEMENTED_READ_ADAPTER"
        : "HARDWARE_BROWSER_MATRIX";
  }

  return Object.freeze({
    schemaVersion: 1,
    type: "PLATFORM_READINESS_PLAN",
    status: "VALID",
    invalidReason: null,
    host: host as PlatformHost,
    readCandidates,
    preferredReadCandidate,
    nativeBridgeDisposition,
    nextGate,
    validationLevel: "SOFTWARE_ONLY",
    hardwareValidation: "NONE",
    writeDisposition: "BLOCKED_PENDING_HARDWARE_VALIDATION",
  });
}
