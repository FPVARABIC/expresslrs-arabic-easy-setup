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

/**
 * Public operation errors are safe-by-construction. Adapters may provide raw
 * diagnostics elsewhere, but only reviewed primitive fields can cross this
 * boundary or reach a host/export path.
 */
export function sanitizeOperationError(error: OperationError): OperationError {
  const runtimeError = error as Partial<OperationError>;
  const codeIsKnown = operationErrorCodes.includes(
    runtimeError.code as OperationErrorCode,
  );
  const reason =
    typeof runtimeError.reason === "string" ? runtimeError.reason.trim() : "";
  const detailsAreSafeShape =
    runtimeError.details !== null &&
    typeof runtimeError.details === "object" &&
    !Array.isArray(runtimeError.details);
  if (
    !codeIsKnown ||
    !/^[A-Z0-9][A-Z0-9_:-]{0,127}$/u.test(reason) ||
    !detailsAreSafeShape ||
    typeof runtimeError.retryable !== "boolean"
  ) {
    return Object.freeze({
      code: "INTERNAL_ERROR",
      reason: "UNSAFE_PROVIDER_ERROR_REJECTED",
      details: Object.freeze({}),
      retryable: false,
    });
  }
  const scrubbed = scrubAuditDetails(runtimeError.details!);
  return Object.freeze({
    code: runtimeError.code!,
    reason,
    details: scrubbed.details,
    retryable: runtimeError.retryable,
  });
}

export class CoreOperationError extends Error {
  public readonly operationError: OperationError;

  public constructor(operationError: OperationError) {
    const safeError = sanitizeOperationError(operationError);
    super(safeError.reason);
    this.name = "CoreOperationError";
    this.operationError = safeError;
  }
}
