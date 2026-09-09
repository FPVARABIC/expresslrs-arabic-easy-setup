import {
  createReadOnlyHealthAssessment,
  readOnlyBindingStates,
  readOnlyCompatibilityStates,
  readOnlyFirmwareStates,
  type ReadOnlyBindingState,
  type ReadOnlyCompatibilityState,
  type ReadOnlyFirmwareState,
  type ReadOnlyHealthAssessment,
} from "./read-only-health.js";
import {
  readOnlyDiagnosticOutcomes,
  readOnlyFactCategories,
  readOnlyReconnectStates,
  type ReadOnlyDiagnosticOutcome,
  type ReadOnlyFactCategory,
  type ReadOnlyReconnectState,
} from "./read-only-report.js";
import {
  detectionConfidences,
  type DetectionConfidence,
} from "@elrs-easy/domain";

export interface ReadOnlyHealthSupplementalInput {
  readonly compatibility: ReadOnlyCompatibilityState;
  readonly binding: ReadOnlyBindingState;
  readonly firmware: ReadOnlyFirmwareState;
}

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

function readAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return isAllowedValue(value, allowed) ? value : fallback;
}

function readFactCategories(value: unknown): readonly ReadOnlyFactCategory[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  const lengthValue = readProperty(value, "length");
  if (
    typeof lengthValue !== "number" ||
    !Number.isSafeInteger(lengthValue) ||
    lengthValue < 0
  ) {
    return Object.freeze([]);
  }

  const found = new Set<ReadOnlyFactCategory>();
  const length = Math.min(lengthValue, 64);
  for (let index = 0; index < length; index += 1) {
    const candidate = readProperty(value, index);
    if (isAllowedValue(candidate, readOnlyFactCategories)) {
      found.add(candidate);
    }
  }

  return Object.freeze(
    readOnlyFactCategories.filter((candidate) => found.has(candidate)),
  );
}

function hasIdentityEnvelope(
  categories: readonly ReadOnlyFactCategory[],
): boolean {
  return (
    categories.includes("TARGET") &&
    categories.includes("FIRMWARE_VERSION") &&
    categories.includes("DEVICE_ROLE")
  );
}

interface RebuiltDiagnosticEvidence {
  readonly validEnvelope: boolean;
  readonly outcome: ReadOnlyDiagnosticOutcome;
  readonly confidence: DetectionConfidence;
  readonly verificationPassed: boolean;
  readonly reconnectState: ReadOnlyReconnectState;
  readonly factCategories: readonly ReadOnlyFactCategory[];
}

function rebuildDiagnosticEvidence(report: unknown): RebuiltDiagnosticEvidence {
  const schemaVersion = readProperty(report, "schemaVersion");
  const reportType = readProperty(report, "reportType");
  const validationLevel = readProperty(report, "validationLevel");
  const hardwareValidation = readProperty(report, "hardwareValidation");
  const operation = readProperty(report, "operation");
  const evidenceSummary = readProperty(report, "evidenceSummary");

  const validEnvelope =
    schemaVersion === "1" &&
    reportType === "READ_ONLY_DEVICE_DIAGNOSTIC" &&
    validationLevel === "BUILD_TESTED" &&
    hardwareValidation === "NONE";

  const outcome = readAllowedValue(
    readProperty(operation, "outcome"),
    readOnlyDiagnosticOutcomes,
    "FAILED",
  );
  const confidence = readAllowedValue(
    readProperty(operation, "confidence"),
    detectionConfidences,
    "UNKNOWN",
  );
  const verificationPassed =
    readProperty(operation, "verificationPassed") === true;
  const reconnectState = readAllowedValue(
    readProperty(operation, "reconnectState"),
    readOnlyReconnectStates,
    "NOT_ATTEMPTED",
  );
  const factCategories = readFactCategories(
    readProperty(evidenceSummary, "factCategories"),
  );

  return Object.freeze({
    validEnvelope,
    outcome,
    confidence,
    verificationPassed,
    reconnectState,
    factCategories,
  });
}

function deriveConfiguration(
  evidence: RebuiltDiagnosticEvidence,
): "READ_ONLY_AVAILABLE" | "UNAVAILABLE" | "UNKNOWN" {
  if (!evidence.validEnvelope) {
    return "UNKNOWN";
  }

  if (evidence.outcome === "FAILED") {
    return "UNAVAILABLE";
  }

  if (evidence.outcome === "CANCELLED") {
    return "UNKNOWN";
  }

  return evidence.verificationPassed &&
    hasIdentityEnvelope(evidence.factCategories)
    ? "READ_ONLY_AVAILABLE"
    : "UNKNOWN";
}

function deriveConnection(
  evidence: RebuiltDiagnosticEvidence,
): "STABLE_OBSERVED" | "RECONNECT_REQUIRED" | "UNKNOWN" {
  if (!evidence.validEnvelope) {
    return "UNKNOWN";
  }

  if (evidence.reconnectState === "CONSISTENT") {
    return "STABLE_OBSERVED";
  }

  if (
    evidence.reconnectState === "REQUIRED" ||
    evidence.reconnectState === "CHANGED"
  ) {
    return "RECONNECT_REQUIRED";
  }

  return "UNKNOWN";
}

/**
 * Composes the privacy-safe read-only diagnostic report into the M5 health
 * assessment. Only reviewed categorical evidence crosses the adapter. The
 * report's findings, raw provider input, timestamps and identifiers are not
 * consumed. Supplemental Binding/Firmware/catalog states are independently
 * allowlisted and cannot grant hardware authority.
 */
export function createReadOnlyHealthAssessmentFromDiagnosticReport(
  report: unknown,
  supplemental: ReadOnlyHealthSupplementalInput | unknown,
): ReadOnlyHealthAssessment {
  const evidence = rebuildDiagnosticEvidence(report);
  const compatibility = readAllowedValue(
    readProperty(supplemental, "compatibility"),
    readOnlyCompatibilityStates,
    "UNKNOWN",
  );
  const binding = readAllowedValue(
    readProperty(supplemental, "binding"),
    readOnlyBindingStates,
    "UNKNOWN",
  );
  const firmware = readAllowedValue(
    readProperty(supplemental, "firmware"),
    readOnlyFirmwareStates,
    "UNKNOWN",
  );

  return createReadOnlyHealthAssessment({
    confidence: evidence.validEnvelope ? evidence.confidence : "UNKNOWN",
    compatibility,
    binding,
    firmware,
    configuration: deriveConfiguration(evidence),
    connection: deriveConnection(evidence),
  });
}
