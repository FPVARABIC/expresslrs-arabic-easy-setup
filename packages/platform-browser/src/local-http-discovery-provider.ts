import type {
  DiscoveryProvider,
  IdentityEvidenceTrustPolicy,
} from "@elrs-easy/device";
import {
  CoreOperationError,
  createIdentityEvidence,
  identityClaims,
  type CancellationSignal,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityEvidence,
  type DeviceSession,
  type IdentityClaim,
} from "@elrs-easy/domain";

export const expressLrsLocalHttpOrigins = Object.freeze([
  "http://10.0.0.1",
  "http://elrs_rx.local",
  "http://elrs_tx.local",
] as const);

export type ExpressLrsLocalHttpOrigin =
  (typeof expressLrsLocalHttpOrigins)[number];

export interface ExpressLrsLocalHttpCapabilityAssessment {
  readonly validation: "UNVALIDATED";
  readonly readOnly: true;
  readonly route: "/config";
  readonly origins: readonly ExpressLrsLocalHttpOrigin[];
  readonly limitations: readonly string[];
}

/**
 * Planning evidence only. A successful HTTP response is not hardware
 * validation and does not authorize binding, configuration or firmware writes.
 */
export const expressLrsLocalHttpCapabilityAssessment: ExpressLrsLocalHttpCapabilityAssessment =
  Object.freeze({
    validation: "UNVALIDATED",
    readOnly: true,
    route: "/config",
    origins: expressLrsLocalHttpOrigins,
    limitations: Object.freeze([
      "SELF_REPORTED_DEVICE_FACTS",
      "HARDWARE_VALIDATION_PENDING",
      "BROWSER_NETWORK_POLICY_APPLIES",
      "NO_WRITE_AUTHORITY",
      "ONE_SNAPSHOT_PER_PROVIDER_INSTANCE",
    ]),
  });

export type BrowserFetch = (
  input: string,
  init: RequestInit,
) => Promise<unknown>;

export interface ExpressLrsLocalHttpDiscoveryProviderOptions {
  /** Must be one exact, user-selected official ExpressLRS local origin. */
  readonly origin: ExpressLrsLocalHttpOrigin | string;
  /** Injection point for deterministic tests and future browser host adapters. */
  readonly fetch?: BrowserFetch;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  readonly createDeviceId?: () => string;
}

interface SafeSettings {
  readonly productName?: string;
  readonly target?: string;
  readonly version?: string;
  readonly firmwareCommit?: string;
  readonly deviceRole?: "TX" | "RX";
  readonly radioType?: string;
  readonly hasLowBand?: boolean;
  readonly hasHighBand?: boolean;
  readonly regulatoryDomainLow?: string;
  readonly regulatoryDomainHigh?: string;
  readonly customHardware?: boolean;
}

interface SanitizedDiscoverySnapshot {
  readonly descriptor: DeviceDescriptor;
  readonly evidence: readonly DeviceIdentityEvidence[];
  readonly capabilities: readonly Capability[];
}

interface AbortEventSignal extends CancellationSignal {
  addEventListener(
    type: "abort",
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

interface ResponseReader {
  read(): Promise<unknown>;
  cancel?: () => Promise<unknown>;
  releaseLock?: () => void;
}

const providerId = "expresslrs-local-http-config";
const evidenceSourceKind = "expresslrs-http-config";
const maximumResponseBytes = 256 * 1024;
const maximumResponseChunks = 4_096;
const maximumFactLength = 256;
const defaultTimeoutMs = 8_000;
const maximumTimeoutMs = 60_000;
const safeDeviceId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const safeDomainToken = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const unsafeFactUnicode = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const jsonContentType =
  /^application\/json(?:\s*;\s*charset\s*=\s*(?:"utf-8"|utf-8))?\s*$/iu;
let deviceSequence = 0;
// Discovery runs before Core has a concrete DeviceDescriptor to lease. Keep a
// narrow transport-level guard so two provider instances in the same host
// cannot issue overlapping requests to one device origin. Core still owns the
// subsequent opaque DeviceSession for identity/capability reads.
const activeOrigins = new Set<ExpressLrsLocalHttpOrigin>();

function operationError(
  code:
    | "CONNECTION_LOST"
    | "DEVICE_BUSY"
    | "DEVICE_NOT_FOUND"
    | "INVALID_STATE_TRANSITION"
    | "PROVIDER_UNSUPPORTED",
  reason: string,
  retryable: boolean,
): CoreOperationError {
  return new CoreOperationError({
    code,
    reason,
    details: {},
    retryable,
  });
}

function abortError(): Error {
  const error = new Error("The local HTTP discovery request was cancelled");
  error.name = "AbortError";
  return error;
}

function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    throw abortError();
  }
}

function supportsAbortEvents(
  signal: CancellationSignal,
): signal is AbortEventSignal {
  const candidate = signal as Partial<AbortEventSignal>;
  return (
    typeof candidate.addEventListener === "function" &&
    typeof candidate.removeEventListener === "function"
  );
}

function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredPlainObject(
  value: unknown,
  reason: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    throw operationError("PROVIDER_UNSUPPORTED", reason, false);
  }
  return value;
}

function hasOwn(
  value: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function optionalSafeText(
  settings: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  if (!hasOwn(settings, key)) {
    return undefined;
  }
  const value = settings[key];
  if (
    typeof value !== "string" ||
    value.length > maximumFactLength ||
    unsafeFactUnicode.test(value)
  ) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_SETTINGS_FIELD_INVALID",
      false,
    );
  }
  const text = value.trim();
  if (text.length === 0) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_SETTINGS_FIELD_INVALID",
      false,
    );
  }
  return text;
}

function optionalBoolean(
  settings: Readonly<Record<string, unknown>>,
  key: string,
): boolean | undefined {
  if (!hasOwn(settings, key)) {
    return undefined;
  }
  const value = settings[key];
  if (typeof value !== "boolean") {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_SETTINGS_FIELD_INVALID",
      false,
    );
  }
  return value;
}

function optionalRegulatoryDomain(
  settings: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  if (!hasOwn(settings, key)) {
    return undefined;
  }
  const value = settings[key];
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 65_535
  ) {
    return String(value);
  }
  if (
    typeof value === "string" &&
    value.length <= 128 &&
    safeDomainToken.test(value)
  ) {
    return value;
  }
  throw operationError(
    "PROVIDER_UNSUPPORTED",
    "LOCAL_HTTP_REGULATORY_DOMAIN_INVALID",
    false,
  );
}

function parseSafeSettings(payload: unknown): SafeSettings {
  const root = requiredPlainObject(payload, "LOCAL_HTTP_CONFIG_ROOT_INVALID");
  const settings = requiredPlainObject(
    root.settings,
    "LOCAL_HTTP_SETTINGS_OBJECT_INVALID",
  );
  // `/config` includes write-sensitive state such as UID under `config`. We
  // validate only that the normal-route envelope is present, then deliberately
  // do not traverse, copy or return any member of this object.
  requiredPlainObject(root.config, "LOCAL_HTTP_CONFIG_OBJECT_INVALID");

  const deviceRole = optionalSafeText(settings, "module-type");
  if (deviceRole !== undefined && deviceRole !== "TX" && deviceRole !== "RX") {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_MODULE_TYPE_INVALID",
      false,
    );
  }

  const productName = optionalSafeText(settings, "product_name");
  const target = optionalSafeText(settings, "target");
  const version = optionalSafeText(settings, "version");
  const firmwareCommit = optionalSafeText(settings, "git-commit");
  const radioType = optionalSafeText(settings, "radio-type");
  const hasLowBand = optionalBoolean(settings, "has_low_band");
  const hasHighBand = optionalBoolean(settings, "has_high_band");
  const regulatoryDomainLow = optionalRegulatoryDomain(
    settings,
    "reg_domain_low",
  );
  const regulatoryDomainHigh = optionalRegulatoryDomain(
    settings,
    "reg_domain_high",
  );
  const customHardware = optionalBoolean(settings, "custom_hardware");
  if (
    target === undefined ||
    version === undefined ||
    deviceRole === undefined
  ) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_REQUIRED_IDENTITY_MISSING",
      false,
    );
  }

  return Object.freeze({
    ...(productName === undefined ? {} : { productName }),
    ...(target === undefined ? {} : { target }),
    ...(version === undefined ? {} : { version }),
    ...(firmwareCommit === undefined ? {} : { firmwareCommit }),
    ...(deviceRole === undefined ? {} : { deviceRole }),
    ...(radioType === undefined ? {} : { radioType }),
    ...(hasLowBand === undefined ? {} : { hasLowBand }),
    ...(hasHighBand === undefined ? {} : { hasHighBand }),
    ...(regulatoryDomainLow === undefined ? {} : { regulatoryDomainLow }),
    ...(regulatoryDomainHigh === undefined ? {} : { regulatoryDomainHigh }),
    ...(customHardware === undefined ? {} : { customHardware }),
  });
}

function defaultDeviceId(): string {
  deviceSequence += 1;
  return `local-http-device-${deviceSequence}`;
}

function checkedDeviceId(createDeviceId: () => string): string {
  const id = createDeviceId();
  if (typeof id !== "string" || !safeDeviceId.test(id)) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_DEVICE_ID_INVALID",
      false,
    );
  }
  return id;
}

function checkedObservedAt(now: () => Date): string {
  const timestamp = now();
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_CLOCK_INVALID",
      false,
    );
  }
  return timestamp.toISOString();
}

function evidenceFor(
  input: {
    readonly id: string;
    readonly claim: IdentityClaim;
    readonly value: string;
    readonly strength: "GENERIC" | "SUPPORTING" | "TARGET_SPECIFIC";
  },
  observedAt: string,
): DeviceIdentityEvidence {
  return createIdentityEvidence({
    id: input.id,
    claim: input.claim,
    rawValue: input.value,
    source: {
      kind: evidenceSourceKind,
      instanceId: "local-http-reader",
      trustDomain: "self-reported-runtime-config",
    },
    strength: input.strength,
    reliability: "UNVALIDATED",
    observedAt,
  });
}

function collectEvidence(
  settings: SafeSettings,
  observedAt: string,
): readonly DeviceIdentityEvidence[] {
  const evidence: DeviceIdentityEvidence[] = [];
  const add = (
    id: string,
    claim: IdentityClaim,
    value: string | undefined,
    strength: "GENERIC" | "SUPPORTING" | "TARGET_SPECIFIC" = "SUPPORTING",
  ): void => {
    if (value !== undefined) {
      evidence.push(evidenceFor({ id, claim, value, strength }, observedAt));
    }
  };

  add("settings-product", identityClaims.product, settings.productName);
  add(
    "settings-target",
    identityClaims.target,
    settings.target,
    "TARGET_SPECIFIC",
  );
  add(
    "settings-firmware-version",
    identityClaims.firmwareVersion,
    settings.version,
  );
  add(
    "settings-firmware-commit",
    identityClaims.firmwareCommit,
    settings.firmwareCommit,
  );
  add("settings-device-role", identityClaims.deviceRole, settings.deviceRole);
  add("settings-radio-family", identityClaims.radioFamily, settings.radioType);

  // Do not infer an exclusive band when one half of the upstream pair is
  // absent. Absence is UNKNOWN, never false.
  if (
    settings.hasLowBand !== undefined &&
    settings.hasHighBand !== undefined &&
    (settings.hasLowBand || settings.hasHighBand)
  ) {
    const band = settings.hasLowBand
      ? settings.hasHighBand
        ? "DUAL_BAND"
        : "LOW_BAND"
      : "HIGH_BAND";
    add(
      "settings-frequency-band",
      identityClaims.frequencyBand,
      band,
      "GENERIC",
    );
  }

  add(
    "settings-reg-domain-low",
    identityClaims.regulatoryDomainLow,
    settings.regulatoryDomainLow,
    "GENERIC",
  );
  add(
    "settings-reg-domain-high",
    identityClaims.regulatoryDomainHigh,
    settings.regulatoryDomainHigh,
    "GENERIC",
  );
  add(
    "settings-custom-hardware",
    identityClaims.customHardwarePresent,
    settings.customHardware === undefined
      ? undefined
      : String(settings.customHardware),
    "GENERIC",
  );

  return Object.freeze(evidence);
}

function capability(
  id: string,
  available: boolean,
  sourceEvidenceIds: readonly string[],
): Capability {
  return Object.freeze({
    id,
    available,
    sourceEvidenceIds: Object.freeze([...sourceEvidenceIds]),
    limitations: Object.freeze([
      "SELF_REPORTED",
      "HARDWARE_UNVALIDATED",
      "NO_WRITE_AUTHORITY",
    ]),
  });
}

function collectCapabilities(
  settings: SafeSettings,
  evidence: readonly DeviceIdentityEvidence[],
): readonly Capability[] {
  const capabilities: Capability[] = [
    capability(
      "read-local-http-config",
      true,
      evidence.map((item) => item.id),
    ),
  ];
  const frequencyEvidence = evidence
    .filter((item) => item.claim === identityClaims.frequencyBand)
    .map((item) => item.id);
  const customHardwareEvidence = evidence
    .filter((item) => item.claim === identityClaims.customHardwarePresent)
    .map((item) => item.id);

  if (settings.hasLowBand !== undefined && frequencyEvidence.length > 0) {
    capabilities.push(
      capability("radio-low-band", settings.hasLowBand, frequencyEvidence),
    );
  }
  if (settings.hasHighBand !== undefined && frequencyEvidence.length > 0) {
    capabilities.push(
      capability("radio-high-band", settings.hasHighBand, frequencyEvidence),
    );
  }
  if (settings.customHardware !== undefined) {
    capabilities.push(
      capability(
        "custom-hardware",
        settings.customHardware,
        customHardwareEvidence,
      ),
    );
  }
  return Object.freeze(capabilities);
}

function makeSnapshot(input: {
  readonly settings: SafeSettings;
  readonly observedAt: string;
  readonly deviceId: string;
}): SanitizedDiscoverySnapshot {
  const evidence = collectEvidence(input.settings, input.observedAt);
  const capabilities = collectCapabilities(input.settings, evidence);
  const descriptor: DeviceDescriptor = Object.freeze({
    id: input.deviceId,
    transport: "LOCAL_HTTP",
    connectionState: "CONNECTED",
    ...(input.settings.productName === undefined
      ? {}
      : { displayHint: input.settings.productName }),
  });
  return Object.freeze({ descriptor, evidence, capabilities });
}

function checkedOrigin(value: string): ExpressLrsLocalHttpOrigin {
  const origin = expressLrsLocalHttpOrigins.find((item) => item === value);
  if (origin === undefined) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_ORIGIN_UNSUPPORTED",
      false,
    );
  }
  return origin;
}

function checkedTimeout(value: number | undefined): number {
  const timeout = value ?? defaultTimeoutMs;
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > maximumTimeoutMs
  ) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_TIMEOUT_INVALID",
      false,
    );
  }
  return timeout;
}

function defaultBrowserFetch(): BrowserFetch {
  if (typeof globalThis.fetch !== "function") {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "BROWSER_FETCH_UNAVAILABLE",
      false,
    );
  }
  return globalThis.fetch.bind(globalThis);
}

function trackTransportCleanup(
  transport: TransportSettlementTracker,
  cleanup: () => unknown,
): void {
  try {
    const completion = cleanup();
    if (
      (typeof completion !== "object" && typeof completion !== "function") ||
      completion === null
    ) {
      transport.markCleanupUnproven();
      return;
    }
    // Stream cancellation is specified to return a genuine Promise. Invoke the
    // intrinsic Promise method directly so a hostile thenable cannot change a
    // dynamic `then` getter between validation and assimilation. Discard the
    // fulfillment value as well, avoiding any secondary thenable assimilation.
    const observedCompletion = new Promise<void>((resolve, reject) => {
      Reflect.apply(Promise.prototype.then, completion, [
        () => resolve(),
        (error: unknown) => reject(error),
      ]);
    });
    const cleanupPromise = transport.trackCleanup(observedCompletion);
    void cleanupPromise.catch(() => undefined);
  } catch {
    transport.markCleanupUnproven();
    // Best-effort resource release only. Never replace the stable adapter error
    // with a raw stream implementation error.
  }
}

function cancelReader(
  reader: ResponseReader,
  transport: TransportSettlementTracker,
): void {
  let cancel: unknown;
  try {
    cancel = Reflect.get(reader, "cancel");
  } catch {
    transport.markCleanupUnproven();
    return;
  }
  if (typeof cancel !== "function") {
    transport.markCleanupUnproven();
    return;
  }
  trackTransportCleanup(transport, () => Reflect.apply(cancel, reader, []));
}

function cancelResponseBody(
  response: unknown,
  transport: TransportSettlementTracker,
): void {
  if (typeof response !== "object" || response === null) {
    return;
  }
  let body: unknown;
  try {
    body = Reflect.get(response, "body") as unknown;
    if (body === null || body === undefined) {
      return;
    }
    if (typeof body !== "object" && typeof body !== "function") {
      transport.markCleanupUnproven();
      return;
    }
    const cancel = Reflect.get(body, "cancel") as unknown;
    if (typeof cancel === "function") {
      trackTransportCleanup(transport, () => Reflect.apply(cancel, body, []));
      return;
    }
    const getReader = Reflect.get(body, "getReader") as unknown;
    if (typeof getReader !== "function") {
      transport.markCleanupUnproven();
      return;
    }
    const reader = Reflect.apply(getReader, body, []) as unknown;
    if (typeof reader === "object" && reader !== null) {
      cancelReader(reader as ResponseReader, transport);
      return;
    }
    transport.markCleanupUnproven();
  } catch {
    transport.markCleanupUnproven();
    // The response is hostile runtime input. Abort still runs at the caller;
    // never surface cleanup diagnostics or attacker-controlled values.
  }
}

/** Accept byte-oriented views across browser/test realms without trusting tags. */
function copyByteChunk(value: unknown): Uint8Array | null {
  if (!ArrayBuffer.isView(value)) {
    return null;
  }
  const view = value as ArrayBufferView & { readonly length?: unknown };
  if (
    typeof view.length !== "number" ||
    view.length !== view.byteLength ||
    view.byteOffset < 0
  ) {
    return null;
  }
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
}

class LocalHttpRequestAborted extends Error {}

class TransportSettlementTracker {
  #pending = 0;
  #cleanupUnproven = false;
  #idleWaiters: Array<() => void> = [];

  public track<T>(promise: Promise<T>): Promise<T> {
    this.#pending += 1;
    return promise.finally(() => {
      this.#pending -= 1;
      if (this.#pending === 0) {
        const waiters = this.#idleWaiters;
        this.#idleWaiters = [];
        for (const resolve of waiters) {
          resolve();
        }
      }
    });
  }

  public trackCleanup<T>(promise: Promise<T>): Promise<T> {
    return this.track(
      promise.catch((error: unknown) => {
        this.#cleanupUnproven = true;
        throw error;
      }),
    );
  }

  public markCleanupUnproven(): void {
    this.#cleanupUnproven = true;
  }

  public isIdle(): boolean {
    return this.#pending === 0;
  }

  public isSafeToRelease(): boolean {
    return this.isIdle() && !this.#cleanupUnproven;
  }

  public whenIdle(): Promise<void> {
    if (this.isIdle()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }
}

async function readBoundedBody(
  response: unknown,
  aborted: Promise<never>,
  transport: TransportSettlementTracker,
  onReaderAcquired: () => void,
): Promise<Uint8Array> {
  if (typeof response !== "object" || response === null) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_RESPONSE_INVALID",
      false,
    );
  }
  const candidate = response as {
    readonly status?: unknown;
    readonly redirected?: unknown;
    readonly headers?: unknown;
    readonly body?: unknown;
  };
  if (candidate.status !== 200) {
    throw operationError("CONNECTION_LOST", "LOCAL_HTTP_STATUS_NOT_OK", true);
  }
  if (candidate.redirected !== false) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_REDIRECT_REJECTED",
      false,
    );
  }

  const headers = candidate.headers;
  if (
    typeof headers !== "object" ||
    headers === null ||
    !("get" in headers) ||
    typeof headers.get !== "function"
  ) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_HEADERS_INVALID",
      false,
    );
  }
  const getHeader = headers.get.bind(headers) as (name: string) => unknown;
  const contentType = getHeader("content-type");
  if (
    typeof contentType !== "string" ||
    !jsonContentType.test(contentType.trim())
  ) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_CONTENT_TYPE_INVALID",
      false,
    );
  }
  const contentLength = getHeader("content-length");
  if (contentLength !== null) {
    if (
      typeof contentLength !== "string" ||
      !/^(?:0|[1-9]\d*)$/u.test(contentLength) ||
      !Number.isSafeInteger(Number(contentLength))
    ) {
      throw operationError(
        "PROVIDER_UNSUPPORTED",
        "LOCAL_HTTP_CONTENT_LENGTH_INVALID",
        false,
      );
    }
    if (Number(contentLength) > maximumResponseBytes) {
      throw operationError(
        "PROVIDER_UNSUPPORTED",
        "LOCAL_HTTP_RESPONSE_TOO_LARGE",
        false,
      );
    }
  }

  const body = candidate.body;
  if (
    typeof body !== "object" ||
    body === null ||
    !("getReader" in body) ||
    typeof body.getReader !== "function"
  ) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_BODY_STREAM_REQUIRED",
      false,
    );
  }
  const reader = body.getReader.call(body) as ResponseReader;
  if (
    typeof reader !== "object" ||
    reader === null ||
    typeof reader.read !== "function"
  ) {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_BODY_READER_INVALID",
      false,
    );
  }
  onReaderAcquired();

  const bytes = new Uint8Array(maximumResponseBytes);
  let received = 0;
  let chunkCount = 0;
  let streamCompleted = false;
  try {
    while (true) {
      const pendingRead = transport.track(
        Promise.resolve().then(() => reader.read()),
      );
      const result = await Promise.race([pendingRead, aborted]);
      if (!isPlainObject(result) || typeof result.done !== "boolean") {
        throw operationError(
          "PROVIDER_UNSUPPORTED",
          "LOCAL_HTTP_BODY_CHUNK_INVALID",
          false,
        );
      }
      if (result.done) {
        streamCompleted = true;
        break;
      }
      const chunk = copyByteChunk(result.value);
      if (chunk === null || chunk.byteLength === 0) {
        throw operationError(
          "PROVIDER_UNSUPPORTED",
          "LOCAL_HTTP_BODY_CHUNK_INVALID",
          false,
        );
      }
      chunkCount += 1;
      if (chunkCount > maximumResponseChunks) {
        throw operationError(
          "PROVIDER_UNSUPPORTED",
          "LOCAL_HTTP_BODY_CHUNK_LIMIT_EXCEEDED",
          false,
        );
      }
      received += chunk.byteLength;
      if (received > maximumResponseBytes) {
        throw operationError(
          "PROVIDER_UNSUPPORTED",
          "LOCAL_HTTP_RESPONSE_TOO_LARGE",
          false,
        );
      }
      bytes.set(chunk, received - chunk.byteLength);
    }
  } catch (error: unknown) {
    if (error instanceof LocalHttpRequestAborted) {
      throw error;
    }
    if (error instanceof CoreOperationError) {
      throw error;
    }
    throw operationError(
      "CONNECTION_LOST",
      "LOCAL_HTTP_BODY_READ_FAILED",
      true,
    );
  } finally {
    if (!streamCompleted) {
      cancelReader(reader, transport);
    }
    try {
      reader.releaseLock?.();
    } catch {
      // Resource cleanup must not disclose stream implementation diagnostics.
    }
  }

  return bytes.slice(0, received);
}

function parseJsonBody(bytes: Uint8Array): SafeSettings {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_BODY_ENCODING_INVALID",
      false,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw operationError(
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_JSON_INVALID",
      false,
    );
  }
  return parseSafeSettings(payload);
}

async function fetchSafeSettings(input: {
  readonly origin: ExpressLrsLocalHttpOrigin;
  readonly fetch: BrowserFetch;
  readonly timeoutMs: number;
  readonly signal?: CancellationSignal;
  readonly transport: TransportSettlementTracker;
}): Promise<SafeSettings> {
  assertNotAborted(input.signal);
  const controller = new AbortController();
  let abortKind: "CALLER" | "TIMEOUT" | null = null;
  let requestAbandoned = false;
  const callerSignal = input.signal;
  const onCallerAbort = (): void => {
    if (abortKind === null) {
      abortKind = "CALLER";
      controller.abort();
    }
  };
  if (callerSignal !== undefined && supportsAbortEvents(callerSignal)) {
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timeout = globalThis.setTimeout(() => {
    if (abortKind === null) {
      abortKind = "TIMEOUT";
      controller.abort();
    }
  }, input.timeoutMs);
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        requestAbandoned = true;
        reject(new LocalHttpRequestAborted());
      },
      { once: true },
    );
  });
  let response: unknown;
  let requestCompleted = false;
  let readerAcquired = false;

  try {
    const fetchCompletion = input.transport.track(
      Promise.resolve()
        .then(() =>
          input.fetch(`${input.origin}/config`, {
            method: "GET",
            mode: "cors",
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }),
        )
        .then((candidate) => {
          // Fetch implementations injected by a Host may ignore Abort and
          // resolve later. Take ownership of that late body while the tracked
          // Fetch lifecycle is still pending, so the origin cannot be released
          // before cleanup settles.
          if (requestAbandoned) {
            cancelResponseBody(candidate, input.transport);
          }
          return candidate;
        }),
    );
    response = await Promise.race([fetchCompletion, aborted]);
    assertNotAborted(callerSignal);
    const bytes = await readBoundedBody(
      response,
      aborted,
      input.transport,
      () => {
        readerAcquired = true;
      },
    );
    assertNotAborted(callerSignal);
    const settings = parseJsonBody(bytes);
    assertNotAborted(callerSignal);
    if (abortKind === "TIMEOUT") {
      throw operationError(
        "CONNECTION_LOST",
        "LOCAL_HTTP_REQUEST_TIMEOUT",
        true,
      );
    }
    requestCompleted = true;
    return settings;
  } catch (error: unknown) {
    if (callerSignal?.aborted === true || abortKind === "CALLER") {
      throw abortError();
    }
    if (abortKind === "TIMEOUT") {
      throw operationError(
        "CONNECTION_LOST",
        "LOCAL_HTTP_REQUEST_TIMEOUT",
        true,
      );
    }
    if (error instanceof CoreOperationError) {
      throw error;
    }
    throw operationError("CONNECTION_LOST", "LOCAL_HTTP_REQUEST_FAILED", true);
  } finally {
    if (!requestCompleted) {
      requestAbandoned = true;
      controller.abort();
      if (!readerAcquired) {
        cancelResponseBody(response, input.transport);
      }
    }
    globalThis.clearTimeout(timeout);
    if (callerSignal !== undefined && supportsAbortEvents(callerSignal)) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

interface LocalHttpSettingsAttempt {
  readonly result: Promise<SafeSettings>;
  readonly isTransportSafeToRelease: () => boolean;
  readonly whenTransportSettled: Promise<boolean>;
}

function startFetchSafeSettings(
  input: Omit<Parameters<typeof fetchSafeSettings>[0], "transport">,
): LocalHttpSettingsAttempt {
  const transport = new TransportSettlementTracker();
  const result = fetchSafeSettings({ ...input, transport });
  const releaseState = async (): Promise<boolean> => {
    await transport.whenIdle();
    return transport.isSafeToRelease();
  };
  return Object.freeze({
    result,
    isTransportSafeToRelease: () => transport.isSafeToRelease(),
    whenTransportSettled: result.then(releaseState, releaseState),
  });
}

/**
 * User-triggered, read-only adapter for the normal ExpressLRS 4.1.0
 * `GET /config` route. It never scans, redirects, sends credentials or exposes
 * a generic HTTP/write command. One instance owns one immutable response
 * snapshot; the host creates a new instance for an explicit refresh.
 */
export class ExpressLrsLocalHttpDiscoveryProvider implements DiscoveryProvider {
  public readonly id = providerId;
  readonly #origin: ExpressLrsLocalHttpOrigin;
  readonly #fetch: BrowserFetch;
  readonly #timeoutMs: number;
  readonly #now: () => Date;
  readonly #createDeviceId: () => string;
  #state: "IDLE" | "LOADING" | "READY" = "IDLE";
  #snapshot: SanitizedDiscoverySnapshot | null = null;

  public constructor(options: ExpressLrsLocalHttpDiscoveryProviderOptions) {
    this.#origin = checkedOrigin(options.origin);
    this.#fetch = options.fetch ?? defaultBrowserFetch();
    this.#timeoutMs = checkedTimeout(options.timeoutMs);
    this.#now = options.now ?? (() => new Date());
    this.#createDeviceId = options.createDeviceId ?? defaultDeviceId;
  }

  public async discover(
    signal?: CancellationSignal,
  ): Promise<readonly DeviceDescriptor[]> {
    assertNotAborted(signal);
    if (this.#snapshot !== null) {
      return Object.freeze([this.#snapshot.descriptor]);
    }
    if (this.#state === "LOADING") {
      throw operationError(
        "DEVICE_BUSY",
        "LOCAL_HTTP_DISCOVERY_ALREADY_RUNNING",
        true,
      );
    }
    if (activeOrigins.has(this.#origin)) {
      throw operationError(
        "DEVICE_BUSY",
        "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
        true,
      );
    }

    activeOrigins.add(this.#origin);
    this.#state = "LOADING";
    let attempt: LocalHttpSettingsAttempt | null = null;
    try {
      attempt = startFetchSafeSettings({
        origin: this.#origin,
        fetch: this.#fetch,
        timeoutMs: this.#timeoutMs,
        ...(signal === undefined ? {} : { signal }),
      });
      const settings = await attempt.result;
      assertNotAborted(signal);
      this.#snapshot = makeSnapshot({
        settings,
        observedAt: checkedObservedAt(this.#now),
        deviceId: checkedDeviceId(this.#createDeviceId),
      });
      this.#state = "READY";
      return Object.freeze([this.#snapshot.descriptor]);
    } finally {
      const releaseOrigin = (): void => {
        activeOrigins.delete(this.#origin);
      };
      if (attempt === null || attempt.isTransportSafeToRelease()) {
        releaseOrigin();
      } else {
        // A non-compliant Fetch/stream may ignore Abort. Keep this origin
        // quarantined until its actual transport promise settles so an
        // immediate retry cannot overlap requests to the same device.
        void attempt.whenTransportSettled.then((safeToRelease) => {
          if (safeToRelease) {
            releaseOrigin();
          }
        });
      }
      if (this.#snapshot === null) {
        this.#state = "IDLE";
      }
    }
  }

  public async readIdentity(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly DeviceIdentityEvidence[]> {
    assertNotAborted(signal);
    return this.#snapshotFor(session).evidence;
  }

  public async readCapabilities(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly Capability[]> {
    assertNotAborted(signal);
    return this.#snapshotFor(session).capabilities;
  }

  #snapshotFor(session: DeviceSession): SanitizedDiscoverySnapshot {
    const snapshot = this.#snapshot;
    if (snapshot === null) {
      throw operationError(
        "INVALID_STATE_TRANSITION",
        "LOCAL_HTTP_DISCOVERY_REQUIRED",
        false,
      );
    }
    if (session.deviceId !== snapshot.descriptor.id) {
      throw operationError(
        "DEVICE_NOT_FOUND",
        "LOCAL_HTTP_SESSION_DEVICE_MISMATCH",
        false,
      );
    }
    return snapshot;
  }
}

/**
 * Reviewed policy for one exact provider instance. `/config` is one
 * self-reported trust domain and remains UNVALIDATED, including target facts.
 */
export function createExpressLrsLocalHttpEvidencePolicy(
  provider: ExpressLrsLocalHttpDiscoveryProvider,
): IdentityEvidenceTrustPolicy {
  const policy: IdentityEvidenceTrustPolicy = {
    classify(input) {
      if (
        input.provider !== provider ||
        input.providerId !== providerId ||
        input.reportedSourceKind !== evidenceSourceKind
      ) {
        return null;
      }
      return Object.freeze({
        sourceKind: evidenceSourceKind,
        sourceInstanceId: "local-http-reader",
        trustDomain: "self-reported-runtime-config",
        strength:
          input.claim === identityClaims.target
            ? "TARGET_SPECIFIC"
            : input.claim === identityClaims.regulatoryDomainLow ||
                input.claim === identityClaims.regulatoryDomainHigh ||
                input.claim === identityClaims.customHardwarePresent ||
                input.claim === identityClaims.frequencyBand
              ? "GENERIC"
              : "SUPPORTING",
        reliability: "UNVALIDATED",
      });
    },
  };
  return Object.freeze(policy);
}
