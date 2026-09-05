import type { ExpressLrsIdentity } from "./session";
import type { OfficialTarget } from "./parity-types";

export interface TargetMatchCandidate {
  readonly target: OfficialTarget;
  readonly score: number;
  readonly evidence: readonly string[];
}

export interface TargetMatchResult {
  readonly confidence: "EXACT" | "LIKELY" | "AMBIGUOUS" | "NOT_FOUND";
  readonly selected: OfficialTarget | null;
  readonly candidates: readonly TargetMatchCandidate[];
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "")
    .slice(0, 256);
}

function tokenSet(value: string): ReadonlySet<string> {
  return new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .split(/[^a-z0-9]+/gu)
      .filter((token) => token.length >= 3),
  );
}

function overlap(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let matches = 0;
  for (const value of left) if (right.has(value)) matches += 1;
  return matches;
}

export function matchHardwareIdentityToOfficialTargets(input: {
  readonly identity: ExpressLrsIdentity;
  readonly targets: readonly OfficialTarget[];
}): TargetMatchResult {
  const product = normalized(input.identity.productName);
  const productTokens = tokenSet(input.identity.productName);
  const candidates: TargetMatchCandidate[] = [];

  for (const target of input.targets) {
    if (target.role !== input.identity.role) continue;
    const evidence: string[] = [];
    let score = 0;
    const officialProduct = normalized(target.config.productName);
    const targetKey = normalized(target.targetKey);
    const firmware = normalized(target.config.firmware);
    if (product === officialProduct && product.length > 0) {
      score += 100;
      evidence.push("product-name-exact");
    }
    if (product === targetKey && product.length > 0) {
      score += 90;
      evidence.push("target-key-exact");
    }
    if (product === firmware && product.length > 0) {
      score += 95;
      evidence.push("firmware-key-exact");
    } else if (product.includes(firmware) || firmware.includes(product)) {
      if (Math.min(product.length, firmware.length) >= 8) {
        score += 70;
        evidence.push("firmware-key-contained");
      }
    }
    const officialTokens = tokenSet(
      `${target.config.productName} ${target.targetKey} ${target.config.firmware}`,
    );
    const shared = overlap(productTokens, officialTokens);
    if (shared >= 2) {
      score += Math.min(shared * 8, 32);
      evidence.push(`shared-tokens:${shared}`);
    }
    if (score > 0) {
      candidates.push(
        Object.freeze({ target, score, evidence: Object.freeze(evidence) }),
      );
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score || left.target.id.localeCompare(right.target.id),
  );
  const top = candidates[0];
  const second = candidates[1];
  if (top === undefined) {
    return Object.freeze({
      confidence: "NOT_FOUND",
      selected: null,
      candidates: Object.freeze([]),
    });
  }
  const exactCandidates = candidates.filter((candidate) =>
    candidate.evidence.some((item) =>
      ["product-name-exact", "target-key-exact", "firmware-key-exact"].includes(
        item,
      ),
    ),
  );
  if (exactCandidates.length === 1 && exactCandidates[0] !== undefined) {
    return Object.freeze({
      confidence: "EXACT",
      selected: exactCandidates[0].target,
      candidates: Object.freeze(candidates.slice(0, 8)),
    });
  }
  if (exactCandidates.length > 1) {
    return Object.freeze({
      confidence: "AMBIGUOUS",
      selected: null,
      candidates: Object.freeze(candidates.slice(0, 8)),
    });
  }
  if (
    top.score >= 70 &&
    (second === undefined || top.score - second.score >= 20)
  ) {
    return Object.freeze({
      confidence: "LIKELY",
      selected: null,
      candidates: Object.freeze(candidates.slice(0, 8)),
    });
  }
  return Object.freeze({
    confidence: "AMBIGUOUS",
    selected: null,
    candidates: Object.freeze(candidates.slice(0, 8)),
  });
}
