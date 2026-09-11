#!/usr/bin/env node
/**
 * Decides whether an unsigned candidate deserves the permanent signing key.
 *
 * Every check here runs in a job with no secrets present, which is the design:
 * by the time the key exists there are no decisions left to make. The script
 * is deliberately dependency-free and reads only JSON that GitHub's API
 * produced plus values the workflow measured from the APK itself — it never
 * loads, imports, or executes anything from the candidate.
 *
 * Two modes, because the two questions are separable and are asked at
 * different points:
 *
 *   --run/--artifact   Is this artifact the output of a successful run of the
 *                      allowlisted workflow, on the claimed commit, in this
 *                      repository? Asked before the artifact is downloaded, so
 *                      a wrong answer costs nothing.
 *   --manifest         Does the manifest CI wrote describe the APK that was
 *                      actually delivered? Asked after, against values read
 *                      out of the APK with aapt2.
 *
 * Every failure is fatal and named. There is no partial success and no
 * warning-only path: a candidate that cannot be fully accounted for does not
 * get signed, because a signed APK is the thing a person installs on a phone
 * that then rewrites firmware on flight hardware.
 */
import { readFileSync } from "node:fs";

const problems = [];

function fail(message) {
  problems.push(message);
}

/** Compares and reports both sides, since "mismatch" alone is not actionable. */
function mustEqual(label, actual, expected) {
  if (actual !== expected) {
    fail(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function argument(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path} could not be read as JSON: ${error.message}`);
    return null;
  }
}

const runPath = argument("run");
const artifactPath = argument("artifact");
const manifestPath = argument("manifest");

if (runPath !== null && artifactPath !== null) {
  const run = readJson(runPath);
  const artifact = readJson(artifactPath);
  const repository = argument("repository");
  const sourceSha = argument("source-sha");
  const runId = argument("run-id");
  const artifactId = argument("artifact-id");
  const artifactName = argument("artifact-name");
  const allowedWorkflowPath = argument("allowed-workflow-path");

  if (run !== null) {
    // The run must be in this repository. A run id from a fork or another
    // repository would otherwise be fetched happily by a caller who has the
    // number.
    mustEqual("run repository", run.repository?.full_name, repository);
    mustEqual("run id", String(run.id ?? ""), runId);
    // Only the allowlisted workflow. Checked against the run's own recorded
    // path, which the caller cannot influence, rather than against its
    // display name, which is only a label.
    mustEqual("run workflow path", run.path, allowedWorkflowPath);
    // A failed or cancelled run may have produced an artifact; that artifact
    // has not passed the project's gates and must not be signed.
    mustEqual("run status", run.status, "completed");
    mustEqual("run conclusion", run.conclusion, "success");
    // The commit the candidate claims to be built from. `head_sha` is the
    // producing commit; on a pull_request event that is the head of the
    // branch, which is what the candidate provenance records too.
    mustEqual("run head SHA", run.head_sha, sourceSha);
  }

  if (artifact !== null) {
    mustEqual("artifact id", String(artifact.id ?? ""), artifactId);
    mustEqual("artifact name", artifact.name, artifactName);
    // The artifact must belong to the run that was just verified. Without
    // this, the run checks describe one thing and the download another.
    mustEqual(
      "artifact's producing run",
      String(artifact.workflow_run?.id ?? ""),
      runId,
    );
    if (artifact.expired === true) {
      fail("artifact has expired, so its bytes are no longer retrievable");
    }
  }
}

if (manifestPath !== null) {
  const manifest = readJson(manifestPath);
  if (manifest !== null) {
    mustEqual("manifest schemaVersion", manifest.schemaVersion, 1);
    // The manifest must describe an *unsigned* candidate. One claiming to be
    // signed means the producing build had a key.
    mustEqual("manifest channel", manifest.channel, "physical-test-unsigned");
    mustEqual("manifest signed flag", manifest.signed, false);
    mustEqual("manifest sourceSha", manifest.sourceSha, argument("source-sha"));
    mustEqual(
      "manifest runId",
      String(manifest.runId ?? ""),
      argument("run-id"),
    );
    mustEqual(
      "manifest artifactName",
      manifest.artifactName,
      argument("artifact-name"),
    );
    // The digest the producing run recorded, against the digest of the file
    // that actually arrived.
    mustEqual("manifest apkSha256", manifest.apkSha256, argument("apk-sha256"));
    // And the identity, against what aapt2 reads out of the APK. A manifest
    // that describes a different application id or version than the APK
    // carries is describing a different artifact.
    mustEqual(
      "manifest applicationId",
      manifest.applicationId,
      argument("application-id"),
    );
    mustEqual(
      "manifest versionCode",
      String(manifest.versionCode ?? ""),
      argument("version-code"),
    );
    mustEqual(
      "manifest versionName",
      String(manifest.versionName ?? ""),
      argument("version-name"),
    );
    // Traceability back to a source tree. `writeSourceIdentity` emits the
    // literal "absent" rather than failing when it has nothing to hash, so an
    // APK can carry provenance that says nothing; that is worse than no APK,
    // because a bench result against it could not be tied to any source.
    for (const field of ["webBuildSha256", "nativeSourceSha256"]) {
      const value = manifest[field];
      if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
        fail(
          `manifest ${field} is not a SHA-256 (${JSON.stringify(value)}), so this APK cannot be traced to a source tree`,
        );
      }
    }
  }
}

if (runPath === null && manifestPath === null) {
  fail("nothing to verify: pass --run and --artifact, or --manifest");
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`::error::candidate verification failed — ${problem}`);
  }
  console.error(
    `\nRefusing to sign. ${String(problems.length)} check(s) failed; a candidate that cannot be fully accounted for does not get the signing key.`,
  );
  process.exit(1);
}

console.log("Candidate verification passed.");
