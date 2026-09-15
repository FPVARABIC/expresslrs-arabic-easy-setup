// Freezes an immutable, release-scoped target pack into the application.
//
// Why this exists
// ---------------
// ExpressLRS 4.1.0 does not record which ExpressLRS/Targets commit its release
// was produced from. `.github/workflows/build.yml` at the 4.1.0 tag checks the
// Targets repository out with no `ref:`, so the release took whatever the
// default branch tip happened to be when the job ran and wrote that fact down
// nowhere. The published mirror then serves a single, mutable `hardware/` tree
// that keeps moving after the release.
//
// Fetching layouts from that mutable tree while flashing a pinned firmware
// release means the bytes written to a device depend on what upstream
// published this morning. For recovery in particular that is unacceptable: the
// image you restore must be the image you saved.
//
// So the pack is generated once from an immutable Targets commit, hashed, and
// compiled into the build. Nothing is fetched from a mutable path during a
// write.
//
// Usage:
//   node scripts/build-target-pack.mjs --targets <checkout> --sha <40-hex> \
//        [--pack-version N]

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "apps/web/src/hardware/target-pack");

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const targetsRoot = arg("targets");
const targetsSha = arg("sha");
const packVersion = Number(arg("pack-version", "1"));

if (targetsRoot === null || targetsSha === null) {
  console.error(
    "usage: build-target-pack.mjs --targets <checkout> --sha <40-hex> [--pack-version N]",
  );
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/u.test(targetsSha)) {
  console.error(
    `--sha must be a full 40-character commit SHA, got "${targetsSha}"`,
  );
  process.exit(2);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function readDirectory(relative) {
  const absolute = path.join(targetsRoot, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    files[entry.name] = await readFile(path.join(absolute, entry.name), "utf8");
  }
  return files;
}

const targetsJson = await readFile(
  path.join(targetsRoot, "targets.json"),
  "utf8",
);
const rx = await readDirectory("RX");
const tx = await readDirectory("TX");

/**
 * Logos are binary and are appended to the firmware image, so they belong in
 * the pack too: cosmetic or not, they change the bytes written to a device.
 */
async function readBinaries(relative) {
  const absolute = path.join(targetsRoot, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".bin")) continue;
    files[entry.name] = await readFile(path.join(absolute, entry.name));
  }
  return files;
}
const logos = await readBinaries("logo");

function binaryArchiveDigest(files) {
  const hash = createHash("sha256");
  for (const name of Object.keys(files).sort()) {
    hash.update(name);
    hash.update("\0");
    hash.update(files[name]);
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** A stable digest over a set of files: name and bytes, in name order. */
function archiveDigest(files) {
  const hash = createHash("sha256");
  for (const name of Object.keys(files).sort()) {
    hash.update(name);
    hash.update("\0");
    hash.update(files[name]);
    hash.update("\0");
  }
  return hash.digest("hex");
}

const manifest = {
  schemaVersion: 1,
  packVersion,
  createdAt: new Date().toISOString(),
  provenance: {
    // Stated plainly so nobody later mistakes this for the release's own
    // snapshot.
    claim: "NOT_THE_RELEASE_SNAPSHOT",
    reason:
      "ExpressLRS 4.1.0 records no Targets commit: .github/workflows/build.yml at tag 4.1.0 checks out ExpressLRS/targets with no ref, so the release used an unrecorded default-branch tip.",
  },
  // Upstream serves ONE hardware tree for every release, so a Targets snapshot
  // is not intrinsically bound to a single firmware release. What is bound is
  // which releases this project has actually exercised the snapshot against.
  // A release outside this list is refused, not guessed at.
  validatedReleases: [
    { label: "4.1.0", sha: "a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6" },
    // The pinned STM32 asset this repository packages and verifies.
    { label: "3.6.4", sha: null },
  ],
  validation:
    "Validated by this repository's packaging and integrity test suite against these releases. This is not an upstream guarantee that these layouts shipped with those releases; upstream records no such pairing.",
  targetsRepository: {
    repository: "ExpressLRS/targets",
    sha: targetsSha,
  },
  targetsJsonSha256: sha256(targetsJson),
  targetsJsonBytes: Buffer.byteLength(targetsJson, "utf8"),
  layoutArchiveSha256: archiveDigest({
    ...prefix("RX/", rx),
    ...prefix("TX/", tx),
  }),
  layoutFileCount: Object.keys(rx).length + Object.keys(tx).length,
  logoArchiveSha256: binaryArchiveDigest(logos),
  logoFileCount: Object.keys(logos).length,
  logoSha256: Object.fromEntries(
    Object.entries(logos)
      .map(([name, bytes]) => [name, sha256(bytes)])
      .sort(([a], [b]) => a.localeCompare(b)),
  ),
  layoutSha256: Object.fromEntries(
    [
      ...Object.entries(rx).map(([name, text]) => [`RX/${name}`, sha256(text)]),
      ...Object.entries(tx).map(([name, text]) => [`TX/${name}`, sha256(text)]),
    ].sort(([a], [b]) => a.localeCompare(b)),
  ),
};

function prefix(p, files) {
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [p + k, v]));
}

await mkdir(outDir, { recursive: true });

const dataModule = `// GENERATED by scripts/build-target-pack.mjs — do not edit by hand.
//
// The frozen bytes of an immutable ExpressLRS/Targets commit. These are the
// exact bytes packaging appends to a firmware image, so they are stored
// verbatim and hashed rather than re-serialised.

export const packTargetsJson = ${JSON.stringify(targetsJson)};

/** Base64, because these are binary and must survive verbatim. */
export const packLogosBase64: Readonly<Record<string, string>> = Object.freeze({
${Object.entries(logos)
  .map(
    ([name, bytes]) =>
      `  ${JSON.stringify(name)}: ${JSON.stringify(bytes.toString("base64"))},`,
  )
  .join("\n")}
});

export const packLayouts: Readonly<Record<string, string>> = Object.freeze({
${[
  ...Object.entries(rx).map(
    ([name, text]) =>
      `  ${JSON.stringify(`RX/${name}`)}: ${JSON.stringify(text)},`,
  ),
  ...Object.entries(tx).map(
    ([name, text]) =>
      `  ${JSON.stringify(`TX/${name}`)}: ${JSON.stringify(text)},`,
  ),
].join("\n")}
});
`;

await writeFile(path.join(outDir, "pack-data.ts"), dataModule, "utf8");
await writeFile(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`pack version      ${manifest.packVersion}`);
console.log(`created           ${manifest.createdAt}`);
console.log(
  `validated for     ${manifest.validatedReleases.map((r) => r.label).join(", ")}`,
);
console.log(`Targets           ${manifest.targetsRepository.sha}`);
console.log(
  `targets.json      sha256 ${manifest.targetsJsonSha256} (${manifest.targetsJsonBytes} bytes)`,
);
console.log(
  `layout archive    sha256 ${manifest.layoutArchiveSha256} (${manifest.layoutFileCount} files)`,
);
console.log(
  `logo archive      sha256 ${manifest.logoArchiveSha256} (${manifest.logoFileCount} files)`,
);
