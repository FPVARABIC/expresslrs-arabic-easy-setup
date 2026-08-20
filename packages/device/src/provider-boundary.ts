import {
  CoreOperationError,
  connectionStates,
  createIdentityEvidence,
  evidenceReliabilities,
  evidenceStrengths,
  identityClaims,
  normalizeIdentityValue,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityEvidence,
  type EvidenceReliability,
  type EvidenceStrength,
  type IdentityClaim,
} from "@elrs-easy/domain";

import type { DiscoveryProvider } from "./contracts.js";

const maximumDescriptors = 64;
const maximumEvidenceItems = 128;
const maximumCapabilities = 128;
const maximumTextLength = 256;
const canonicalUtcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const safeMachineToken = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
// Cc rejects control bytes; Cf includes all bidi overrides/isolates and other
// invisible formatting characters. Neither belongs in a machine fact.
const unsafeUnicode = /[\p{Cc}\p{Cf}]/u;

const allowedIdentityClaims = new Set<string>(Object.values(identityClaims));

export interface IdentityEvidenceTrust {
  /** Core-owned public source name; never copied from a hardware identifier. */
  readonly sourceKind: string;
  /** Core-owned, privacy-safe reader identifier. */
  readonly sourceInstanceId: string;
  /** Core-owned independence boundary used by the identity resolver. */
  readonly trustDomain: string;
  readonly strength: EvidenceStrength;
  readonly reliability: EvidenceReliability;
}

export interface IdentityEvidenceTrustPolicy {
  /**
   * The policy is a trusted integration collaborator. Provider-supplied
   * strength, reliability, normalizedValue and trustDomain are never used.
   * Returning null keeps the fact visible but explicitly untrusted.
   */
  classify(input: {
    readonly provider: DiscoveryProvider;
    readonly providerId: string;
    readonly claim: IdentityClaim;
    readonly reportedSourceKind: string;
  }): IdentityEvidenceTrust | null;
}

/** Safe default for a provider that has not received an integration review. */
export const untrustedIdentityEvidencePolicy: IdentityEvidenceTrustPolicy =
  Object.freeze({
    classify: () => null,
  });

function fail(
  code:
    | "CONNECTION_LOST"
    | "IDENTITY_AMBIGUOUS"
    | "IDENTITY_UNKNOWN"
    | "PROVIDER_UNSUPPORTED",
  reason: string,
): never {
  throw new CoreOperationError({
    code,
    reason,
    details: {},
    retryable: false,
  });
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("PROVIDER_UNSUPPORTED", "DISCOVERY_PROVIDER_VALUE_INVALID");
  }
  return value as Readonly<Record<string, unknown>>;
}

function plainText(value: unknown, reason: string): string {
  if (typeof value !== "string") {
    fail("PROVIDER_UNSUPPORTED", reason);
  }
  if (value.length > maximumTextLength || unsafeUnicode.test(value)) {
    fail("PROVIDER_UNSUPPORTED", reason);
  }
  const text = value.trim();
  if (text.length === 0) {
    fail("PROVIDER_UNSUPPORTED", reason);
  }
  return text;
}

function machineToken(value: unknown, reason: string): string {
  const token = plainText(value, reason);
  if (!safeMachineToken.test(token)) {
    fail("PROVIDER_UNSUPPORTED", reason);
  }
  return token;
}

function identityText(value: unknown, reason: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumTextLength ||
    unsafeUnicode.test(value)
  ) {
    fail("IDENTITY_UNKNOWN", reason);
  }
  // Preserve the exact observed value. Comparisons use a separate Core-owned
  // normalization; legitimate allowlisted target/product values may contain
  // words such as WiFi and must not be classified by substring.
  return value;
}

function stringArray(value: unknown, reason: string): readonly string[] {
  if (!Array.isArray(value) || value.length > maximumEvidenceItems) {
    fail("PROVIDER_UNSUPPORTED", reason);
  }
  return Object.freeze(value.map((item) => plainText(item, reason)));
}

export function rebuildProviderId(value: unknown): string {
  return machineToken(value, "DISCOVERY_PROVIDER_ID_INVALID");
}

/** Rebuilds descriptors and rejects ambiguous or non-connected discoveries. */
export function rebuildDiscoveryDescriptors(
  value: unknown,
): readonly DeviceDescriptor[] {
  if (!Array.isArray(value) || value.length > maximumDescriptors) {
    fail("PROVIDER_UNSUPPORTED", "DISCOVERY_DESCRIPTOR_LIST_INVALID");
  }

  const ids = new Set<string>();
  const descriptors = value.map((item) => {
    const raw = record(item);
    const id = machineToken(raw.id, "DISCOVERY_DESCRIPTOR_ID_INVALID");
    if (ids.has(id)) {
      fail("IDENTITY_AMBIGUOUS", "DUPLICATE_DEVICE_DESCRIPTOR_ID");
    }
    ids.add(id);

    const transport = machineToken(
      raw.transport,
      "DISCOVERY_DESCRIPTOR_TRANSPORT_INVALID",
    );
    const connectionState = raw.connectionState;
    if (
      typeof connectionState !== "string" ||
      !connectionStates.includes(
        connectionState as (typeof connectionStates)[number],
      )
    ) {
      fail("CONNECTION_LOST", "DISCOVERY_CONNECTION_STATE_INVALID");
    }
    if (connectionState !== "CONNECTED") {
      fail("CONNECTION_LOST", "DISCOVERED_DEVICE_NOT_CONNECTED");
    }

    let displayHint: string | undefined;
    if (raw.displayHint !== undefined) {
      displayHint = identityText(
        raw.displayHint,
        "DISCOVERY_DISPLAY_HINT_INVALID",
      );
    }
    return Object.freeze({
      id,
      transport,
      connectionState: "CONNECTED" as const,
      ...(displayHint === undefined ? {} : { displayHint }),
    });
  });

  return Object.freeze(descriptors);
}

export interface RebuiltIdentityEvidence {
  readonly evidence: readonly DeviceIdentityEvidence[];
  /** Internal-only mapping used to rebuild capability provenance. */
  readonly safeIdByReportedId: ReadonlyMap<string, string>;
}

function untrustedClassification(): IdentityEvidenceTrust {
  return {
    sourceKind: "untrusted-provider",
    sourceInstanceId: "untrusted-reader",
    trustDomain: "untrusted-provider",
    strength: "GENERIC",
    reliability: "UNVALIDATED",
  };
}

function validateClassification(
  value: IdentityEvidenceTrust,
): IdentityEvidenceTrust {
  const sourceKind = machineToken(
    value.sourceKind,
    "IDENTITY_POLICY_SOURCE_KIND_INVALID",
  );
  const sourceInstanceId = machineToken(
    value.sourceInstanceId,
    "IDENTITY_POLICY_SOURCE_INSTANCE_INVALID",
  );
  const trustDomain = machineToken(
    value.trustDomain,
    "IDENTITY_POLICY_TRUST_DOMAIN_INVALID",
  );
  if (!evidenceStrengths.includes(value.strength)) {
    fail("IDENTITY_UNKNOWN", "IDENTITY_POLICY_STRENGTH_INVALID");
  }
  if (!evidenceReliabilities.includes(value.reliability)) {
    fail("IDENTITY_UNKNOWN", "IDENTITY_POLICY_RELIABILITY_INVALID");
  }
  return {
    sourceKind,
    sourceInstanceId,
    trustDomain,
    strength: value.strength,
    reliability: value.reliability,
  };
}

/**
 * Copies provider facts into Core-owned immutable values. Provider-reported
 * normalization and trust metadata are ignored by construction.
 */
export function rebuildDiscoveryEvidence(input: {
  readonly value: unknown;
  readonly provider: DiscoveryProvider;
  readonly providerId: string;
  readonly policy?: IdentityEvidenceTrustPolicy;
}): RebuiltIdentityEvidence {
  if (
    !Array.isArray(input.value) ||
    input.value.length > maximumEvidenceItems
  ) {
    fail("IDENTITY_UNKNOWN", "IDENTITY_EVIDENCE_LIST_INVALID");
  }

  const policy = input.policy ?? untrustedIdentityEvidencePolicy;
  const safeIdByReportedId = new Map<string, string>();
  const evidence = input.value.map((item, index) => {
    const raw = record(item);
    const reportedId = machineToken(raw.id, "IDENTITY_EVIDENCE_ID_INVALID");
    if (safeIdByReportedId.has(reportedId)) {
      fail("IDENTITY_AMBIGUOUS", "DUPLICATE_EVIDENCE_IDS");
    }
    const safeId = `evidence-${index + 1}`;
    safeIdByReportedId.set(reportedId, safeId);

    const claim = plainText(raw.claim, "IDENTITY_EVIDENCE_CLAIM_INVALID");
    if (!allowedIdentityClaims.has(claim)) {
      fail("IDENTITY_UNKNOWN", "IDENTITY_CLAIM_NOT_ALLOWLISTED");
    }
    const rawValue = identityText(
      raw.rawValue,
      "IDENTITY_EVIDENCE_VALUE_INVALID",
    );
    const normalizedValue = normalizeIdentityValue(rawValue);
    if (
      normalizedValue.length === 0 ||
      normalizedValue.length > maximumTextLength ||
      unsafeUnicode.test(normalizedValue)
    ) {
      fail("IDENTITY_UNKNOWN", "IDENTITY_NORMALIZED_VALUE_INVALID");
    }
    if (
      claim === identityClaims.customHardwarePresent &&
      normalizedValue !== "true" &&
      normalizedValue !== "false"
    ) {
      fail("IDENTITY_UNKNOWN", "CUSTOM_HARDWARE_PRESENCE_VALUE_INVALID");
    }

    const rawSource = record(raw.source);
    const reportedSourceKind = machineToken(
      rawSource.kind,
      "IDENTITY_EVIDENCE_SOURCE_KIND_INVALID",
    );
    const observedAt = plainText(
      raw.observedAt,
      "IDENTITY_EVIDENCE_TIMESTAMP_INVALID",
    );
    if (
      !canonicalUtcTimestamp.test(observedAt) ||
      Number.isNaN(Date.parse(observedAt))
    ) {
      fail("IDENTITY_UNKNOWN", "IDENTITY_EVIDENCE_TIMESTAMP_INVALID");
    }

    const classified = policy.classify({
      provider: input.provider,
      providerId: input.providerId,
      claim,
      reportedSourceKind,
    });
    const trust = validateClassification(
      classified ?? untrustedClassification(),
    );
    if (
      trust.strength === "TARGET_SPECIFIC" &&
      claim !== identityClaims.target
    ) {
      fail("IDENTITY_UNKNOWN", "TARGET_SPECIFIC_POLICY_CLAIM_INVALID");
    }

    return createIdentityEvidence({
      id: safeId,
      claim,
      rawValue,
      source: {
        kind: trust.sourceKind,
        instanceId: trust.sourceInstanceId,
        trustDomain: trust.trustDomain,
      },
      strength: trust.strength,
      reliability: trust.reliability,
      observedAt,
      // Explicitly normalize inside Core. raw.normalizedValue is never read.
      normalize: normalizeIdentityValue,
    });
  });

  return Object.freeze({
    evidence: Object.freeze(evidence),
    safeIdByReportedId,
  });
}

/** Rebuilds capabilities and preserves provenance only through remapped ids. */
export function rebuildDiscoveryCapabilities(input: {
  readonly value: unknown;
  readonly safeIdByReportedId: ReadonlyMap<string, string>;
}): readonly Capability[] {
  if (!Array.isArray(input.value) || input.value.length > maximumCapabilities) {
    fail("PROVIDER_UNSUPPORTED", "DEVICE_CAPABILITY_LIST_INVALID");
  }

  const capabilityIds = new Set<string>();
  const capabilities = input.value.map((item) => {
    const raw = record(item);
    const id = machineToken(raw.id, "DEVICE_CAPABILITY_ID_INVALID");
    if (capabilityIds.has(id)) {
      fail("PROVIDER_UNSUPPORTED", "DUPLICATE_DEVICE_CAPABILITY_ID");
    }
    capabilityIds.add(id);
    if (typeof raw.available !== "boolean") {
      fail("PROVIDER_UNSUPPORTED", "DEVICE_CAPABILITY_AVAILABILITY_INVALID");
    }

    const reportedEvidenceIds = stringArray(
      raw.sourceEvidenceIds,
      "DEVICE_CAPABILITY_EVIDENCE_IDS_INVALID",
    );
    if (reportedEvidenceIds.length === 0) {
      fail(
        "PROVIDER_UNSUPPORTED",
        "DEVICE_CAPABILITY_EVIDENCE_REFERENCE_INVALID",
      );
    }
    const safeEvidenceIds: string[] = [];
    const seenEvidenceIds = new Set<string>();
    for (const reportedId of reportedEvidenceIds) {
      const safeId = input.safeIdByReportedId.get(reportedId);
      if (safeId === undefined || seenEvidenceIds.has(safeId)) {
        fail(
          "PROVIDER_UNSUPPORTED",
          "DEVICE_CAPABILITY_EVIDENCE_REFERENCE_INVALID",
        );
      }
      seenEvidenceIds.add(safeId);
      safeEvidenceIds.push(safeId);
    }

    if (
      !Array.isArray(raw.limitations) ||
      raw.limitations.length > maximumCapabilities
    ) {
      fail("PROVIDER_UNSUPPORTED", "DEVICE_CAPABILITY_LIMITATIONS_INVALID");
    }
    const limitations = Object.freeze(
      raw.limitations.map((limitation) =>
        machineToken(limitation, "DEVICE_CAPABILITY_LIMITATIONS_INVALID"),
      ),
    );
    return Object.freeze({
      id,
      available: raw.available,
      sourceEvidenceIds: Object.freeze(safeEvidenceIds),
      limitations: Object.freeze([...limitations]),
    });
  });

  return Object.freeze(capabilities);
}
