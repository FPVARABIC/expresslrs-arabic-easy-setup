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
  | "NATIVE_HOST_SELECTED";

export type PlatformReadinessNextGate =
  | "HARDWARE_BROWSER_MATRIX"
  | "NATIVE_BRIDGE_SPIKE"
  | "ANDROID_HARDWARE_MATRIX"
  | "NO_IMPLEMENTED_READ_ADAPTER";

export interface PlatformReadinessPlan {
  readonly schemaVersion: 1;
  readonly type: "PLATFORM_READINESS_PLAN";
  readonly host: PlatformHost;
  readonly readCandidates: readonly PlatformAdapterKind[];
  readonly preferredReadCandidate: PlatformAdapterKind | null;
  readonly nativeBridgeDisposition: NativeBridgeDisposition;
  readonly nextGate: PlatformReadinessNextGate;
  readonly validationLevel: "SOFTWARE_ONLY";
  readonly hardwareValidation: "NONE";
  readonly writeDisposition: "BLOCKED_PENDING_HARDWARE_VALIDATION";
}

const hostPreference: Readonly<
  Record<PlatformHost, readonly PlatformAdapterKind[]>
> = Object.freeze({
  WEB_DESKTOP: Object.freeze(["LOCAL_HTTP", "WEB_SERIAL", "WEB_USB"]),
  WEB_ANDROID: Object.freeze(["LOCAL_HTTP", "WEB_SERIAL", "WEB_USB"]),
  ANDROID_NATIVE: Object.freeze(["NATIVE_USB", "LOCAL_HTTP"]),
});

function implementedAdapters(
  input: readonly PlatformAdapterAvailability[],
): ReadonlySet<PlatformAdapterKind> {
  const implemented = new Set<PlatformAdapterKind>();
  for (const item of input) {
    if (
      typeof item === "object" &&
      item !== null &&
      platformAdapterKinds.includes(item.adapter) &&
      item.implemented === true
    ) {
      implemented.add(item.adapter);
    }
  }
  return implemented;
}

/**
 * Produces a software-only host plan. It can rank already-implemented read
 * adapters, but it deliberately cannot grant write authority or Hardware
 * validation. Physical Browser/USB behavior stays a separate gate.
 */
export function createPlatformReadinessPlan(
  input: PlatformReadinessInput,
): PlatformReadinessPlan {
  const implemented = implementedAdapters(input.adapters);
  const readCandidates = Object.freeze(
    hostPreference[input.host].filter((adapter) => implemented.has(adapter)),
  );
  const preferredReadCandidate = readCandidates[0] ?? null;

  let nativeBridgeDisposition: NativeBridgeDisposition;
  let nextGate: PlatformReadinessNextGate;

  if (input.host === "ANDROID_NATIVE") {
    nativeBridgeDisposition = "NATIVE_HOST_SELECTED";
    nextGate =
      preferredReadCandidate === null
        ? "NO_IMPLEMENTED_READ_ADAPTER"
        : "ANDROID_HARDWARE_MATRIX";
  } else if (input.host === "WEB_ANDROID" && preferredReadCandidate === null) {
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
    host: input.host,
    readCandidates,
    preferredReadCandidate,
    nativeBridgeDisposition,
    nextGate,
    validationLevel: "SOFTWARE_ONLY",
    hardwareValidation: "NONE",
    writeDisposition: "BLOCKED_PENDING_HARDWARE_VALIDATION",
  });
}
