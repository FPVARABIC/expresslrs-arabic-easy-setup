import type { OfficialRelease } from "./parity-types";

const MAX_RELEASES = 256;

export class OfficialIndexError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OfficialIndexError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeLabel(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.@+ -]{1,160}$/u.test(value)
    ? value
    : null;
}

function safeRevision(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value)
    ? value
    : null;
}

function recordString(
  record: Readonly<Record<string, unknown>>,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function compareLabels(left: string, right: string): number {
  const parse = (value: string) => {
    const match =
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
        value,
      );
    if (match === null) return null;
    return {
      core: match.slice(1, 4) as [string, string, string],
      prerelease: match[4]?.split(".") ?? [],
    };
  };
  const compareNumeric = (a: string, b: string): number => {
    if (a.length !== b.length) return a.length - b.length;
    return a === b ? 0 : a < b ? -1 : 1;
  };
  const compareNatural = (a: string, b: string): number => {
    const aParts = a.match(/\d+|\D+/gu) ?? [];
    const bParts = b.match(/\d+|\D+/gu) ?? [];
    const length = Math.max(aParts.length, bParts.length);
    for (let index = 0; index < length; index += 1) {
      const aPart = aParts[index];
      const bPart = bParts[index];
      if (aPart === undefined || bPart === undefined) {
        return aPart === bPart ? 0 : aPart === undefined ? -1 : 1;
      }
      if (aPart === bPart) continue;
      const aNumeric = /^\d+$/u.test(aPart);
      const bNumeric = /^\d+$/u.test(bPart);
      if (aNumeric && bNumeric) return compareNumeric(aPart, bPart);
      return aPart < bPart ? -1 : 1;
    }
    return 0;
  };
  const comparePrerelease = (
    a: readonly string[],
    b: readonly string[],
  ): number => {
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const aPart = a[index];
      const bPart = b[index];
      if (aPart === undefined || bPart === undefined) {
        return aPart === bPart ? 0 : aPart === undefined ? -1 : 1;
      }
      if (aPart === bPart) continue;
      const aNumeric = /^\d+$/u.test(aPart);
      const bNumeric = /^\d+$/u.test(bPart);
      if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
      return aNumeric
        ? compareNumeric(aPart, bPart)
        : compareNatural(aPart, bPart);
    }
    return 0;
  };
  const a = parse(left);
  const b = parse(right);
  if (a !== null && b !== null) {
    for (let index = 0; index < 3; index += 1) {
      const delta = compareNumeric(a.core[index] ?? "0", b.core[index] ?? "0");
      if (delta !== 0) return -delta;
    }
    if (a.prerelease.length === 0 || b.prerelease.length === 0) {
      if (a.prerelease.length !== b.prerelease.length) {
        return a.prerelease.length === 0 ? -1 : 1;
      }
    } else {
      const delta = comparePrerelease(a.prerelease, b.prerelease);
      if (delta !== 0) return -delta;
    }
  } else if (a !== null) {
    return -1;
  } else if (b !== null) {
    return 1;
  }
  return right.localeCompare(left, "en");
}

function collectCollection(
  value: unknown,
  channel: OfficialRelease["channel"],
  output: Map<string, OfficialRelease>,
): void {
  const add = (labelValue: unknown, revisionValue: unknown) => {
    const label = safeLabel(labelValue);
    const revision = safeRevision(revisionValue);
    if (label === null || revision === null) return;
    const key = `${channel}:${label}:${revision}`;
    if (!output.has(key)) {
      output.set(key, Object.freeze({ label, revision, channel }));
    }
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        add(item, item);
        continue;
      }
      if (!isRecord(item)) continue;
      add(
        recordString(item, ["label", "name", "version", "tag", "branch"]),
        recordString(item, ["revision", "commit", "sha", "hash", "id"]),
      );
    }
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      add(key, item);
      continue;
    }
    if (!isRecord(item)) continue;
    const explicitLabel =
      recordString(item, ["label", "name", "version", "tag", "branch"]) ?? key;
    const revision = recordString(item, [
      "revision",
      "commit",
      "sha",
      "hash",
      "id",
    ]);
    add(explicitLabel, revision);
  }
}

export function parseOfficialReleaseIndexFlexible(
  value: unknown,
): readonly OfficialRelease[] {
  if (!isRecord(value)) {
    throw new OfficialIndexError("Official release index is not an object");
  }
  const releases = new Map<string, OfficialRelease>();
  collectCollection(value.tags, "release", releases);
  collectCollection(value.releases, "release", releases);
  collectCollection(value.branches, "branch", releases);
  collectCollection(value.channels, "branch", releases);

  if (releases.size === 0) {
    // A few historical indexes used the root itself as a tag map.
    collectCollection(value, "release", releases);
  }
  if (releases.size === 0) {
    throw new OfficialIndexError(
      "Official release index contains no bounded release entries",
    );
  }
  return Object.freeze(
    [...releases.values()]
      .sort((left, right) => compareLabels(left.label, right.label))
      .slice(0, MAX_RELEASES),
  );
}
