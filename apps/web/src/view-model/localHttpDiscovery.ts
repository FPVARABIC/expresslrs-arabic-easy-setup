import { InMemoryTargetCatalog } from "@elrs-easy/compatibility";
import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import {
  CoreOperationError,
  identityClaims,
  type CancellationSignal,
  type DetectionConfidence,
  type OperationErrorCode,
} from "@elrs-easy/domain";
import {
  createExpressLrsLocalHttpEvidencePolicy,
  ExpressLrsLocalHttpDiscoveryProvider,
  expressLrsLocalHttpOrigins,
  type BrowserFetch,
  type ExpressLrsLocalHttpOrigin,
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
}

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
}): LocalHttpDiscoveryOutcome {
  return Object.freeze({
    state: input.state,
    factsCollected: false,
    verificationPassed: false,
    confidence: "UNKNOWN",
    errorCode: input.errorCode ?? null,
    retryable: input.retryable ?? false,
    facts: Object.freeze([]),
  });
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
}): Promise<LocalHttpDiscoveryOutcome> {
  // Snapshot getter-backed host input exactly once before construction or any
  // network await. The request origin and its stable endpoint id must never
  // diverge if a caller mutates the input object mid-operation.
  const origin = input.origin;
  const signal = input.signal;
  const browserFetch = input.fetch;
  try {
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
      ...(signal === undefined ? {} : { signal }),
    });

    if (operation.state === "CANCELLED") {
      return terminalOutcome({ state: "CANCELLED" });
    }
    const device = operation.result?.devices[0];
    if (operation.state !== "SUCCESS" || device === undefined) {
      return terminalOutcome({
        state: "FAILED",
        errorCode: operation.error?.code ?? "INTERNAL_ERROR",
        retryable: operation.error?.retryable ?? false,
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
    });
  } catch (error: unknown) {
    if (error instanceof CoreOperationError) {
      return terminalOutcome({
        state: "FAILED",
        errorCode: error.operationError.code,
        retryable: error.operationError.retryable,
      });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      return terminalOutcome({ state: "CANCELLED" });
    }
    return terminalOutcome({ state: "FAILED", errorCode: "INTERNAL_ERROR" });
  }
}
