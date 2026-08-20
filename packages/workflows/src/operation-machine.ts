import {
  CoreOperationError,
  isTerminalOperationState,
  type OperationError,
  type OperationProgress,
  type OperationRecord,
  type OperationState,
} from "@elrs-easy/domain";

export interface WorkflowClock {
  now(): string;
}

const systemClock: WorkflowClock = {
  now: () => new Date().toISOString(),
};

const allowedTransitions = {
  IDLE: ["PREPARING", "CANCELLED"],
  PREPARING: [
    "DISCOVERING",
    "IDENTIFYING",
    "WAITING_FOR_CONFIRMATION",
    "EXECUTING",
    "FAILED",
    "CANCELLED",
  ],
  DISCOVERING: ["IDENTIFYING", "FAILED", "CANCELLED"],
  IDENTIFYING: [
    "WAITING_FOR_CONFIRMATION",
    "EXECUTING",
    "VERIFYING",
    "FAILED",
    "CANCELLED",
  ],
  WAITING_FOR_CONFIRMATION: ["EXECUTING", "FAILED", "CANCELLED"],
  EXECUTING: [
    "WRITE_COMPLETED",
    "REBOOTING",
    "RECONNECTING",
    "VERIFYING",
    "FAILED",
    "CANCELLED",
    "UNKNOWN_STATE",
    "RECOVERY_REQUIRED",
  ],
  WRITE_COMPLETED: [
    "REBOOTING",
    "RECONNECTING",
    "VERIFYING",
    "FAILED",
    "UNKNOWN_STATE",
    "RECOVERY_REQUIRED",
  ],
  REBOOTING: ["RECONNECTING", "FAILED", "UNKNOWN_STATE", "RECOVERY_REQUIRED"],
  RECONNECTING: ["VERIFYING", "FAILED", "UNKNOWN_STATE", "RECOVERY_REQUIRED"],
  VERIFYING: ["FAILED", "UNKNOWN_STATE", "RECOVERY_REQUIRED"],
  SUCCESS: [],
  FAILED: [],
  CANCELLED: [],
  UNKNOWN_STATE: [],
  RECOVERY_REQUIRED: [],
} as const satisfies Readonly<
  Record<OperationState, readonly OperationState[]>
>;

export interface StartOperationInput {
  readonly id: string;
  readonly type: string;
  readonly clock?: WorkflowClock;
}

/**
 * Shared operation machine. SUCCESS is intentionally absent from transition();
 * the only success path is verificationSucceeded() while in VERIFYING.
 */
export class VerifiedOperationMachine<TResult = unknown> {
  readonly #clock: WorkflowClock;
  #record: OperationRecord<TResult>;

  public constructor(input: StartOperationInput) {
    this.#clock = input.clock ?? systemClock;
    const now = this.#clock.now();
    this.#record = {
      id: input.id,
      type: input.type,
      state: "IDLE",
      progress: { stage: "IDLE", messageCode: "OPERATION_IDLE" },
      startedAt: now,
      updatedAt: now,
      result: null,
      error: null,
      verificationPassed: false,
      history: ["IDLE"],
    };
  }

  public snapshot(): OperationRecord<TResult> {
    return Object.freeze({
      ...this.#record,
      progress: Object.freeze({ ...this.#record.progress }),
      history: Object.freeze([...this.#record.history]),
    });
  }

  public transition(
    next: Exclude<OperationState, "SUCCESS">,
    progress?: Omit<OperationProgress, "stage">,
  ): OperationRecord<TResult> {
    this.#assertTransition(next);
    return this.#setState(next, progress);
  }

  public verificationSucceeded(result: TResult): OperationRecord<TResult> {
    if (this.#record.state !== "VERIFYING") {
      throw this.#invalidTransition("SUCCESS");
    }
    const now = this.#clock.now();
    this.#record = {
      ...this.#record,
      state: "SUCCESS",
      progress: { stage: "SUCCESS", messageCode: "VERIFICATION_PASSED" },
      updatedAt: now,
      result,
      error: null,
      verificationPassed: true,
      history: [...this.#record.history, "SUCCESS"],
    };
    return this.snapshot();
  }

  public fail(error: OperationError): OperationRecord<TResult> {
    if (isTerminalOperationState(this.#record.state)) {
      throw this.#invalidTransition("FAILED");
    }
    this.#assertTransition("FAILED");
    const now = this.#clock.now();
    this.#record = {
      ...this.#record,
      state: "FAILED",
      progress: { stage: "FAILED", messageCode: error.code },
      updatedAt: now,
      result: null,
      error: Object.freeze({
        ...error,
        details: Object.freeze({ ...error.details }),
      }),
      verificationPassed: false,
      history: [...this.#record.history, "FAILED"],
    };
    return this.snapshot();
  }

  #setState(
    state: Exclude<OperationState, "SUCCESS">,
    progress?: Omit<OperationProgress, "stage">,
  ): OperationRecord<TResult> {
    const now = this.#clock.now();
    this.#record = {
      ...this.#record,
      state,
      progress: {
        stage: state,
        messageCode: progress?.messageCode ?? `OPERATION_${state}`,
        ...(progress?.bytesWritten === undefined
          ? {}
          : { bytesWritten: progress.bytesWritten }),
        ...(progress?.totalBytes === undefined
          ? {}
          : { totalBytes: progress.totalBytes }),
      },
      updatedAt: now,
      history: [...this.#record.history, state],
    };
    return this.snapshot();
  }

  #assertTransition(next: OperationState): void {
    const current = this.#record.state;
    if (
      !(allowedTransitions[current] as readonly OperationState[]).includes(next)
    ) {
      throw this.#invalidTransition(next);
    }
  }

  #invalidTransition(next: OperationState): CoreOperationError {
    return new CoreOperationError({
      code: "INVALID_STATE_TRANSITION",
      reason: "OPERATION_STATE_TRANSITION_NOT_ALLOWED",
      details: { from: this.#record.state, to: next },
      retryable: false,
    });
  }
}
