import {
  identityResolutionReasons,
  type DeviceIdentityEvidence,
  type DeviceIdentityResolution,
  type IdentityConflict,
  type TargetCandidate,
} from "@elrs-easy/domain";

function collectConflicts(
  evidence: readonly DeviceIdentityEvidence[],
): readonly IdentityConflict[] {
  const byClaim = new Map<string, DeviceIdentityEvidence[]>();
  for (const item of evidence) {
    if (item.reliability === "UNVALIDATED") {
      continue;
    }
    const existing = byClaim.get(item.claim) ?? [];
    existing.push(item);
    byClaim.set(item.claim, existing);
  }

  const conflicts: IdentityConflict[] = [];
  for (const [claim, items] of byClaim.entries()) {
    const normalizedValues = [
      ...new Set(items.map((item) => item.normalizedValue)),
    ];
    if (normalizedValues.length > 1) {
      conflicts.push(
        Object.freeze({
          claim,
          normalizedValues: Object.freeze(normalizedValues.sort()),
          evidenceIds: Object.freeze(items.map((item) => item.id).sort()),
        }),
      );
    }
  }
  return Object.freeze(conflicts);
}

function frozenResolution(
  resolution: DeviceIdentityResolution,
): DeviceIdentityResolution {
  return Object.freeze({
    ...resolution,
    candidates: Object.freeze([...resolution.candidates]),
    evidence: Object.freeze([...resolution.evidence]),
    conflicts: Object.freeze([...resolution.conflicts]),
    reasons: Object.freeze([...resolution.reasons]),
  });
}

/**
 * Resolves confidence from evidence provenance, not manufacturer/model names.
 * A target can become CONFIRMED only through two independent target-specific
 * trust domains. Catalog matches alone never count as device evidence.
 */
export function resolveDeviceIdentity(input: {
  readonly evidence: readonly DeviceIdentityEvidence[];
  readonly candidates: readonly TargetCandidate[];
}): DeviceIdentityResolution {
  const conflicts = collectConflicts(input.evidence);
  const candidateConflicts = input.candidates.flatMap(
    (candidate) => candidate.conflictingEvidenceIds,
  );

  if (conflicts.length > 0 || candidateConflicts.length > 0) {
    return frozenResolution({
      confidence: "AMBIGUOUS",
      selectedTargetId: null,
      candidates: input.candidates,
      evidence: input.evidence,
      conflicts,
      reasons: [identityResolutionReasons.conflictingTargetEvidence],
    });
  }

  if (input.candidates.length > 1) {
    return frozenResolution({
      confidence: "AMBIGUOUS",
      selectedTargetId: null,
      candidates: input.candidates,
      evidence: input.evidence,
      conflicts,
      reasons: [identityResolutionReasons.multipleTargetCandidates],
    });
  }

  const candidate = input.candidates[0];
  if (candidate === undefined) {
    return frozenResolution({
      confidence: "UNKNOWN",
      selectedTargetId: null,
      candidates: [],
      evidence: input.evidence,
      conflicts,
      reasons: [identityResolutionReasons.noTargetCandidate],
    });
  }

  const matched = new Set(candidate.matchedEvidenceIds);
  const targetSpecificDomains = new Set(
    input.evidence
      .filter(
        (item) =>
          matched.has(item.id) &&
          item.strength === "TARGET_SPECIFIC" &&
          item.reliability !== "UNVALIDATED",
      )
      .map((item) => item.source.trustDomain),
  );

  if (targetSpecificDomains.size >= 2) {
    return frozenResolution({
      confidence: "CONFIRMED",
      selectedTargetId: candidate.targetId,
      candidates: input.candidates,
      evidence: input.evidence,
      conflicts,
      reasons: [identityResolutionReasons.independentTargetEvidence],
    });
  }

  if (targetSpecificDomains.size === 1) {
    return frozenResolution({
      confidence: "HIGH_CONFIDENCE",
      selectedTargetId: candidate.targetId,
      candidates: input.candidates,
      evidence: input.evidence,
      conflicts,
      reasons: [identityResolutionReasons.oneTargetSpecificTrustDomain],
    });
  }

  return frozenResolution({
    confidence: "UNKNOWN",
    selectedTargetId: null,
    candidates: input.candidates,
    evidence: input.evidence,
    conflicts,
    reasons: [identityResolutionReasons.genericEvidenceOnly],
  });
}
