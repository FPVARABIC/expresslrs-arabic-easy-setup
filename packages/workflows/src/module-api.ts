import type {
  FirmwareArtifactDescriptor,
  TargetCatalog,
} from "@elrs-easy/compatibility";
import type {
  DeviceSessionManager,
  DiscoveryProvider,
  IdentityEvidenceTrustPolicy,
} from "@elrs-easy/device";
import {
  CoreOperationError,
  type ArtifactProvenance,
  type CancellationSignal,
  type DeviceDescriptor,
  type OperationRecord,
} from "@elrs-easy/domain";

import {
  prepareEasyBindingPreview,
  type EasyBindingApproval,
  type EasyBindingPreview,
} from "./binding-preview.js";
import { runEasyBinding, type EasyBindingResult } from "./easy-binding.js";
import {
  prepareFirmwareUpdatePreview,
  type FirmwareUpdateApproval,
  type FirmwareUpdatePreview,
} from "./firmware-update-preview.js";
import {
  runFirmwareUpdate,
  type FirmwareUpdateResult,
} from "./firmware-update.js";
import {
  runReadOnlyDiscovery,
  type ReadOnlyDiscoveryResult,
} from "./read-only-discovery.js";
import type {
  BindingProvider,
  FirmwareUpdateProvider,
} from "./sensitive-operation-contracts.js";
import {
  type OperationObserver,
  type WorkflowClock,
} from "./operation-machine.js";

export interface FoundationModuleProviders {
  readonly discovery: DiscoveryProvider;
  readonly binding: BindingProvider;
  readonly firmwareUpdate: FirmwareUpdateProvider;
}

/**
 * Provisional M1–M4 host boundary. It proves the same Core can be called by
 * Web, Android or a future host without importing React or localized strings.
 * Contract versioning is intentionally deferred until the API stabilizes.
 */
export class FoundationExpressLrsModule {
  readonly #providers: FoundationModuleProviders;
  readonly #sessions: DeviceSessionManager;
  readonly #catalog: TargetCatalog;
  readonly #clock?: WorkflowClock;
  readonly #discoveryEvidencePolicy?: IdentityEvidenceTrustPolicy;
  readonly #usedOperationIds = new Set<string>();

  public constructor(input: {
    readonly providers: FoundationModuleProviders;
    readonly sessions: DeviceSessionManager;
    readonly catalog: TargetCatalog;
    readonly clock?: WorkflowClock;
    readonly discoveryEvidencePolicy?: IdentityEvidenceTrustPolicy;
  }) {
    this.#providers = Object.freeze({ ...input.providers });
    this.#sessions = input.sessions;
    this.#catalog = input.catalog;
    this.#clock = input.clock;
    this.#discoveryEvidencePolicy = input.discoveryEvidencePolicy;
  }

  public discover(input: {
    readonly operationId: string;
    readonly signal?: CancellationSignal;
    readonly onProgress?: OperationObserver<ReadOnlyDiscoveryResult>;
  }): Promise<OperationRecord<ReadOnlyDiscoveryResult>> {
    const operationId = input.operationId;
    const signal = input.signal;
    const onProgress = input.onProgress;
    this.#claimOperationId(operationId);
    return runReadOnlyDiscovery({
      operationId,
      provider: this.#providers.discovery,
      sessions: this.#sessions,
      catalog: this.#catalog,
      ...(this.#discoveryEvidencePolicy === undefined
        ? {}
        : { evidencePolicy: this.#discoveryEvidencePolicy }),
      ...(this.#clock === undefined ? {} : { clock: this.#clock }),
      ...(onProgress === undefined ? {} : { observer: onProgress }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /** Read-only preflight. It does not consume the eventual operation id. */
  public previewBinding(input: {
    readonly operationId: string;
    readonly descriptor: DeviceDescriptor;
    readonly signal?: CancellationSignal;
  }): Promise<EasyBindingPreview> {
    const operationId = input.operationId;
    const descriptor = input.descriptor;
    const signal = input.signal;
    return prepareEasyBindingPreview({
      operationId,
      descriptor,
      provider: this.#providers.binding,
      sessions: this.#sessions,
      catalog: this.#catalog,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  public bind(input: {
    readonly operationId: string;
    readonly descriptor: DeviceDescriptor;
    /** Legacy M1 Synthetic path. New callers should provide approval. */
    readonly userConfirmed?: boolean;
    readonly approval?: EasyBindingApproval;
    readonly signal?: CancellationSignal;
    readonly onProgress?: OperationObserver<EasyBindingResult>;
  }): Promise<OperationRecord<EasyBindingResult>> {
    const operationId = input.operationId;
    const descriptor = input.descriptor;
    const userConfirmed = input.userConfirmed;
    const approval = input.approval;
    const signal = input.signal;
    const onProgress = input.onProgress;
    this.#claimOperationId(operationId);
    return runEasyBinding({
      operationId,
      descriptor,
      provider: this.#providers.binding,
      sessions: this.#sessions,
      catalog: this.#catalog,
      ...(userConfirmed === undefined ? {} : { userConfirmed }),
      ...(approval === undefined ? {} : { approval }),
      ...(this.#clock === undefined ? {} : { clock: this.#clock }),
      ...(onProgress === undefined ? {} : { observer: onProgress }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /** Read-only artifact/provenance and live-device preflight. */
  public previewUpdate(input: {
    readonly operationId: string;
    readonly descriptor: DeviceDescriptor;
    readonly artifact: FirmwareArtifactDescriptor;
    readonly provenance: ArtifactProvenance;
    readonly signal?: CancellationSignal;
  }): Promise<FirmwareUpdatePreview> {
    const operationId = input.operationId;
    const descriptor = input.descriptor;
    const artifact = input.artifact;
    const provenance = input.provenance;
    const signal = input.signal;
    return prepareFirmwareUpdatePreview({
      operationId,
      descriptor,
      artifact,
      provenance,
      provider: this.#providers.firmwareUpdate,
      sessions: this.#sessions,
      catalog: this.#catalog,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  public update(input: {
    readonly operationId: string;
    readonly descriptor: DeviceDescriptor;
    readonly artifact: FirmwareArtifactDescriptor;
    readonly provenance?: ArtifactProvenance;
    /** Legacy M1 Synthetic path. New callers should provide approval. */
    readonly userConfirmed?: boolean;
    readonly approval?: FirmwareUpdateApproval;
    readonly signal?: CancellationSignal;
    readonly onProgress?: OperationObserver<FirmwareUpdateResult>;
  }): Promise<OperationRecord<FirmwareUpdateResult>> {
    const operationId = input.operationId;
    const descriptor = input.descriptor;
    const artifact = input.artifact;
    const provenance = input.provenance;
    const userConfirmed = input.userConfirmed;
    const approval = input.approval;
    const signal = input.signal;
    const onProgress = input.onProgress;
    this.#claimOperationId(operationId);
    return runFirmwareUpdate({
      operationId,
      descriptor,
      artifact,
      provider: this.#providers.firmwareUpdate,
      sessions: this.#sessions,
      catalog: this.#catalog,
      ...(provenance === undefined ? {} : { provenance }),
      ...(userConfirmed === undefined ? {} : { userConfirmed }),
      ...(approval === undefined ? {} : { approval }),
      ...(this.#clock === undefined ? {} : { clock: this.#clock }),
      ...(onProgress === undefined ? {} : { observer: onProgress }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  #claimOperationId(operationId: string): void {
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
