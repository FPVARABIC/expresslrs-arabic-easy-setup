import type {
  ReadOnlyHealthAssessment,
  ReadOnlyHealthCheckId,
  ReadOnlyHealthCheckStatus,
  ReadOnlyHealthOverall,
} from "@elrs-easy/diagnostics";
import type { MessageKey } from "@elrs-easy/i18n";

export const readOnlyHealthPresentationCheckIds = Object.freeze([
  "DEVICE_IDENTITY",
  "COMPATIBILITY",
  "BINDING_STATE",
  "FIRMWARE_STATUS",
  "CONFIGURATION_READ",
  "CONNECTION_STABILITY",
] as const satisfies readonly ReadOnlyHealthCheckId[]);

export type ReadOnlyHealthPresentationTone = "SAFE" | "ATTENTION" | "BLOCKED";

export interface ReadOnlyHealthPresentationRow {
  readonly id: ReadOnlyHealthCheckId;
  readonly labelKey: MessageKey;
  readonly status: ReadOnlyHealthCheckStatus;
  readonly statusKey: MessageKey;
  readonly tone: ReadOnlyHealthPresentationTone;
}

export interface ReadOnlyHealthPresentation {
  readonly schemaVersion: "1";
  readonly presentationType: "ADVANCED_READ_ONLY_HEALTH";
  readonly overall: ReadOnlyHealthOverall;
  readonly overallKey: MessageKey;
  readonly summaryKey: MessageKey;
  readonly tone: ReadOnlyHealthPresentationTone;
  readonly writeBoundaryKey: MessageKey;
  readonly rows: readonly ReadOnlyHealthPresentationRow[];
}

const checkLabelKeys: Readonly<Record<ReadOnlyHealthCheckId, MessageKey>> =
  Object.freeze({
    DEVICE_IDENTITY: "confidence.label",
    COMPATIBILITY: "device.target",
    BINDING_STATE: "task.bind.title",
    FIRMWARE_STATUS: "device.firmware",
    CONFIGURATION_READ: "task.setup.title",
    CONNECTION_STABILITY: "device.connection",
  });

const checkStatuses = Object.freeze([
  "PASS",
  "ATTENTION",
  "BLOCKED",
  "UNKNOWN",
] as const satisfies readonly ReadOnlyHealthCheckStatus[]);

const overallStates = Object.freeze([
  "READ_ONLY_HEALTHY",
  "NEEDS_REVIEW",
  "BLOCKED",
] as const satisfies readonly ReadOnlyHealthOverall[]);

function readProperty(value: unknown, key: PropertyKey): unknown {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
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

function isAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function statusKey(status: ReadOnlyHealthCheckStatus): MessageKey {
  if (status === "PASS") {
    return "discovery.complete";
  }
  if (status === "ATTENTION") {
    return "discovery.active";
  }
  if (status === "BLOCKED") {
    return "discovery.blocked";
  }
  return "confidence.unknown";
}

function statusTone(
  status: ReadOnlyHealthCheckStatus,
): ReadOnlyHealthPresentationTone {
  if (status === "PASS") {
    return "SAFE";
  }
  if (status === "BLOCKED") {
    return "BLOCKED";
  }
  return "ATTENTION";
}

function overallPresentation(overall: ReadOnlyHealthOverall): {
  readonly overallKey: MessageKey;
  readonly summaryKey: MessageKey;
  readonly tone: ReadOnlyHealthPresentationTone;
} {
  if (overall === "READ_ONLY_HEALTHY") {
    return Object.freeze({
      overallKey: "status.systemReady",
      summaryKey: "safety.readOnlyDescription",
      tone: "SAFE",
    });
  }
  if (overall === "NEEDS_REVIEW") {
    return Object.freeze({
      overallKey: "real.unknownTitle",
      summaryKey: "real.snapshotNotice",
      tone: "ATTENTION",
    });
  }
  return Object.freeze({
    overallKey: "safety.blockedTitle",
    summaryKey: "safety.blockedDescription",
    tone: "BLOCKED",
  });
}

function rebuildChecks(
  value: unknown,
): ReadonlyMap<ReadOnlyHealthCheckId, ReadOnlyHealthCheckStatus> {
  const rebuilt = new Map<ReadOnlyHealthCheckId, ReadOnlyHealthCheckStatus>();

  if (!Array.isArray(value)) {
    return rebuilt;
  }

  const lengthValue = readProperty(value, "length");
  if (
    typeof lengthValue !== "number" ||
    !Number.isSafeInteger(lengthValue) ||
    lengthValue < 0 ||
    lengthValue > 32
  ) {
    return rebuilt;
  }

  for (let index = 0; index < lengthValue; index += 1) {
    const candidate = readProperty(value, index);
    const id = readProperty(candidate, "id");
    const status = readProperty(candidate, "status");

    if (
      !isAllowedValue(id, readOnlyHealthPresentationCheckIds) ||
      !isAllowedValue(status, checkStatuses) ||
      rebuilt.has(id)
    ) {
      continue;
    }

    rebuilt.set(id, status);
  }

  return rebuilt;
}

/**
 * Rebuilds the already-safe Core assessment into a fixed Advanced-mode view
 * model. The presenter deliberately ignores findings and any extra runtime
 * properties, so recommendation codes, raw values and device metadata never
 * become UI data by accident.
 */
export function createReadOnlyHealthPresentation(
  assessment: ReadOnlyHealthAssessment | unknown,
): ReadOnlyHealthPresentation {
  const validEnvelope =
    readProperty(assessment, "schemaVersion") === "1" &&
    readProperty(assessment, "reportType") === "READ_ONLY_HEALTH_ASSESSMENT" &&
    readProperty(assessment, "validationLevel") === "BUILD_TESTED" &&
    readProperty(assessment, "hardwareValidation") === "NONE" &&
    readProperty(assessment, "writeDisposition") ===
      "BLOCKED_NO_HARDWARE_AUTHORITY";

  const overallCandidate = readProperty(assessment, "overall");
  const overall =
    validEnvelope && isAllowedValue(overallCandidate, overallStates)
      ? overallCandidate
      : "BLOCKED";
  const rebuilt = validEnvelope
    ? rebuildChecks(readProperty(assessment, "checks"))
    : new Map<ReadOnlyHealthCheckId, ReadOnlyHealthCheckStatus>();

  const rows = Object.freeze(
    readOnlyHealthPresentationCheckIds.map((id) => {
      const status = rebuilt.get(id) ?? "UNKNOWN";
      return Object.freeze({
        id,
        labelKey: checkLabelKeys[id],
        status,
        statusKey: statusKey(status),
        tone: statusTone(status),
      });
    }),
  );
  const overallView = overallPresentation(overall);

  return Object.freeze({
    schemaVersion: "1",
    presentationType: "ADVANCED_READ_ONLY_HEALTH",
    overall,
    overallKey: overallView.overallKey,
    summaryKey: overallView.summaryKey,
    tone: overallView.tone,
    writeBoundaryKey: "task.previewOnly",
    rows,
  });
}
