import type { OperationError } from "./errors.js";

export const operationStates = [
  "IDLE",
  "PREPARING",
  "DISCOVERING",
  "IDENTIFYING",
  "WAITING_FOR_CONFIRMATION",
  "EXECUTING",
  "WRITE_COMPLETED",
  "REBOOTING",
  "RECONNECTING",
  "VERIFYING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "UNKNOWN_STATE",
  "RECOVERY_REQUIRED",
] as const;

export type OperationState = (typeof operationStates)[number];

export const terminalOperationStates = [
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "UNKNOWN_STATE",
  "RECOVERY_REQUIRED",
] as const satisfies readonly OperationState[];

export interface OperationProgress {
  readonly stage: OperationState;
  readonly messageCode: string;
  /** Set only when the provider reports real byte counts. */
  readonly bytesWritten?: number;
  readonly totalBytes?: number;
}

export interface OperationRecord<TResult = unknown> {
  readonly id: string;
  readonly type: string;
  readonly state: OperationState;
  readonly progress: OperationProgress;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly result: TResult | null;
  readonly error: OperationError | null;
  readonly verificationPassed: boolean;
  readonly history: readonly OperationState[];
}

export function isTerminalOperationState(state: OperationState): boolean {
  return (terminalOperationStates as readonly OperationState[]).includes(state);
}
