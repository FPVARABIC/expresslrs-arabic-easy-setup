import type { OfficialRelease } from "./parity-types";

function semverTriplet(
  value: string,
): readonly [number, number, number] | null {
  const match = /(?:^|[^0-9])(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:$|[^0-9])/u.exec(
    ` ${value} `,
  );
  if (match === null) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return [major, minor, patch];
}

export interface VersionVerificationResult {
  readonly verified: boolean;
  readonly expected: string;
  readonly observed: string;
  readonly reason:
    | "EXACT_RELEASE"
    | "BRANCH_VERSION_OBSERVED"
    | "VERSION_MISMATCH"
    | "VERSION_UNAVAILABLE";
}

export function verifyObservedFirmwareVersion(input: {
  readonly release: OfficialRelease;
  readonly observedVersion: string;
}): VersionVerificationResult {
  const observed = semverTriplet(input.observedVersion);
  if (observed === null) {
    return Object.freeze({
      verified: false,
      expected: input.release.label,
      observed: input.observedVersion,
      reason: "VERSION_UNAVAILABLE",
    });
  }
  if (input.release.channel === "branch") {
    return Object.freeze({
      verified: true,
      expected: input.release.label,
      observed: input.observedVersion,
      reason: "BRANCH_VERSION_OBSERVED",
    });
  }
  const expected = semverTriplet(input.release.label);
  if (expected === null) {
    return Object.freeze({
      verified: false,
      expected: input.release.label,
      observed: input.observedVersion,
      reason: "VERSION_UNAVAILABLE",
    });
  }
  const verified = expected.every((value, index) => value === observed[index]);
  return Object.freeze({
    verified,
    expected: input.release.label,
    observed: input.observedVersion,
    reason: verified ? "EXACT_RELEASE" : "VERSION_MISMATCH",
  });
}
