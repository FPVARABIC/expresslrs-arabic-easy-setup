#!/usr/bin/env node
/**
 * Verifies that Stage 3 consumes the exact unsigned artifact that a successful
 * Stage 2 verification handed forward. Stage 2 is expected to finish red when
 * the permanent signing secrets are absent, so the run conclusion alone is
 * not useful: the two jobs and the security-sensitive steps are checked
 * individually.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function asString(value) {
  return value === undefined || value === null ? "" : String(value);
}

function step(job, name) {
  return job?.steps?.find((candidate) => candidate.name === name);
}

export function verifyStage2RehearsalSource({
  run,
  jobs,
  artifact,
  oldSigner,
  currentSigner,
  repository,
  stage2RunId,
  stage2ArtifactId,
  stage2SignerSha,
  sourceSha,
  defaultBranch,
}) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const equal = (label, actual, expected) => {
    if (actual !== expected) {
      fail(
        `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  };

  equal("run repository", run?.repository?.full_name, repository);
  equal("run id", asString(run?.id), stage2RunId);
  equal(
    "run workflow path",
    run?.path,
    ".github/workflows/android-physical-test-signer.yml",
  );
  equal("run event", run?.event, "workflow_dispatch");
  equal("run status", run?.status, "completed");
  equal("run conclusion", run?.conclusion, "failure");
  equal("run head branch", run?.head_branch, defaultBranch);
  equal("run head SHA", run?.head_sha, stage2SignerSha);
  equal("run attempt", asString(run?.run_attempt), "1");

  equal("artifact id", asString(artifact?.id), stage2ArtifactId);
  equal("artifact name", artifact?.name, `verified-unsigned-${sourceSha}`);
  equal(
    "artifact producing run",
    asString(artifact?.workflow_run?.id),
    stage2RunId,
  );
  if (artifact?.expired === true) {
    fail("Stage 2 artifact has expired");
  }

  const jobList = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const verifyJobs = jobList.filter(
    (job) => job.name === "Verify the candidate, with no secrets present",
  );
  const signJobs = jobList.filter(
    (job) => job.name === "Sign the verified candidate",
  );
  equal("number of Stage 2 verify jobs", verifyJobs.length, 1);
  equal("number of Stage 2 sign jobs", signJobs.length, 1);
  equal("total Stage 2 jobs", jobList.length, 2);

  const verifyJob = verifyJobs[0];
  const signJob = signJobs[0];
  equal("verify job conclusion", verifyJob?.conclusion, "success");
  equal("verify job run id", asString(verifyJob?.run_id), stage2RunId);
  equal("verify job head SHA", verifyJob?.head_sha, stage2SignerSha);
  equal(
    "verified-artifact handoff step",
    step(verifyJob, "Pass the verified candidate to the signing job")
      ?.conclusion,
    "success",
  );

  equal("sign job conclusion", signJob?.conclusion, "failure");
  equal("sign job run id", asString(signJob?.run_id), stage2RunId);
  equal("sign job head SHA", signJob?.head_sha, stage2SignerSha);
  equal(
    "pre-sign digest confirmation",
    step(signJob, "Re-confirm the digest immediately before signing")
      ?.conclusion,
    "success",
  );
  equal(
    "missing-secret stop",
    step(signJob, "Materialise the signing keystore")?.conclusion,
    "failure",
  );
  for (const name of [
    "Align and sign",
    "Verify the signature and the certificate fingerprint",
    "Write the signed provenance",
    "Publish the signed candidate",
  ]) {
    equal(`${name} step`, step(signJob, name)?.conclusion, "skipped");
  }
  equal(
    "keystore cleanup after the expected stop",
    step(signJob, "Destroy the keystore")?.conclusion,
    "success",
  );

  equal(
    "Stage 2 signer blob at the producing SHA",
    oldSigner?.sha,
    currentSigner?.sha,
  );

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const required = [
      "run",
      "jobs",
      "artifact",
      "old-signer",
      "current-signer",
      "repository",
      "stage2-run-id",
      "stage2-artifact-id",
      "stage2-signer-sha",
      "source-sha",
      "default-branch",
    ];
    const values = Object.fromEntries(
      required.map((name) => [name, argument(name)]),
    );
    const missing = required.filter((name) => !values[name]);
    if (missing.length > 0) {
      throw new Error(`missing argument(s): ${missing.join(", ")}`);
    }
    verifyStage2RehearsalSource({
      run: readJson(values.run),
      jobs: readJson(values.jobs),
      artifact: readJson(values.artifact),
      oldSigner: readJson(values["old-signer"]),
      currentSigner: readJson(values["current-signer"]),
      repository: values.repository,
      stage2RunId: values["stage2-run-id"],
      stage2ArtifactId: values["stage2-artifact-id"],
      stage2SignerSha: values["stage2-signer-sha"],
      sourceSha: values["source-sha"],
      defaultBranch: values["default-branch"],
    });
    console.log("Stage 2 rehearsal source verified.");
  } catch (error) {
    for (const line of error.message.split("\n")) {
      console.error(`::error::Stage 2 source rejected — ${line}`);
    }
    process.exitCode = 1;
  }
}
