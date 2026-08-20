import {
  CoreOperationError,
  createAuditEvent,
  isTerminalOperationState,
  sanitizeOperationError,
  type AuditDetailValue,
  type AuditEvent,
  type AuditOutcome,
  type AuditSeverity,
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
  VERIFYING: ["FAILED", "CANCELLED", "UNKNOWN_STATE", "RECOVERY_REQUIRED"],
  SUCCESS: [],
  FAILED: [],
  CANCELLED: [],
  UNKNOWN_STATE: [],
  RECOVERY_REQUIRED: [],
} as const satisfies Readonly<
  Record<OperationState, readonly OperationState[]>
>;

export type OperationObserver<TResult = unknown> = (
  snapshot: OperationRecord<TResult>,
) => void;

export interface StartOperationInput<TResult = unknown> {
  readonly id: string;
  readonly type: string;
  readonly clock?: WorkflowClock;
  readonly observer?: OperationObserver<TResult>;
}

type UncertainTerminalState = "UNKNOWN_STATE" | "RECOVERY_REQUIRED";
type DirectTransitionState = Exclude<
  OperationState,
  "SUCCESS" | UncertainTerminalState
>;

/**
 * Shared operation machine. SUCCESS is intentionally absent from transition();
 * the only success path is verificationSucceeded() while in VERIFYING.
 */
export class VerifiedOperationMachine<TResult = unknown> {
  readonly #clock: WorkflowClock;
  readonly #observer: OperationObserver<TResult> | undefined;
  #record: OperationRecord<TResult>;

  public constructor(input: StartOperationInput<TResult>) {
    this.#clock = input.clock ?? systemClock;
    this.#observer = input.observer;
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
      auditEvents: [
        createAuditEvent({
          id: `${input.id}:0`,
          operationId: input.id,
          sequence: 0,
          occurredAt: now,
          operationType: input.type,
          stage: "IDLE",
          eventCode: "OPERATION_IDLE",
          outcome: "STARTED",
          severity: "INFO",
        }),
      ],
    };
    this.#notifyObserver();
  }

  public snapshot(): OperationRecord<TResult> {
    return Object.freeze({
      ...this.#record,
      progress: Object.freeze({ ...this.#record.progress }),
      history: Object.freeze([...this.#record.history]),
      auditEvents: Object.freeze([...this.#record.auditEvents]),
    });
  }

  public transition(
    next: DirectTransitionState,
    progress?: Omit<OperationProgress, "stage">,
  ): OperationRecord<TResult> {
    this.#assertDirectTransition(next);
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
      auditEvents: [
        ...this.#record.auditEvents,
        this.#event({
          state: "SUCCESS",
          eventCode: "VERIFICATION_PASSED",
          outcome: "SUCCEEDED",
          severity: "INFO",
          occurredAt: now,
        }),
      ],
    };
    return this.#publish();
  }

  public fail(error: OperationError): OperationRecord<TResult> {
    if (isTerminalOperationState(this.#record.state)) {
      throw this.#invalidTransition("FAILED");
    }
    this.#assertTransition("FAILED");
    const now = this.#clock.now();
    const safeError = sanitizeOperationError(error);
    this.#record = {
      ...this.#record,
      state: "FAILED",
      progress: { stage: "FAILED", messageCode: safeError.code },
      updatedAt: now,
      result: null,
      error: safeError,
      verificationPassed: false,
      history: [...this.#record.history, "FAILED"],
      auditEvents: [
        ...this.#record.auditEvents,
        this.#event({
          state: "FAILED",
          eventCode: safeError.code,
          outcome: "FAILED",
          severity: "ERROR",
          occurredAt: now,
          details: {
            errorCode: safeError.code,
            retryable: safeError.retryable,
          },
        }),
      ],
    };
    return this.#publish();
  }

  /**
   * Ends an operation whose physical outcome cannot be proved. Unlike a plain
   * transition, this always carries a structured error so callers never see an
   * unexplained terminal state.
   */
  public endUncertain(
    state: UncertainTerminalState,
    error: OperationError,
  ): OperationRecord<TResult> {
    if (isTerminalOperationState(this.#record.state)) {
      throw this.#invalidTransition(state);
    }
    this.#assertTransition(state);
    const now = this.#clock.now();
    const safeError = sanitizeOperationError(error);
    this.#record = {
      ...this.#record,
      state,
      progress: { stage: state, messageCode: safeError.code },
      updatedAt: now,
      result: null,
      error: safeError,
      verificationPassed: false,
      history: [...this.#record.history, state],
      auditEvents: [
        ...this.#record.auditEvents,
        this.#event({
          state,
          eventCode: safeError.code,
          outcome: "UNKNOWN",
          severity: "ERROR",
          occurredAt: now,
          details: {
            errorCode: safeError.code,
            retryable: safeError.retryable,
          },
        }),
      ],
    };
    return this.#publish();
  }

  #setState(
    state: DirectTransitionState,
    progress?: Omit<OperationProgress, "stage">,
  ): OperationRecord<TResult> {
    this.#assertProgress(progress);
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
      auditEvents: [
        ...this.#record.auditEvents,
        this.#event({
          state,
          eventCode: progress?.messageCode ?? `OPERATION_${state}`,
          outcome: state === "CANCELLED" ? "CANCELLED" : "PROGRESSED",
          severity: state === "CANCELLED" ? "WARNING" : "INFO",
          occurredAt: now,
          details: {
            ...(progress?.bytesWritten === undefined
              ? {}
              : { bytesWritten: progress.bytesWritten }),
            ...(progress?.totalBytes === undefined
              ? {}
              : { totalBytes: progress.totalBytes }),
          },
        }),
      ],
    };
    return this.#publish();
  }

  #publish(): OperationRecord<TResult> {
    const snapshot = this.snapshot();
    this.#notifyObserver(snapshot);
    return snapshot;
  }

  #notifyObserver(snapshot = this.snapshot()): void {
    try {
      // A callback contextually typed as `void` may still return a Promise (or
      // any other value). Inspect the runtime result so rejected async
      // observers are consumed without narrowing existing host callbacks.
      const completion = this.#observer?.(snapshot) as unknown;
      if (completion !== undefined) {
        void Promise.resolve(completion).catch(() => undefined);
      }
    } catch {
      // Observability must never change the physical operation outcome.
    }
  }

  #event(input: {
    readonly state: OperationState;
    readonly eventCode: string;
    readonly outcome: AuditOutcome;
    readonly severity: AuditSeverity;
    readonly occurredAt: string;
    readonly details?: Readonly<Record<string, AuditDetailValue>>;
  }): AuditEvent {
    const sequence = this.#record.auditEvents.length;
    return createAuditEvent({
      id: `${this.#record.id}:${sequence}`,
      operationId: this.#record.id,
      sequence,
      occurredAt: input.occurredAt,
      operationType: this.#record.type,
      stage: input.state,
      eventCode: input.eventCode,
      outcome: input.outcome,
      severity: input.severity,
      ...(input.details === undefined ? {} : { details: input.details }),
    });
  }

  #assertTransition(next: OperationState): void {
    const current = this.#record.state;
    if (
      !(allowedTransitions[current] as readonly OperationState[]).includes(next)
    ) {
      throw this.#invalidTransition(next);
    }
  }

  #assertDirectTransition(next: OperationState): void {
    if (next === "UNKNOWN_STATE" || next === "RECOVERY_REQUIRED") {
      throw this.#invalidTransition(next);
    }
  }

  #assertProgress(
    progress: Omit<OperationProgress, "stage"> | undefined,
  ): void {
    const bytesWritten = progress?.bytesWritten;
    const totalBytes = progress?.totalBytes;
    const invalidBytesWritten =
      bytesWritten !== undefined &&
      (!Number.isSafeInteger(bytesWritten) || bytesWritten < 0);
    const invalidTotalBytes =
      totalBytes !== undefined &&
      (!Number.isSafeInteger(totalBytes) || totalBytes < 0);
    const exceedsTotal =
      bytesWritten !== undefined &&
      totalBytes !== undefined &&
      bytesWritten > totalBytes;
    const incompletePair =
      (bytesWritten === undefined) !== (totalBytes === undefined);

    if (
      invalidBytesWritten ||
      invalidTotalBytes ||
      exceedsTotal ||
      incompletePair
    ) {
      throw new CoreOperationError({
        code: "INVALID_STATE_TRANSITION",
        reason: "OPERATION_PROGRESS_BYTES_INVALID",
        details: {
          ...(bytesWritten === undefined ? {} : { bytesWritten }),
          ...(totalBytes === undefined ? {} : { totalBytes }),
        },
        retryable: false,
      });
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
