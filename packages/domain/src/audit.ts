export const auditSeverities = ["INFO", "WARNING", "ERROR"] as const;
export type AuditSeverity = (typeof auditSeverities)[number];

export const auditOutcomes = [
  "STARTED",
  "PROGRESSED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
] as const;
export type AuditOutcome = (typeof auditOutcomes)[number];

export type AuditDetailValue = string | number | boolean;
export type AuditDetails = Readonly<Record<string, AuditDetailValue>>;

export const auditRedactionCategories = Object.freeze([
  "SENSITIVE_FIELD",
  "UNREVIEWED_FIELD",
  "UNSAFE_VALUE",
  "INPUT_UNREADABLE",
] as const);
export type AuditRedactionCategory = (typeof auditRedactionCategories)[number];

export const allowedAuditDetailFields = [
  "appVersion",
  "artifactSha256",
  "bytesWritten",
  "capabilityId",
  "catalogRevision",
  "confidence",
  "coreVersion",
  "errorCode",
  "expectedTargetId",
  "expectedVersion",
  "observedTargetId",
  "observedVersion",
  "providerId",
  "retryable",
  "targetId",
  "totalBytes",
  "upstreamCommitSha",
  "upstreamVersion",
  "validationLevel",
] as const;

export type AllowedAuditDetailField = (typeof allowedAuditDetailFields)[number];

const knownSensitiveAuditFields = Object.freeze([
  "accessToken",
  "apiKey",
  "binding-identity",
  "binding_phrase",
  "bindingIdentity",
  "bindingPhrase",
  "credential",
  "credentials",
  "deviceSerial",
  "deviceUID",
  "hardware_serial_identifier",
  "hardwareSerial",
  "mac",
  "macAddress",
  "passwd",
  "passphrase",
  "password",
  "privateKey",
  "refresh-token",
  "secret",
  "serial",
  "serialNumber",
  "token",
  "tokens",
  "uid",
  "wifi_passphrase",
  "wifiKey",
  "wifiPassword",
  "wifiPsk",
] as const);

export interface ScrubbedAuditDetails {
  readonly details: AuditDetails;
  readonly redactedFieldCount: number;
  readonly excludedFieldCount: number;
  readonly redactionCategories: readonly AuditRedactionCategory[];
}

export interface AuditEvent {
  readonly schemaVersion: "1";
  readonly id: string;
  readonly operationId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly operationType: string;
  readonly stage: string;
  /** Stable, non-localized identifier such as `DEVICE_IDENTIFIED`. */
  readonly eventCode: string;
  readonly outcome: AuditOutcome;
  readonly severity: AuditSeverity;
  readonly providerId?: string;
  readonly safeDetails: AuditDetails;
  readonly redactedFieldCount: number;
  readonly excludedFieldCount: number;
  readonly redactionCategories: readonly AuditRedactionCategory[];
}

export interface CreateAuditEventInput {
  readonly id: string;
  readonly operationId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly operationType: string;
  readonly stage: string;
  readonly eventCode: string;
  readonly outcome: AuditOutcome;
  readonly severity: AuditSeverity;
  readonly providerId?: string;
  /** Raw adapter details are copied through a strict allowlist. */
  readonly details?: Readonly<Record<string, unknown>>;
}

function readOwnDataProperty(value: unknown, key: PropertyKey): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function fieldTokens(field: string): readonly string[] {
  return field
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
}

/** Identifies known secret or stable hardware-identifier field names. */
export function isSensitiveAuditField(field: string): boolean {
  if (field.length > 256) {
    return true;
  }
  const tokens = fieldTokens(field);
  const tokenSet = new Set(tokens);

  if (
    tokenSet.has("password") ||
    tokenSet.has("passwd") ||
    tokenSet.has("passphrase") ||
    tokenSet.has("secret") ||
    tokenSet.has("credential") ||
    tokenSet.has("credentials") ||
    tokenSet.has("token") ||
    tokenSet.has("tokens") ||
    tokenSet.has("uid") ||
    tokenSet.has("mac")
  ) {
    return true;
  }

  if (
    tokenSet.has("binding") &&
    (tokenSet.has("phrase") || tokenSet.has("identity"))
  ) {
    return true;
  }

  if (
    (tokenSet.has("wifi") && (tokenSet.has("psk") || tokenSet.has("key"))) ||
    (tokenSet.has("api") && tokenSet.has("key")) ||
    (tokenSet.has("private") && tokenSet.has("key"))
  ) {
    return true;
  }

  if (!tokenSet.has("serial")) {
    return false;
  }

  return (
    tokens.length === 1 ||
    tokenSet.has("device") ||
    tokenSet.has("hardware") ||
    tokenSet.has("number") ||
    tokenSet.has("identifier") ||
    tokenSet.has("id")
  );
}

function isAuditDetailValue(value: unknown): value is AuditDetailValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

const digestFields: ReadonlySet<string> = new Set([
  "artifactSha256",
  "upstreamCommitSha",
]);

/**
 * Detail values cross a support/export boundary, so an allowlisted key alone
 * is not sufficient. Keep identifiers deliberately narrow and reject values
 * that look like URLs, credentials, markup, or opaque adapter payloads.
 */
function isSafeAuditDetailValue(
  field: string,
  value: AuditDetailValue,
): boolean {
  if (typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0;
  }

  if (digestFields.has(field)) {
    return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(value);
  }

  return (
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-z0-9][a-z0-9._+:-]*$/iu.test(value) &&
    !value.includes("://") &&
    !value.includes("@")
  );
}

/**
 * Builds a fresh safe object. Unknown fields and non-primitive payloads are
 * excluded by default; known secrets are never copied, even in redacted form.
 */
export function scrubAuditDetails(
  details: Readonly<Record<string, unknown>>,
): ScrubbedAuditDetails {
  const safeDetails: Record<string, AuditDetailValue> = {};
  const categories = new Set<AuditRedactionCategory>();
  let redactedFieldCount = 0;
  let excludedFieldCount = 0;
  const increment = (value: number, amount = 1): number =>
    Math.min(999, value + amount);

  // Never enumerate provider-owned input. Pull only a fixed set of reviewed
  // keys through own data descriptors, so unknown-key floods and accessors
  // cannot trigger unbounded work or displace an allowlisted field.
  for (const field of knownSensitiveAuditFields) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(details, field);
    } catch {
      excludedFieldCount = increment(excludedFieldCount);
      categories.add("INPUT_UNREADABLE");
      continue;
    }
    if (descriptor === undefined) {
      continue;
    }
    redactedFieldCount = increment(redactedFieldCount);
    categories.add("SENSITIVE_FIELD");
  }

  for (const field of allowedAuditDetailFields) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(details, field);
    } catch {
      excludedFieldCount = increment(excludedFieldCount);
      categories.add("INPUT_UNREADABLE");
      continue;
    }
    if (descriptor === undefined) {
      continue;
    }
    if (!("value" in descriptor) || !isAuditDetailValue(descriptor.value)) {
      excludedFieldCount = increment(excludedFieldCount);
      categories.add("UNREVIEWED_FIELD");
      continue;
    }
    if (!isSafeAuditDetailValue(field, descriptor.value)) {
      redactedFieldCount = increment(redactedFieldCount);
      categories.add("UNSAFE_VALUE");
      continue;
    }
    safeDetails[field] = descriptor.value;
  }

  return Object.freeze({
    details: Object.freeze(safeDetails),
    redactedFieldCount,
    excludedFieldCount,
    redactionCategories: Object.freeze(
      auditRedactionCategories.filter((category) => categories.has(category)),
    ),
  });
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a safe opaque identifier`);
  }
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._:+-]{0,159}$/iu.test(normalized)) {
    throw new TypeError(`${label} must be a safe opaque identifier`);
  }
  return normalized;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError(
      "Audit event timestamp must be a canonical UTC ISO timestamp",
    );
  }
  const normalized = value.trim();
  const parsed = new Date(normalized);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(normalized) ||
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString() !== normalized
  ) {
    throw new TypeError(
      "Audit event timestamp must be a canonical UTC ISO timestamp",
    );
  }
  return normalized;
}

function requireEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(`${label} is not recognized`);
  }
  return value as T;
}

export function createAuditEvent(
  input: CreateAuditEventInput | unknown,
): AuditEvent {
  const sequence = readOwnDataProperty(input, "sequence");
  if (!Number.isSafeInteger(sequence) || (sequence as number) < 0) {
    throw new TypeError("Audit event sequence must be a non-negative integer");
  }
  const rawDetails = readOwnDataProperty(input, "details");
  const details =
    rawDetails === undefined
      ? {}
      : rawDetails !== null &&
          typeof rawDetails === "object" &&
          !Array.isArray(rawDetails)
        ? (rawDetails as Readonly<Record<string, unknown>>)
        : {};
  const scrubbed = scrubAuditDetails(details);
  const providerId = readOwnDataProperty(input, "providerId");

  return Object.freeze({
    schemaVersion: "1",
    id: requireIdentifier(readOwnDataProperty(input, "id"), "Audit event id"),
    operationId: requireIdentifier(
      readOwnDataProperty(input, "operationId"),
      "Audit operation id",
    ),
    sequence: sequence as number,
    occurredAt: requireTimestamp(readOwnDataProperty(input, "occurredAt")),
    operationType: requireIdentifier(
      readOwnDataProperty(input, "operationType"),
      "Audit operation type",
    ),
    stage: requireIdentifier(
      readOwnDataProperty(input, "stage"),
      "Audit stage",
    ),
    eventCode: requireIdentifier(
      readOwnDataProperty(input, "eventCode"),
      "Audit event code",
    ),
    outcome: requireEnumValue(
      readOwnDataProperty(input, "outcome"),
      auditOutcomes,
      "Audit outcome",
    ),
    severity: requireEnumValue(
      readOwnDataProperty(input, "severity"),
      auditSeverities,
      "Audit severity",
    ),
    ...(providerId === undefined
      ? {}
      : { providerId: requireIdentifier(providerId, "Audit provider id") }),
    safeDetails: scrubbed.details,
    redactedFieldCount: scrubbed.redactedFieldCount,
    excludedFieldCount: scrubbed.excludedFieldCount,
    redactionCategories: scrubbed.redactionCategories,
  });
}
