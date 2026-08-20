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

const allowedAuditDetailFieldSet: ReadonlySet<string> = new Set(
  allowedAuditDetailFields,
);

export interface ScrubbedAuditDetails {
  readonly details: AuditDetails;
  readonly redactedFields: readonly string[];
  readonly excludedFields: readonly string[];
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
  readonly redactedFields: readonly string[];
  readonly excludedFields: readonly string[];
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

function compareFields(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
  const redactedFields: string[] = [];
  const excludedFields: string[] = [];

  for (const [field, value] of Object.entries(details).sort(([left], [right]) =>
    compareFields(left, right),
  )) {
    if (isSensitiveAuditField(field)) {
      redactedFields.push(field);
      continue;
    }
    if (!allowedAuditDetailFieldSet.has(field) || !isAuditDetailValue(value)) {
      excludedFields.push(field);
      continue;
    }
    if (!isSafeAuditDetailValue(field, value)) {
      redactedFields.push(field);
      continue;
    }
    safeDetails[field] = value;
  }

  return Object.freeze({
    details: Object.freeze(safeDetails),
    redactedFields: Object.freeze(redactedFields),
    excludedFields: Object.freeze(excludedFields),
  });
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._:+-]{0,159}$/iu.test(normalized)) {
    throw new TypeError(`${label} must be a safe opaque identifier`);
  }
  return normalized;
}

function requireTimestamp(value: string): string {
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

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
    throw new TypeError("Audit event sequence must be a non-negative integer");
  }
  const scrubbed = scrubAuditDetails(input.details ?? {});

  return Object.freeze({
    schemaVersion: "1",
    id: requireIdentifier(input.id, "Audit event id"),
    operationId: requireIdentifier(input.operationId, "Audit operation id"),
    sequence: input.sequence,
    occurredAt: requireTimestamp(input.occurredAt),
    operationType: requireIdentifier(
      input.operationType,
      "Audit operation type",
    ),
    stage: requireIdentifier(input.stage, "Audit stage"),
    eventCode: requireIdentifier(input.eventCode, "Audit event code"),
    outcome: requireEnumValue(input.outcome, auditOutcomes, "Audit outcome"),
    severity: requireEnumValue(
      input.severity,
      auditSeverities,
      "Audit severity",
    ),
    ...(input.providerId === undefined
      ? {}
      : {
          providerId: requireIdentifier(input.providerId, "Audit provider id"),
        }),
    safeDetails: scrubbed.details,
    redactedFields: scrubbed.redactedFields,
    excludedFields: scrubbed.excludedFields,
  });
}
