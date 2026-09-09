import {
  detectionConfidences,
  operationErrorCodes,
  type DetectionConfidence,
  type OperationErrorCode,
} from "@elrs-easy/domain";

export const readOnlyDiagnosticOutcomes = Object.freeze([
  "SUCCESS",
  "FAILED",
  "CANCELLED",
] as const);
export type ReadOnlyDiagnosticOutcome =
  (typeof readOnlyDiagnosticOutcomes)[number];

export const readOnlyFactCategories = Object.freeze([
  "PRODUCT",
  "TARGET",
  "FIRMWARE_VERSION",
  "FIRMWARE_COMMIT",
  "DEVICE_ROLE",
  "RADIO_FAMILY",
  "FREQUENCY_BAND",
  "REGULATORY_DOMAIN_LOW",
  "REGULATORY_DOMAIN_HIGH",
  "CUSTOM_HARDWARE_PRESENT",
] as const);
export type ReadOnlyFactCategory = (typeof readOnlyFactCategories)[number];

export const readOnlyStageCategories = Object.freeze([
  "PREPARING",
  "DISCOVERING",
  "IDENTIFYING",
  "VERIFYING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
] as const);
export type ReadOnlyStageCategory = (typeof readOnlyStageCategories)[number];

export const readOnlyReconnectStates = Object.freeze([
  "NOT_ATTEMPTED",
  "REQUIRED",
  "CONSISTENT",
  "CHANGED",
] as const);
export type ReadOnlyReconnectState = (typeof readOnlyReconnectStates)[number];

export const diagnosticFindingIds = Object.freeze([
  "READ_SUCCEEDED",
  "READ_FAILED",
  "READ_CANCELLED",
  "IDENTITY_NOT_CONFIRMED",
  "RETRY_AVAILABLE",
  "RESPONSE_REJECTED",
  "RECONNECT_REQUIRED",
  "RECONNECT_CONSISTENT",
  "RECONNECT_CHANGED",
  "HARDWARE_VALIDATION_PENDING",
] as const);
export type DiagnosticFindingId = (typeof diagnosticFindingIds)[number];

export type DiagnosticFindingSeverity = "INFO" | "WARNING";

export interface ReadOnlyDiagnosticFinding {
  readonly id: DiagnosticFindingId;
  readonly severity: DiagnosticFindingSeverity;
  readonly confidence: "CONFIRMED";
  readonly recommendationCode: string;
  readonly automaticFixAvailable: false;
}

export interface ReadOnlyDiagnosticInput {
  readonly outcome: ReadOnlyDiagnosticOutcome;
  readonly confidence: DetectionConfidence;
  readonly errorCode: OperationErrorCode | null;
  readonly retryable: boolean;
  readonly verificationPassed: boolean;
  readonly attempts: number;
  readonly baselineAvailable: boolean;
  readonly reconnectState: ReadOnlyReconnectState;
  /** Fixed product categories only. Raw device field names are not accepted. */
  readonly factCategories: readonly ReadOnlyFactCategory[];
  /** Fixed workflow stages only. Audit details and timestamps are not accepted. */
  readonly stageCategories: readonly ReadOnlyStageCategory[];
}

export interface ReadOnlyDiagnosticReport {
  readonly schemaVersion: "1";
  readonly reportType: "READ_ONLY_DEVICE_DIAGNOSTIC";
  readonly validationLevel: "BUILD_TESTED";
  readonly hardwareValidation: "NONE";
  readonly operation: {
    readonly outcome: ReadOnlyDiagnosticOutcome;
    readonly confidence: DetectionConfidence;
    readonly errorCode: OperationErrorCode | null;
    readonly retryable: boolean;
    readonly verificationPassed: boolean;
    readonly attempts: number;
    readonly reconnectState: ReadOnlyReconnectState;
  };
  readonly evidenceSummary: {
    readonly factCategoryCount: number;
    readonly factCategories: readonly ReadOnlyFactCategory[];
    readonly stageCategoryCount: number;
    readonly stageCategories: readonly ReadOnlyStageCategory[];
  };
  readonly findings: readonly ReadOnlyDiagnosticFinding[];
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

/**
 * Rebuilds an untrusted list by checking only reviewed constants. Unknown or
 * hostile entries are never copied, named, counted or returned.
 */
function readAllowedList<T extends string>(
  value: unknown,
  allowed: readonly T[],
): readonly T[] {
  let length = 0;
  try {
    if (!Array.isArray(value)) {
      return Object.freeze([]);
    }
    const candidateLength = readProperty(value, "length");
    if (
      typeof candidateLength !== "number" ||
      !Number.isSafeInteger(candidateLength) ||
      candidateLength < 0
    ) {
      return Object.freeze([]);
    }
    length = Math.min(candidateLength, 64);
  } catch {
    return Object.freeze([]);
  }

  const found = new Set<T>();
  for (let index = 0; index < length; index += 1) {
    const candidate = readProperty(value, index);
    if (isAllowedValue(candidate, allowed)) {
      found.add(candidate);
    }
  }
  return Object.freeze(allowed.filter((candidate) => found.has(candidate)));
}

function readAttempts(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 999
    ? value
    : 1;
}

function finding(
  id: DiagnosticFindingId,
  severity: DiagnosticFindingSeverity,
  recommendationCode: string,
): ReadOnlyDiagnosticFinding {
  return Object.freeze({
    id,
    severity,
    confidence: "CONFIRMED",
    recommendationCode,
    automaticFixAvailable: false,
  });
}

function buildFindings(input: {
  readonly outcome: ReadOnlyDiagnosticOutcome;
  readonly confidence: DetectionConfidence;
  readonly errorCode: OperationErrorCode | null;
  readonly retryable: boolean;
  readonly reconnectState: ReadOnlyReconnectState;
}): readonly ReadOnlyDiagnosticFinding[] {
  const findings: ReadOnlyDiagnosticFinding[] = [];

  if (input.outcome === "SUCCESS") {
    findings.push(finding("READ_SUCCEEDED", "INFO", "KEEP_READ_ONLY"));
    if (input.confidence !== "CONFIRMED") {
      findings.push(
        finding(
          "IDENTITY_NOT_CONFIRMED",
          "WARNING",
          "KEEP_SENSITIVE_ACTIONS_BLOCKED",
        ),
      );
    }
  } else if (input.outcome === "FAILED") {
    findings.push(finding("READ_FAILED", "WARNING", "REVIEW_CONNECTION"));
    if (input.retryable) {
      findings.push(finding("RETRY_AVAILABLE", "INFO", "RETRY_MANUALLY"));
    }
    if (input.errorCode === "PROVIDER_UNSUPPORTED") {
      findings.push(
        finding("RESPONSE_REJECTED", "WARNING", "SELECT_ANOTHER_ORIGIN"),
      );
    }
  } else {
    findings.push(finding("READ_CANCELLED", "INFO", "START_WHEN_READY"));
  }

  if (input.reconnectState === "REQUIRED") {
    findings.push(finding("RECONNECT_REQUIRED", "WARNING", "RETRY_MANUALLY"));
  } else if (input.reconnectState === "CONSISTENT") {
    findings.push(
      finding("RECONNECT_CONSISTENT", "INFO", "KEEP_IDENTITY_UNCONFIRMED"),
    );
  } else if (input.reconnectState === "CHANGED") {
    findings.push(
      finding("RECONNECT_CHANGED", "WARNING", "REVIEW_REPORTED_FACTS"),
    );
  }

  findings.push(
    finding(
      "HARDWARE_VALIDATION_PENDING",
      "INFO",
      "RUN_REFERENCE_HARDWARE_MATRIX",
    ),
  );
  return Object.freeze(findings);
}

/**
 * Creates a deterministic support report from a hostile runtime boundary.
 * Values, raw field names, URLs, timestamps and adapter diagnostics are not
 * part of the input or output schema, so malicious names cannot leak through
 * an "excluded fields" list.
 */
export function createReadOnlyDiagnosticReport(
  input: ReadOnlyDiagnosticInput | unknown,
): ReadOnlyDiagnosticReport {
  const outcome = readAllowedValue({
    value: readProperty(input, "outcome"),
    allowed: readOnlyDiagnosticOutcomes,
    fallback: "FAILED",
  });
  const confidence = readAllowedValue({
    value: readProperty(input, "confidence"),
    allowed: detectionConfidences,
    fallback: "UNKNOWN",
  });
  const attempts = readAttempts(readProperty(input, "attempts"));
  const verificationCandidate =
    readProperty(input, "verificationPassed") === true;
  const baselineAvailable = readProperty(input, "baselineAvailable") === true;
  const factCategories = readAllowedList(
    readProperty(input, "factCategories"),
    readOnlyFactCategories,
  );
  const stageCategories = readAllowedList(
    readProperty(input, "stageCategories"),
    readOnlyStageCategories,
  );
  const requiredSuccessFacts = [
    "TARGET",
    "FIRMWARE_VERSION",
    "DEVICE_ROLE",
  ] as const satisfies readonly ReadOnlyFactCategory[];
  const terminalStages = stageCategories.filter(
    (stage) =>
      stage === "SUCCESS" || stage === "FAILED" || stage === "CANCELLED",
  );
  const terminalMatchesOutcome =
    terminalStages.length === 1 && terminalStages[0] === outcome;
  const successIsConsistent =
    outcome === "SUCCESS" &&
    terminalMatchesOutcome &&
    verificationCandidate &&
    requiredSuccessFacts.every((category) => factCategories.includes(category));
  const inputIsConsistent =
    terminalMatchesOutcome && (outcome !== "SUCCESS" || successIsConsistent);
  const safeOutcome = inputIsConsistent ? outcome : "FAILED";
  const verificationPassed = safeOutcome === "SUCCESS";
  const errorCandidate = readProperty(input, "errorCode");
  const errorCode =
    safeOutcome === "FAILED"
      ? !inputIsConsistent
        ? "INTERNAL_ERROR"
        : readAllowedValue<OperationErrorCode>({
            value: errorCandidate,
            allowed: operationErrorCodes,
            fallback: "INTERNAL_ERROR",
          })
      : null;
  const retryable =
    safeOutcome === "FAILED" &&
    inputIsConsistent &&
    outcome === "FAILED" &&
    readProperty(input, "retryable") === true;
  const safeStageCategories = Object.freeze([
    ...stageCategories.filter(
      (stage) =>
        stage !== "SUCCESS" && stage !== "FAILED" && stage !== "CANCELLED",
    ),
    safeOutcome,
  ] satisfies ReadOnlyStageCategory[]);
  const reconnectCandidate = readAllowedValue({
    value: readProperty(input, "reconnectState"),
    allowed: readOnlyReconnectStates,
    fallback: "NOT_ATTEMPTED",
  });
  const reconnectState: ReadOnlyReconnectState =
    baselineAvailable &&
    attempts >= 2 &&
    safeOutcome === "SUCCESS" &&
    (reconnectCandidate === "CONSISTENT" || reconnectCandidate === "CHANGED")
      ? reconnectCandidate
      : baselineAvailable &&
          attempts >= 2 &&
          safeOutcome === "FAILED" &&
          retryable &&
          reconnectCandidate === "REQUIRED"
        ? "REQUIRED"
        : "NOT_ATTEMPTED";
  const findings = buildFindings({
    outcome: safeOutcome,
    confidence,
    errorCode,
    retryable,
    reconnectState,
  });

  return Object.freeze({
    schemaVersion: "1",
    reportType: "READ_ONLY_DEVICE_DIAGNOSTIC",
    validationLevel: "BUILD_TESTED",
    hardwareValidation: "NONE",
    operation: Object.freeze({
      outcome: safeOutcome,
      confidence,
      errorCode,
      retryable,
      verificationPassed,
      attempts,
      reconnectState,
    }),
    evidenceSummary: Object.freeze({
      factCategoryCount: factCategories.length,
      factCategories,
      stageCategoryCount: safeStageCategories.length,
      stageCategories: safeStageCategories,
    }),
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
