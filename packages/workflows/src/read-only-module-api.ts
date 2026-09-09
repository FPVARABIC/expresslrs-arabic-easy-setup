import type { TargetCatalog } from "@elrs-easy/compatibility";
import type {
  DeviceSessionManager,
  DiscoveryProvider,
  IdentityEvidenceTrustPolicy,
} from "@elrs-easy/device";
import {
  CoreOperationError,
  type CancellationSignal,
  type OperationRecord,
} from "@elrs-easy/domain";

import type { OperationObserver, WorkflowClock } from "./operation-machine.js";
import {
  runReadOnlyDiscovery,
  type ReadOnlyDiscoveryResult,
} from "./read-only-discovery.js";

/**
 * Discovery-only host boundary for Milestone 2 integration spikes. It has no
 * binding, update or generic command surface, so adding a browser provider
 * cannot accidentally acquire write authority through this module.
 */
export class ReadOnlyExpressLrsModule {
  readonly #provider: DiscoveryProvider;
  readonly #sessions: DeviceSessionManager;
  readonly #catalog: TargetCatalog;
  readonly #clock?: WorkflowClock;
  readonly #evidencePolicy?: IdentityEvidenceTrustPolicy;
  readonly #usedOperationIds = new Set<string>();

  public constructor(input: {
    readonly provider: DiscoveryProvider;
    readonly sessions: DeviceSessionManager;
    readonly catalog: TargetCatalog;
    readonly clock?: WorkflowClock;
    readonly evidencePolicy?: IdentityEvidenceTrustPolicy;
  }) {
    // Capture collaborator references once. Caller mutation of the constructor
    // input object cannot swap a provider or trust policy after construction.
    this.#provider = input.provider;
    this.#sessions = input.sessions;
    this.#catalog = input.catalog;
    this.#clock = input.clock;
    this.#evidencePolicy = input.evidencePolicy;
  }

  public discover(input: {
    readonly operationId: string;
    readonly signal?: CancellationSignal;
    readonly onProgress?: OperationObserver<ReadOnlyDiscoveryResult>;
  }): Promise<OperationRecord<ReadOnlyDiscoveryResult>> {
    // Read getter-backed caller fields exactly once before any observer fires.
    const operationId = input.operationId;
    const signal = input.signal;
    const onProgress = input.onProgress;
    this.#claimOperationId(operationId);
    return runReadOnlyDiscovery({
      operationId,
      provider: this.#provider,
      sessions: this.#sessions,
      catalog: this.#catalog,
      ...(this.#clock === undefined ? {} : { clock: this.#clock }),
      ...(this.#evidencePolicy === undefined
        ? {}
        : { evidencePolicy: this.#evidencePolicy }),
      ...(onProgress === undefined ? {} : { observer: onProgress }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  #claimOperationId(operationId: string): void {
    if (
      typeof operationId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(operationId)
    ) {
      throw new CoreOperationError({
        code: "INVALID_STATE_TRANSITION",
        reason: "OPERATION_ID_INVALID",
        details: {},
        retryable: false,
      });
    }
    if (this.#usedOperationIds.has(operationId)) {
      throw new CoreOperationError({
        code: "INVALID_STATE_TRANSITION",
        reason: "OPERATION_ID_ALREADY_USED",
        details: {},
        retryable: false,
      });
    }
    this.#usedOperationIds.add(operationId);
  }
}
