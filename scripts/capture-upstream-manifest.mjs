// Records a deterministic manifest of the upstream catalog the application
// actually consumes, so upstream drift is detectable rather than invisible.
//
// The live suites prove the catalog still parses. This records *what* it
// parsed — release labels and revisions, target counts per platform, and a
// SHA-256 over the canonicalised catalog — so a change upstream shows up as a
// diff against the committed baseline instead of only as a passing test.
//
// Requires network access to the official mirror. It is run by CI, where that
// is available.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://expresslrs.github.io/web-flasher/assets/firmware";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    value: JSON.parse(new TextDecoder().decode(bytes)),
  };
}

/** Stable ordering, so the same upstream state always hashes the same. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function countPlatforms(targets, into = new Map()) {
  if (targets === null || typeof targets !== "object") return into;
  if (
    typeof targets.platform === "string" &&
    typeof targets.firmware === "string"
  ) {
    into.set(targets.platform, (into.get(targets.platform) ?? 0) + 1);
    return into;
  }
  for (const child of Object.values(targets)) countPlatforms(child, into);
  return into;
}

const index = await fetchJson(`${BASE}/index.json`);
const targets = await fetchJson(`${BASE}/hardware/targets.json`);

const platforms = [...countPlatforms(targets.value).entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([platform, count]) => ({ platform, count }));

const manifest = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  source: BASE,
  index: {
    sha256: index.sha256,
    bytes: index.bytes.byteLength,
    releases: canonical(index.value),
  },
  targets: {
    sha256: targets.sha256,
    bytes: targets.bytes.byteLength,
    platforms,
    totalTargets: platforms.reduce((sum, entry) => sum + entry.count, 0),
  },
};

const out = path.join(root, "artifacts");
await mkdir(out, { recursive: true });
const file = path.join(out, "upstream-catalog-manifest.json");
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `index.json     sha256 ${index.sha256} (${index.bytes.byteLength} bytes)`,
);
console.log(
  `targets.json   sha256 ${targets.sha256} (${targets.bytes.byteLength} bytes)`,
);
console.log(
  `targets        ${manifest.targets.totalTargets} across ${platforms.length} platforms`,
);
for (const { platform, count } of platforms) {
  console.log(`  ${platform.padEnd(14)} ${count}`);
}
console.log(`written to ${path.relative(root, file)}`);
