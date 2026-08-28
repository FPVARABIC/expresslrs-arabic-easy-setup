import { InMemoryTargetCatalog } from "@elrs-easy/compatibility";
import {
  createReadOnlyDiagnosticReport,
  readOnlyStageCategories,
  type ReadOnlyDiagnosticReport,
  type ReadOnlyFactCategory,
  type ReadOnlyReconnectState,
  type ReadOnlyStageCategory,
} from "@elrs-easy/diagnostics";
import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import {
  CoreOperationError,
  identityClaims,
  type CancellationSignal,
  type DetectionConfidence,
  type OperationErrorCode,
} from "@elrs-easy/domain";
import {
  assessLocalNetworkPermission,
  createExpressLrsLocalHttpEvidencePolicy,
  ExpressLrsLocalHttpDiscoveryProvider,
  expressLrsLocalHttpOrigins,
  type BrowserFetch,
  type ExpressLrsLocalHttpOrigin,
  type LocalNetworkPermissionState,
} from "@elrs-easy/platform-browser";
import { ReadOnlyExpressLrsModule } from "@elrs-easy/workflows";

export { expressLrsLocalHttpOrigins };
export type { ExpressLrsLocalHttpOrigin };

export type LocalHttpFactKey =
  | "product"
  | "target"
  | "version"
  | "commit"
  | "role"
  | "radio"
  | "band"
  | "regLow"
  | "regHigh"
  | "custom";

export interface LocalHttpDeviceFact {
  readonly key: LocalHttpFactKey;
  readonly value: string;
}

export interface LocalHttpDiscoveryOutcome {
  readonly state: "SUCCESS" | "FAILED" | "CANCELLED";
  readonly factsCollected: boolean;
  readonly verificationPassed: boolean;
  readonly confidence: DetectionConfidence;
  readonly errorCode: OperationErrorCode | null;
  readonly retryable: boolean;
  readonly facts: readonly LocalHttpDeviceFact[];
  readonly stageCategories: readonly ReadOnlyStageCategory[];
}

export type LocalHttpProgressObserver = (stage: ReadOnlyStageCategory) => void;
export type LocalNetworkPermissionAssessment = () => Promise<LocalNetworkPermissionState>;

const emptyTargetCatalog = new InMemoryTargetCatalog(
  {
    source: "m2a-empty-license-safe-catalog",
    revision: "none",
    schemaVersion: "0",
    contentDigest: "none",
    redistributionApproved: false,
  },
  [],
);

const factOrder: ReadonlyMap<string, LocalHttpFactKey> = new Map([
  [identityClaims.product, "product"],
  [identityClaims.target, "target"],
  [identityClaims.firmwareVersion, "version"],
  [identityClaims.firmwareCommit, "commit"],
  [identityClaims.deviceRole, "role"],
  [identityClaims.radioFamily, "radio"],
  [identityClaims.frequencyBand, "band"],
  [identityClaims.regulatoryDomainLow, "regLow"],
  [identityClaims.regulatoryDomainHigh, "regHigh"],
  [identityClaims.customHardwarePresent, "custom"],
]);

let operationSequence = 0;
let sessionSequence = 0;
const localHttpSessions = new ExclusiveDeviceSessionManager({
  ids: { next: () => `web-local-http-session-${++sessionSequence}` },
});

function endpointDeviceId(origin: ExpressLrsLocalHttpOrigin): string {
  switch (origin) {
    case "http://10.0.0.1":
      return "local-http-endpoint-ap";
    case "http://elrs_rx.local":
      return "local-http-endpoint-rx";
    case "http://elrs_tx.local":
      return "local-http-endpoint-tx";
  }
}

function terminalOutcome(input: {
  readonly state: "FAILED" | "CANCELLED";
  readonly errorCode?: OperationErrorCode;
  readonly retryable?: boolean;
  readonly stageCategories: readonly ReadOnlyStageCategory[];
}): LocalHttpDiscoveryOutcome {
  return Object.freeze({
    state: input.state,
    factsCollected: false,
    verificationPassed: false,
    confidence: "UNKNOWN",
    errorCode: input.errorCode ?? null,
    retryable: input.retryable ?? false,
    facts: Object.freeze([]),
    stageCategories: Object.freeze([...input.stageCategories]),
  });
}

function addProgressStage(
  stages: Set<ReadOnlyStageCategory>,
  value: unknown,
  observer?: LocalHttpProgressObserver,
): void {
  if (
    typeof value !== "string" ||
    !readOnlyStageCategories.includes(value as ReadOnlyStageCategory)
  ) {
    return;
  }
  const stage = value as ReadOnlyStageCategory;
  if (stages.has(stage)) {
    return;
  }
  stages.add(stage);
  try {
    observer?.(stage);
  } catch {
    // Host observability must not affect the read or expose callback errors.
  }
}

function factsFromEvidence(
  evidence: readonly {
    readonly claim: string;
    readonly rawValue: string;
  }[],
): readonly LocalHttpDeviceFact[] {
  const byKey = new Map<LocalHttpFactKey, string>();
  for (const item of evidence) {
    const key = factOrder.get(item.claim);
    if (key !== undefined && !byKey.has(key)) {
      byKey.set(key, item.rawValue);
    }
  }
  return Object.freeze(
    [...factOrder.values()].flatMap((key) => {
      const value = byKey.get(key);
      return value === undefined
        ? []
        : [Object.freeze({ key, value }) satisfies LocalHttpDeviceFact];
    }),
  );
}

/**
 * Runs the real M2A read-only adapter through the same platform-independent
 * discovery workflow used by future hosts. The empty catalog intentionally
 * keeps self-reported `/config` data from resolving a Target.
 */
export async function runLocalHttpDiscovery(input: {
  readonly origin: ExpressLrsLocalHttpOrigin;
  readonly signal?: CancellationSignal;
  readonly fetch?: BrowserFetch;
  readonly onProgress?: LocalHttpProgressObserver;
  readonly permissionAssessment?: LocalNetworkPermissionAssessment;
}): Promise<LocalHttpDiscoveryOutcome> {
  const origin = input.origin;
  const signal = input.signal;
  const browserFetch = input.fetch;
  const onProgress = input.onProgress;
  const permissionAssessment =
    input.permissionAssessment ?? assessLocalNetworkPermission;
  const stages = new Set<ReadOnlyStageCategory>();
  try {
    const permissionState = await permissionAssessment();
    if (permissionState === "DENIED") {
      addProgressStage(stages, "FAILED", onProgress);
      return terminalOutcome({
        state: "FAILED",
        errorCode: "PERMISSION_DENIED",
        retryable: false,
        stageCategories: [...stages],
      });
    }

    const provider = new ExpressLrsLocalHttpDiscoveryProvider({
      origin,
      createDeviceId: () => endpointDeviceId(origin),
      ...(browserFetch === undefined ? {} : { fetch: browserFetch }),
    });
    const module = new ReadOnlyExpressLrsModule({
      provider,
      sessions: localHttpSessions,
      catalog: emptyTargetCatalog,
      evidencePolicy: createExpressLrsLocalHttpEvidencePolicy(provider),
    });
    const operation = await module.discover({
      operationId: `web-local-http-discovery-${++operationSequence}`,
      onProgress(snapshot) {
        addProgressStage(stages, snapshot.state, onProgress);
      },
      ...(signal === undefined ? {} : { signal }),
    });

    if (operation.state === "CANCELLED") {
      addProgressStage(stages, "CANCELLED", onProgress);
      return terminalOutcome({
        state: "CANCELLED",
        stageCategories: [...stages],
      });
    }
    const device = operation.result?.devices[0];
    if (operation.state !== "SUCCESS" || device === undefined) {
      return terminalOutcome({
        state: "FAILED",
        errorCode: operation.error?.code ?? "INTERNAL_ERROR",
        retryable: operation.error?.retryable ?? false,
        stageCategories: [...stages],
      });
    }

    return Object.freeze({
      state: "SUCCESS",
      factsCollected: true,
      verificationPassed: operation.verificationPassed,
      confidence: device.identity.confidence,
      errorCode: null,
      retryable: false,
      facts: factsFromEvidence(device.snapshot.evidence),
      stageCategories: Object.freeze([...stages]),
    });
  } catch (error: unknown) {
    if (error instanceof CoreOperationError) {
      addProgressStage(stages, "FAILED", onProgress);
      return terminalOutcome({
        state: "FAILED",
        errorCode: error.operationError.code,
        retryable: error.operationError.retryable,
        stageCategories: [...stages],
      });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      addProgressStage(stages, "CANCELLED", onProgress);
      return terminalOutcome({
        state: "CANCELLED",
        stageCategories: [...stages],
      });
    }
    addProgressStage(stages, "FAILED", onProgress);
    return terminalOutcome({
      state: "FAILED",
      errorCode: "INTERNAL_ERROR",
      stageCategories: [...stages],
    });
  }
}

const diagnosticFactCategory: Readonly<
  Record<LocalHttpFactKey, ReadOnlyFactCategory>
> = Object.freeze({
  product: "PRODUCT",
  target: "TARGET",
  version: "FIRMWARE_VERSION",
  commit: "FIRMWARE_COMMIT",
  role: "DEVICE_ROLE",
  radio: "RADIO_FAMILY",
  band: "FREQUENCY_BAND",
  regLow: "REGULATORY_DOMAIN_LOW",
  regHigh: "REGULATORY_DOMAIN_HIGH",
  custom: "CUSTOM_HARDWARE_PRESENT",
});

function safeFactValue(
  facts: readonly LocalHttpDeviceFact[],
  key: LocalHttpFactKey,
): string | null {
  try {
    const fact = facts.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        candidate.key === key &&
        typeof candidate.value === "string",
    );
    return fact?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Compares only the minimum self-reported identity envelope in memory. A
 * match means consistent snapshots, never authenticated physical identity.
 */
export function compareLocalHttpIdentitySnapshots(
  baseline: readonly LocalHttpDeviceFact[],
  current: readonly LocalHttpDeviceFact[],
): "CONSISTENT" | "CHANGED" {
  for (const key of ["target", "version", "role"] as const) {
    const before = safeFactValue(baseline, key);
    const after = safeFactValue(current, key);
    if (before === null || after === null || before !== after) {
      return "CHANGED";
    }
  }
  return "CONSISTENT";
}

export function createLocalHttpSupportReport(input: {
  readonly outcome: LocalHttpDiscoveryOutcome;
  readonly attempts: number;
  readonly baselineAvailable: boolean;
  readonly reconnectState: ReadOnlyReconnectState;
}): ReadOnlyDiagnosticReport {
  return createReadOnlyDiagnosticReport({
    outcome: input.outcome.state,
    confidence: input.outcome.confidence,
    errorCode: input.outcome.errorCode,
    retryable: input.outcome.retryable,
    verificationPassed: input.outcome.verificationPassed,
    attempts: input.attempts,
    baselineAvailable: input.baselineAvailable,
    reconnectState: input.reconnectState,
    factCategories: input.outcome.facts.map(
      (fact) => diagnosticFactCategory[fact.key],
    ),
    stageCategories: input.outcome.stageCategories,
  });
}
