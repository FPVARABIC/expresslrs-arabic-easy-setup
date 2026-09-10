/**
 * Prints the frozen target pack's identity as one line of JSON.
 *
 * The release-candidate workflow embeds this in the APK's provenance manifest,
 * so a candidate handed to a tester names the exact pack its hardware layouts
 * came from. It lives here rather than inline in the workflow because a nested
 * heredoc inside a YAML block scalar is a broken YAML file waiting to happen,
 * and because `.mjs` leaves no ambiguity about how Node should load it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(
  here,
  "..",
  "apps",
  "web",
  "src",
  "hardware",
  "target-pack",
  "manifest.json",
);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

process.stdout.write(
  `${JSON.stringify({
    packVersion: manifest.packVersion,
    createdAt: manifest.createdAt,
    targetsSha: manifest.targetsRepository?.sha ?? null,
    targetsJsonSha256: manifest.targetsJsonSha256,
    layoutArchiveSha256: manifest.layoutArchiveSha256,
    // Carried verbatim: this pack is explicitly *not* claimed to be the
    // release's own snapshot, and a provenance record that dropped that
    // qualification would be worse than one that omitted the field.
    provenanceClaim: manifest.provenance?.claim ?? null,
  })}\n`,
);
