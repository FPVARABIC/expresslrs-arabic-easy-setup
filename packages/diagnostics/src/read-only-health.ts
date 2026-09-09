import {
  detectionConfidences,
  type DetectionConfidence,
} from "@elrs-easy/domain";

export const readOnlyCompatibilityStates = Object.freeze([
  "SUPPORTED_BY_CATALOG",
  "UNSUPPORTED",
  "UNKNOWN",
] as const);
export type ReadOnlyCompatibilityState =
  (typeof readOnlyCompatibilityStates)[number];

export const readOnlyBindingStates = Object.freeze([
  "LINK_ESTABLISHED_VERIFIED",
  "NOT_ESTABLISHED",
  "UNKNOWN",
] as const);
export type ReadOnlyBindingState = (typeof readOnlyBindingStates)[number];

export const readOnlyFirmwareStates = Object.freeze([
  "CURRENT_APPROVED",
  "APPROVED_UPDATE_AVAILABLE",
  "UNKNOWN",
] as const);
export type ReadOnlyFirmwareState = (typeof readOnlyFirmwareStates)[number];

export const readOnlyConfigurationStates = Object.freeze([
  "READ_ONLY_AVAILABLE",
  "UNAVAILABLE",
  "UNKNOWN",
] as const);
export type ReadOnlyConfigurationState =
  (typeof readOnlyConfigurationStates)[number];

export const readOnlyConnectionStates = Object.freeze([
  "STABLE_OBSERVED",
  "RECONNECT_REQUIRED",
  "UNKNOWN",
] as const);
export type ReadOnlyConnectionState = (typeof readOnlyConnectionStates)[number];

export const readOnlyHealthCheckIds = Object.freeze([
  "DEVICE_IDENTITY",
  "COMPATIBILITY",
  "BINDING_STATE",
  "FIRMWARE_STATUS",
  "CONFIGURATION_READ",
  "CONNECTION_STABILITY",
] as const);
export type ReadOnlyHealthCheckId = (typeof readOnlyHealthCheckIds)[number];

export type ReadOnlyHealthCheckStatus =
  "PASS" | "ATTENTION" | "BLOCKED" | "UNKNOWN";

export const readOnlyHealthFindingIds = Object.freeze([
  "IDENTITY_CONFIRMED",
  "IDENTITY_NOT_CONFIRMED",
  "COMPATIBILITY_SUPPORTED",
  "COMPATIBILITY_UNSUPPORTED",
  "COMPATIBILITY_UNKNOWN",
  "BINDING_VERIFIED",
  "BINDING_NOT_ESTABLISHED",
  "BINDING_UNKNOWN",
  "FIRMWARE_CURRENT",
  "FIRMWARE_UPDATE_AVAILABLE",
  "FIRMWARE_UNKNOWN",
  "CONFIGURATION_READABLE",
  "CONFIGURATION_UNAVAILABLE",
  "CONFIGURATION_UNKNOWN",
  "CONNECTION_STABLE",
  "RECONNECT_REQUIRED",
  "CONNECTION_UNKNOWN",
  "SENSITIVE_ACTIONS_BLOCKED",
  "HARDWARE_VALIDATION_PENDING",
] as const);
export type ReadOnlyHealthFindingId = (typeof readOnlyHealthFindingIds)[number];

export type ReadOnlyHealthSeverity = "INFO" | "WARNING" | "BLOCKING";
export type ReadOnlyHealthOverall =
  "READ_ONLY_HEALTHY" | "NEEDS_REVIEW" | "BLOCKED";

export interface ReadOnlyHealthInput {
  readonly confidence: DetectionConfidence;
  readonly compatibility: ReadOnlyCompatibilityState;
  readonly binding: ReadOnlyBindingState;
  readonly firmware: ReadOnlyFirmwareState;
  readonly configuration: ReadOnlyConfigurationState;
  readonly connection: ReadOnlyConnectionState;
}

export interface ReadOnlyHealthCheck {
  readonly id: ReadOnlyHealthCheckId;
  readonly status: ReadOnlyHealthCheckStatus;
}

export interface ReadOnlyHealthFinding {
  readonly id: ReadOnlyHealthFindingId;
  readonly severity: ReadOnlyHealthSeverity;
  readonly recommendationCode: string;
  readonly automaticFixAvailable: false;
}

export interface ReadOnlyHealthAssessment {
  readonly schemaVersion: "1";
  readonly reportType: "READ_ONLY_HEALTH_ASSESSMENT";
  readonly validationLevel: "BUILD_TESTED";
  readonly hardwareValidation: "NONE";
  readonly overall: ReadOnlyHealthOverall;
  readonly writeDisposition: "BLOCKED_NO_HARDWARE_AUTHORITY";
  readonly checks: readonly ReadOnlyHealthCheck[];
  readonly findings: readonly ReadOnlyHealthFinding[];
  readonly privacy: {
    readonly rawValuesIncluded: false;
    readonly rawFieldNamesIncluded: false;
    readonly deviceIdentifiersIncluded: false;
    readonly credentialsIncluded: false;
    readonly persistedByApplication: false;
  };
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

function readAllowedValue<T extends string>(input: {
  readonly value: unknown;
  readonly allowed: readonly T[];
  readonly fallback: T;
}): T {
  return isAllowedValue(input.value, input.allowed)
    ? input.value
    : input.fallback;
}

function check(
  id: ReadOnlyHealthCheckId,
  status: ReadOnlyHealthCheckStatus,
): ReadOnlyHealthCheck {
  return Object.freeze({ id, status });
}

function finding(
  id: ReadOnlyHealthFindingId,
  severity: ReadOnlyHealthSeverity,
  recommendationCode: string,
): ReadOnlyHealthFinding {
  return Object.freeze({
    id,
    severity,
    recommendationCode,
    automaticFixAvailable: false,
  });
}

function evaluateIdentity(confidence: DetectionConfidence): {
  readonly check: ReadOnlyHealthCheck;
  readonly finding: ReadOnlyHealthFinding;
} {
  return confidence === "CONFIRMED"
    ? Object.freeze({
        check: check("DEVICE_IDENTITY", "PASS"),
        finding: finding("IDENTITY_CONFIRMED", "INFO", "KEEP_READ_ONLY"),
      })
    : Object.freeze({
        check: check("DEVICE_IDENTITY", "BLOCKED"),
        finding: finding(
          "IDENTITY_NOT_CONFIRMED",
          "BLOCKING",
          "KEEP_SENSITIVE_ACTIONS_BLOCKED",
        ),
      });
}

function evaluateCompatibility(state: ReadOnlyCompatibilityState): {
  readonly check: ReadOnlyHealthCheck;
  readonly finding: ReadOnlyHealthFinding;
} {
  if (state === "SUPPORTED_BY_CATALOG") {
    return Object.freeze({
      check: check("COMPATIBILITY", "PASS"),
      finding: finding("COMPATIBILITY_SUPPORTED", "INFO", "KEEP_READ_ONLY"),
    });
  }
  if (state === "UNSUPPORTED") {
    return Object.freeze({
      check: check("COMPATIBILITY", "BLOCKED"),
      finding: finding(
        "COMPATIBILITY_UNSUPPORTED",
        "BLOCKING",
        "DO_NOT_EXECUTE_SENSITIVE_ACTIONS",
      ),
    });
  }
  return Object.freeze({
    check: check("COMPATIBILITY", "UNKNOWN"),
    finding: finding(
      "COMPATIBILITY_UNKNOWN",
      "WARNING",
      "REVIEW_COMPATIBILITY_EVIDENCE",
    ),
  });
}

function evaluateBinding(state: ReadOnlyBindingState): {
  readonly check: ReadOnlyHealthCheck;
  readonly finding: ReadOnlyHealthFinding;
} {
  if (state === "LINK_ESTABLISHED_VERIFIED") {
    return Object.freeze({
      check: check("BINDING_STATE", "PASS"),
      finding: finding("BINDING_VERIFIED", "INFO", "KEEP_READ_ONLY"),
    });
  }
  if (state === "NOT_ESTABLISHED") {
    return Object.freeze({
      check: check("BINDING_STATE", "ATTENTION"),
      finding: finding(
        "BINDING_NOT_ESTABLISHED",
        "WARNING",
        "REVIEW_BINDING_WORKFLOW",
      ),
    });
  }
  return Object.freeze({
    check: check("BINDING_STATE", "UNKNOWN"),
    finding: finding("BINDING_UNKNOWN", "WARNING", "COLLECT_BINDING_EVIDENCE"),
  });
}

function evaluateFirmware(state: ReadOnlyFirmwareState): {
  readonly check: ReadOnlyHealthCheck;
  readonly finding: ReadOnlyHealthFinding;
} {
  if (state === "CURRENT_APPROVED") {
    return Object.freeze({
      check: check("FIRMWARE_STATUS", "PASS"),
      finding: finding("FIRMWARE_CURRENT", "INFO", "KEEP_READ_ONLY"),
    });
  }
  if (state === "APPROVED_UPDATE_AVAILABLE") {
    return Object.freeze({
      check: check("FIRMWARE_STATUS", "ATTENTION"),
      finding: finding(
        "FIRMWARE_UPDATE_AVAILABLE",
        "WARNING",
        "REVIEW_APPROVED_UPDATE",
      ),
    });
  }
  return Object.freeze({
    check: check("FIRMWARE_STATUS", "UNKNOWN"),
    finding: finding(
      "FIRMWARE_UNKNOWN",
      "WARNING",
      "COLLECT_FIRMWARE_EVIDENCE",
    ),
  });
}

function evaluateConfiguration(state: ReadOnlyConfigurationState): {
  readonly check: ReadOnlyHealthCheck;
  readonly finding: ReadOnlyHealthFinding;
} {
  if (state === "READ_ONLY_AVAILABLE") {
    return Object.freeze({
      check: check("CONFIGURATION_READ", "PASS"),
      finding: finding(
        "CONFIGURATION_READABLE",
        "INFO",
        "KEEP_CONFIGURATION_READ_ONLY",
      ),
    });
  }
  if (state === "UNAVAILABLE") {
    return Object.freeze({
      check: check("CONFIGURATION_READ", "ATTENTION"),
      finding: finding(
        "CONFIGURATION_UNAVAILABLE",
        "WARNING",
        "REVIEW_DEVICE_READ_CAPABILITY",
      ),
    });
  }
  return Object.freeze({
    check: check("CONFIGURATION_READ", "UNKNOWN"),
    finding: finding(
      "CONFIGURATION_UNKNOWN",
      "WARNING",
      "COLLECT_CONFIGURATION_EVIDENCE",
    ),
  });
}

function evaluateConnection(state: ReadOnlyConnectionState): {
  readonly check: ReadOnlyHealthCheck;
  readonly finding: ReadOnlyHealthFinding;
} {
  if (state === "STABLE_OBSERVED") {
    return Object.freeze({
      check: check("CONNECTION_STABILITY", "PASS"),
      finding: finding("CONNECTION_STABLE", "INFO", "KEEP_READ_ONLY"),
    });
  }
  if (state === "RECONNECT_REQUIRED") {
    return Object.freeze({
      check: check("CONNECTION_STABILITY", "ATTENTION"),
      finding: finding(
        "RECONNECT_REQUIRED",
        "WARNING",
        "RECONNECT_AND_RECHECK",
      ),
    });
  }
  return Object.freeze({
    check: check("CONNECTION_STABILITY", "UNKNOWN"),
    finding: finding(
      "CONNECTION_UNKNOWN",
      "WARNING",
      "COLLECT_CONNECTION_EVIDENCE",
    ),
  });
}

/**
 * Creates a deterministic, privacy-safe health assessment from evidence
 * categories only. The assessment never authorizes Binding, configuration,
 * reboot, Firmware update or RF writes. Unknown or accessor-backed runtime
 * input fails closed to reviewed UNKNOWN values.
 */
export function createReadOnlyHealthAssessment(
  input: ReadOnlyHealthInput | unknown,
): ReadOnlyHealthAssessment {
  const confidence = readAllowedValue({
    value: readProperty(input, "confidence"),
    allowed: detectionConfidences,
    fallback: "UNKNOWN",
  });
  const compatibility = readAllowedValue({
    value: readProperty(input, "compatibility"),
    allowed: readOnlyCompatibilityStates,
    fallback: "UNKNOWN",
  });
  const binding = readAllowedValue({
    value: readProperty(input, "binding"),
    allowed: readOnlyBindingStates,
    fallback: "UNKNOWN",
  });
  const firmware = readAllowedValue({
    value: readProperty(input, "firmware"),
    allowed: readOnlyFirmwareStates,
    fallback: "UNKNOWN",
  });
  const configuration = readAllowedValue({
    value: readProperty(input, "configuration"),
    allowed: readOnlyConfigurationStates,
    fallback: "UNKNOWN",
  });
  const connection = readAllowedValue({
    value: readProperty(input, "connection"),
    allowed: readOnlyConnectionStates,
    fallback: "UNKNOWN",
  });

  const identityResult = evaluateIdentity(confidence);
  const compatibilityResult = evaluateCompatibility(compatibility);
  const bindingResult = evaluateBinding(binding);
  const firmwareResult = evaluateFirmware(firmware);
  const configurationResult = evaluateConfiguration(configuration);
  const connectionResult = evaluateConnection(connection);

  const checks = Object.freeze([
    identityResult.check,
    compatibilityResult.check,
    bindingResult.check,
    firmwareResult.check,
    configurationResult.check,
    connectionResult.check,
  ] satisfies readonly ReadOnlyHealthCheck[]);

  const hasBlocked = checks.some((item) => item.status === "BLOCKED");
  const allPass = checks.every((item) => item.status === "PASS");
  const overall: ReadOnlyHealthOverall = hasBlocked
    ? "BLOCKED"
    : allPass
      ? "READ_ONLY_HEALTHY"
      : "NEEDS_REVIEW";

  const findings = Object.freeze([
    identityResult.finding,
    compatibilityResult.finding,
    bindingResult.finding,
    firmwareResult.finding,
    configurationResult.finding,
    connectionResult.finding,
    finding(
      "SENSITIVE_ACTIONS_BLOCKED",
      "INFO",
      "KEEP_ALL_REAL_WRITES_DISABLED",
    ),
    finding(
      "HARDWARE_VALIDATION_PENDING",
      "INFO",
      "RUN_REFERENCE_HARDWARE_MATRIX_LATER",
    ),
  ] satisfies readonly ReadOnlyHealthFinding[]);

  return Object.freeze({
    schemaVersion: "1",
    reportType: "READ_ONLY_HEALTH_ASSESSMENT",
    validationLevel: "BUILD_TESTED",
    hardwareValidation: "NONE",
    overall,
    writeDisposition: "BLOCKED_NO_HARDWARE_AUTHORITY",
    checks,
    findings,
    privacy: Object.freeze({
      rawValuesIncluded: false,
      rawFieldNamesIncluded: false,
      deviceIdentifiersIncluded: false,
      credentialsIncluded: false,
      persistedByApplication: false,
    }),
  });
}
