import type { CrsfParameter } from "./crsf";
import type { OfficialRelease } from "./parity-types";
import { verifyObservedFirmwareVersion } from "./version-verification";

export interface FirmwareBuildVerificationResult {
  readonly verified: boolean;
  readonly expected: string;
  readonly observedVersion: string;
  readonly observedCommit: string | null;
  readonly reason:
    | "EXACT_RELEASE"
    | "EXACT_BRANCH_COMMIT"
    | "VERSION_MISMATCH"
    | "VERSION_UNAVAILABLE"
    | "COMMIT_UNAVAILABLE"
    | "COMMIT_MISMATCH";
}

function normalizedCommit(value: string): string | null {
  const match = /(?:^|[^a-f0-9])([a-f0-9]{7,40})(?:$|[^a-f0-9])/iu.exec(
    ` ${value} `,
  );
  return match?.[1]?.toLocaleLowerCase("en-US") ?? null;
}

export function observedExpressLrsCommit(
  parameters: readonly CrsfParameter[],
): string | null {
  const candidates: string[] = [];
  for (const parameter of parameters) {
    if (parameter.kind !== "info" && parameter.kind !== "string") continue;
    candidates.push(parameter.name, parameter.value);
  }
  for (const candidate of candidates) {
    const commit = normalizedCommit(candidate);
    if (commit !== null) return commit;
  }
  return null;
}

export function verifyObservedFirmwareBuild(input: {
  readonly release: OfficialRelease;
  readonly observedVersion: string;
  readonly parameters: readonly CrsfParameter[];
}): FirmwareBuildVerificationResult {
  if (input.release.channel === "release") {
    const version = verifyObservedFirmwareVersion({
      release: input.release,
      observedVersion: input.observedVersion,
    });
    return Object.freeze({
      verified: version.verified,
      expected: version.expected,
      observedVersion: version.observed,
      observedCommit: observedExpressLrsCommit(input.parameters),
      reason:
        version.reason === "BRANCH_VERSION_OBSERVED"
          ? "VERSION_MISMATCH"
          : version.reason,
    });
  }

  const observedCommit = observedExpressLrsCommit(input.parameters);
  if (observedCommit === null) {
    return Object.freeze({
      verified: false,
      expected: input.release.revision,
      observedVersion: input.observedVersion,
      observedCommit: null,
      reason: "COMMIT_UNAVAILABLE",
    });
  }
  const expectedCommit = input.release.revision.toLocaleLowerCase("en-US");
  const verified =
    expectedCommit.startsWith(observedCommit) ||
    observedCommit.startsWith(expectedCommit);
  return Object.freeze({
    verified,
    expected: input.release.revision,
    observedVersion: input.observedVersion,
    observedCommit,
    reason: verified ? "EXACT_BRANCH_COMMIT" : "COMMIT_MISMATCH",
  });
}
