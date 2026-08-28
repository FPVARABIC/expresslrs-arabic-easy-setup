import { scrubAuditDetails } from "./audit.js";

export const operationErrorCodes = [
  "DEVICE_NOT_FOUND",
  "DEVICE_BUSY",
  "PERMISSION_DENIED",
  "CONNECTION_LOST",
  "IDENTITY_UNKNOWN",
  "IDENTITY_AMBIGUOUS",
  "TARGET_UNKNOWN",
  "TARGET_MISMATCH",
  "VERSION_INCOMPATIBLE",
  "PROVIDER_UNSUPPORTED",
  "ARTIFACT_INVALID",
  "VERIFICATION_FAILED",
  "INVALID_STATE_TRANSITION",
  "RECOVERY_REQUIRED",
  "INTERNAL_ERROR",
] as const;

export type OperationErrorCode = (typeof operationErrorCodes)[number];

export interface OperationError {
  readonly code: OperationErrorCode;
  /** Stable non-localized reason for logs and programmatic handling. */
  readonly reason: string;
  /** Safe structured detail only; adapters must not place secrets here. */
  readonly details: Readonly<Record<string, string | number | boolean>>;
  readonly retryable: boolean;
}

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

function rejectedOperationError(): OperationError {
  return Object.freeze({
    code: "INTERNAL_ERROR",
    reason: "UNSAFE_PROVIDER_ERROR_REJECTED",
    details: Object.freeze({}),
    retryable: false,
  });
}

/**
 * Public operation errors are safe-by-construction. Adapters may provide raw
 * diagnostics elsewhere, but only reviewed primitive fields can cross this
 * boundary or reach a host/export path. Provider-owned accessors are never
 * executed while sanitizing the envelope.
 */
export function sanitizeOperationError(error: OperationError | unknown): OperationError {
  const rawCode = readOwnDataProperty(error, "code");
  const rawReason = readOwnDataProperty(error, "reason");
  const rawDetails = readOwnDataProperty(error, "details");
  const rawRetryable = readOwnDataProperty(error, "retryable");
  const codeIsKnown =
    typeof rawCode === "string" &&
    operationErrorCodes.includes(rawCode as OperationErrorCode);
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  const detailsAreSafeShape =
    rawDetails !== null &&
    typeof rawDetails === "object" &&
    !Array.isArray(rawDetails);
  if (
    !codeIsKnown ||
    !/^[A-Z0-9][A-Z0-9_:-]{0,127}$/u.test(reason) ||
    !detailsAreSafeShape ||
    typeof rawRetryable !== "boolean"
  ) {
    return rejectedOperationError();
  }
  const scrubbed = scrubAuditDetails(
    rawDetails as Readonly<Record<string, unknown>>,
  );
  return Object.freeze({
    code: rawCode as OperationErrorCode,
    reason,
    details: scrubbed.details,
    retryable: rawRetryable,
  });
}

export class CoreOperationError extends Error {
  public readonly operationError: OperationError;

  public constructor(operationError: OperationError | unknown) {
    const safeError = sanitizeOperationError(operationError);
    super(safeError.reason);
    this.name = "CoreOperationError";
    this.operationError = safeError;
  }
}
