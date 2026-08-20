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

export class CoreOperationError extends Error {
  public readonly operationError: OperationError;

  public constructor(operationError: OperationError) {
    super(operationError.reason);
    this.name = "CoreOperationError";
    this.operationError = Object.freeze({
      ...operationError,
      details: Object.freeze({ ...operationError.details }),
    });
  }
}
