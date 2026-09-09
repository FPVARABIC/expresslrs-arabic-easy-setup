import type { WorkflowClock } from "@elrs-easy/workflows";

/** Deterministic clock for timeout, retry and operation-history fixtures. */
export class ManualWorkflowClock implements WorkflowClock {
  #milliseconds: number;

  public constructor(start = "2026-08-20T08:00:00.000Z") {
    this.#milliseconds = Date.parse(start);
    if (!Number.isFinite(this.#milliseconds)) {
      throw new TypeError(`Invalid synthetic clock start: ${start}`);
    }
  }

  public now(): string {
    return new Date(this.#milliseconds).toISOString();
  }

  public advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new TypeError("Clock advance must be a non-negative number");
    }
    this.#milliseconds += milliseconds;
  }
}
