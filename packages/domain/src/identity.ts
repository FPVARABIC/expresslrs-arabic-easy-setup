export const identityClaims = {
  target: "target",
  product: "product",
  deviceRole: "device-role",
  frequencyBand: "frequency-band",
  radioFamily: "radio-family",
  mcuFamily: "mcu-family",
  firmwareVersion: "firmware-version",
  firmwareCommit: "firmware-commit",
} as const;

export type KnownIdentityClaim =
  (typeof identityClaims)[keyof typeof identityClaims];

/**
 * Identity claims are deliberately open-ended. Platform adapters may add a
 * claim without changing the core or introducing a model-specific branch.
 */
export type IdentityClaim = KnownIdentityClaim | (string & {});

export const detectionConfidences = [
  "CONFIRMED",
  "HIGH_CONFIDENCE",
  "AMBIGUOUS",
  "UNKNOWN",
] as const;

export type DetectionConfidence = (typeof detectionConfidences)[number];

export const evidenceStrengths = [
  "GENERIC",
  "SUPPORTING",
  "TARGET_SPECIFIC",
] as const;

export type EvidenceStrength = (typeof evidenceStrengths)[number];

export const evidenceReliabilities = [
  "UNVALIDATED",
  "OBSERVED",
  "VALIDATED",
] as const;

export type EvidenceReliability = (typeof evidenceReliabilities)[number];

export interface IdentityEvidenceSource {
  /** Stable machine identifier such as `device-http-config`. */
  readonly kind: string;
  /** Distinguishes two physical/logical readers of the same kind. */
  readonly instanceId: string;
  /**
   * Signals sharing a trust domain are not counted as independent proof.
   * For example, two fields returned by one firmware endpoint share a domain.
   */
  readonly trustDomain: string;
}

export interface DeviceIdentityEvidence {
  readonly id: string;
  readonly claim: IdentityClaim;
  /** Exact value received from the evidence source. */
  readonly rawValue: string;
  /** Value used for deterministic comparisons; rawValue is never discarded. */
  readonly normalizedValue: string;
  readonly source: IdentityEvidenceSource;
  readonly strength: EvidenceStrength;
  readonly reliability: EvidenceReliability;
  readonly observedAt: string;
}

export interface CreateIdentityEvidenceInput {
  readonly id: string;
  readonly claim: IdentityClaim;
  readonly rawValue: string;
  readonly source: IdentityEvidenceSource;
  readonly strength: EvidenceStrength;
  readonly reliability?: EvidenceReliability;
  readonly observedAt: string;
  readonly normalize?: (value: string) => string;
}

export function normalizeIdentityValue(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function createIdentityEvidence(
  input: CreateIdentityEvidenceInput,
): DeviceIdentityEvidence {
  if (input.id.trim().length === 0) {
    throw new TypeError("Identity evidence id must not be empty");
  }
  if (input.claim.trim().length === 0) {
    throw new TypeError("Identity evidence claim must not be empty");
  }
  if (input.rawValue.trim().length === 0) {
    throw new TypeError("Identity evidence value must not be empty");
  }
  if (input.source.kind.trim().length === 0) {
    throw new TypeError("Identity evidence source kind must not be empty");
  }
  if (input.source.instanceId.trim().length === 0) {
    throw new TypeError("Identity evidence source instance must not be empty");
  }
  if (input.source.trustDomain.trim().length === 0) {
    throw new TypeError("Identity evidence trust domain must not be empty");
  }

  const normalize = input.normalize ?? normalizeIdentityValue;
  const normalizedValue = normalize(input.rawValue);
  if (normalizedValue.length === 0) {
    throw new TypeError("Normalized identity evidence must not be empty");
  }

  return Object.freeze({
    id: input.id,
    claim: input.claim,
    rawValue: input.rawValue,
    normalizedValue,
    source: Object.freeze({ ...input.source }),
    strength: input.strength,
    reliability: input.reliability ?? "OBSERVED",
    observedAt: input.observedAt,
  });
}

export interface IdentityConflict {
  readonly claim: IdentityClaim;
  readonly normalizedValues: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface TargetCandidate {
  readonly targetId: string;
  readonly displayName: string;
  readonly matchedEvidenceIds: readonly string[];
  readonly conflictingEvidenceIds: readonly string[];
}

export const identityResolutionReasons = {
  noTargetCandidate: "NO_TARGET_CANDIDATE",
  multipleTargetCandidates: "MULTIPLE_TARGET_CANDIDATES",
  conflictingTargetEvidence: "CONFLICTING_TARGET_EVIDENCE",
  duplicateEvidenceIds: "DUPLICATE_EVIDENCE_IDS",
  genericEvidenceOnly: "GENERIC_EVIDENCE_ONLY",
  oneTargetSpecificTrustDomain: "ONE_TARGET_SPECIFIC_TRUST_DOMAIN",
  independentTargetEvidence: "INDEPENDENT_TARGET_EVIDENCE",
} as const;

export type IdentityResolutionReason =
  (typeof identityResolutionReasons)[keyof typeof identityResolutionReasons];

export interface DeviceIdentityResolution {
  readonly confidence: DetectionConfidence;
  readonly selectedTargetId: string | null;
  readonly candidates: readonly TargetCandidate[];
  readonly evidence: readonly DeviceIdentityEvidence[];
  readonly conflicts: readonly IdentityConflict[];
  readonly reasons: readonly IdentityResolutionReason[];
}
