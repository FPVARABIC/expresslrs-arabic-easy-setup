import type { OfficialRelease } from "./parity-types";

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
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/u.test(value)
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
  const parse = (value: string) =>
    value
      .replace(/^v/u, "")
      .split(/[.-]/u)
      .slice(0, 4)
      .map((part) => Number.parseInt(part, 10));
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const leftValue = a[index];
    const rightValue = b[index];
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) {
      const delta = (rightValue ?? 0) - (leftValue ?? 0);
      if (delta !== 0) return delta;
    } else if (Number.isFinite(leftValue)) {
      return -1;
    } else if (Number.isFinite(rightValue)) {
      return 1;
    }
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
    if (!output.has(key) && output.size < 256) {
      output.set(key, Object.freeze({ label, revision, channel }));
    }
  };

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 256)) {
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
  for (const [key, item] of Object.entries(value).slice(0, 256)) {
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
    [...releases.values()].sort((left, right) =>
      compareLabels(left.label, right.label),
    ),
  );
}
