import {
  identityClaims,
  normalizeIdentityValue,
  type DeviceIdentityEvidence,
  type TargetCandidate,
} from "@elrs-easy/domain";

export interface TargetCatalogMetadata {
  readonly source: string;
  readonly revision: string;
  readonly schemaVersion: string;
  readonly contentDigest: string;
  /** True only after the material is explicitly licensed for this use. */
  readonly redistributionApproved: boolean;
}

export interface TargetDefinition {
  readonly targetId: string;
  readonly displayName: string;
  /** Claim/value pairs form a data-driven fingerprint, never model branches. */
  readonly identity: Readonly<Record<string, readonly string[]>>;
  readonly capabilities: readonly string[];
  readonly updateProviders: readonly string[];
  readonly supportedFirmwareMajors: readonly number[];
}

export interface TargetCatalog {
  readonly metadata: TargetCatalogMetadata;
  get(targetId: string): TargetDefinition | null;
  match(evidence: readonly DeviceIdentityEvidence[]): readonly TargetCandidate[];
}

function normalizedIdentity(
  definition: TargetDefinition,
): ReadonlyMap<string, ReadonlySet<string>> {
  const entries = Object.entries(definition.identity).map(
    ([claim, values]) => [
      claim,
      new Set(values.map((value) => normalizeIdentityValue(value))),
    ] as const,
  );
  entries.push([
    identityClaims.target,
    new Set([normalizeIdentityValue(definition.targetId)]),
  ]);
  return new Map(entries);
}

/**
 * Foundation-only catalog implementation. It accepts injected data so real
 * target facts can later come from a pinned, license-approved adapter.
 */
export class InMemoryTargetCatalog implements TargetCatalog {
  public readonly metadata: TargetCatalogMetadata;
  readonly #definitions: ReadonlyMap<string, TargetDefinition>;

  public constructor(
    metadata: TargetCatalogMetadata,
    definitions: readonly TargetDefinition[],
  ) {
    const byId = new Map<string, TargetDefinition>();
    for (const definition of definitions) {
      const key = normalizeIdentityValue(definition.targetId);
      if (byId.has(key)) {
        throw new TypeError(`Duplicate target id: ${definition.targetId}`);
      }
      byId.set(key, Object.freeze({ ...definition }));
    }
    this.metadata = Object.freeze({ ...metadata });
    this.#definitions = byId;
  }

  public get(targetId: string): TargetDefinition | null {
    return this.#definitions.get(normalizeIdentityValue(targetId)) ?? null;
  }

  public match(
    evidence: readonly DeviceIdentityEvidence[],
  ): readonly TargetCandidate[] {
    const candidates: TargetCandidate[] = [];

    for (const definition of this.#definitions.values()) {
      const fingerprint = normalizedIdentity(definition);
      const matchedEvidenceIds: string[] = [];
      const conflictingEvidenceIds: string[] = [];
      const explicitTargetEvidence = evidence.filter(
        (item) => item.claim === identityClaims.target,
      );

      for (const item of evidence) {
        const accepted = fingerprint.get(item.claim);
        if (accepted === undefined) {
          continue;
        }
        if (accepted.has(item.normalizedValue)) {
          matchedEvidenceIds.push(item.id);
        } else {
          conflictingEvidenceIds.push(item.id);
        }
      }

      const acceptedTargetIds = fingerprint.get(identityClaims.target);
      const hasExplicitTargetMatch = explicitTargetEvidence.some(
        (item) => acceptedTargetIds?.has(item.normalizedValue) === true,
      );

      // When a device reports one or more explicit target ids, weaker shared
      // family attributes must not introduce unrelated catalog candidates.
      if (explicitTargetEvidence.length > 0 && !hasExplicitTargetMatch) {
        continue;
      }

      if (matchedEvidenceIds.length > 0) {
        candidates.push(
          Object.freeze({
            targetId: definition.targetId,
            displayName: definition.displayName,
            matchedEvidenceIds: Object.freeze(matchedEvidenceIds),
            conflictingEvidenceIds: Object.freeze(conflictingEvidenceIds),
          }),
        );
      }
    }

    return Object.freeze(candidates);
  }
}
