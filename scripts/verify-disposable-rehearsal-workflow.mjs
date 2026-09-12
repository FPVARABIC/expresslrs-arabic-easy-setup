#!/usr/bin/env node
/** Static fail-closed boundary for the disposable Stage 3 workflow. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function verifyDisposableRehearsalWorkflow(source) {
  const problems = [];
  const requireMatch = (pattern, message) => {
    if (!pattern.test(source)) problems.push(message);
  };
  const forbidMatch = (pattern, message) => {
    if (pattern.test(source)) problems.push(message);
  };

  const triggerBlock = /\non:\n([\s\S]*?)\npermissions:/u.exec(source)?.[1];
  const triggers = [...(triggerBlock ?? "").matchAll(/^ {2}([a-z_]+):/gmu)].map(
    (match) => match[1],
  );
  if (triggers.length !== 1 || triggers[0] !== "workflow_dispatch") {
    problems.push("rehearsal must have workflow_dispatch as its only trigger");
  }

  forbidMatch(
    /^\s*(?:contents|actions|checks|deployments|id-token|packages|pages|pull-requests|security-events|statuses):\s*write\s*$/mu,
    "rehearsal must have no write permission",
  );
  requireMatch(
    /^\s*environment:\s*physical-test-signing-rehearsal\s*$/mu,
    "rehearsal must use its separate protected environment",
  );
  forbidMatch(
    /^\s*environment:\s*physical-test-signing\s*$/mu,
    "rehearsal must never use the permanent signing environment",
  );
  forbidMatch(
    /\bsecrets\.|ELRS_KEYSTORE_BASE64|ELRS_KEYSTORE_PASSWORD|ELRS_KEY_ALIAS|ELRS_KEY_PASSWORD/u,
    "rehearsal must not name or read a signing secret",
  );
  requireMatch(
    /Stage 3 may only run from the default branch/u,
    "rehearsal lacks the default-branch refusal",
  );

  const checkouts = [...source.matchAll(/^\s*uses:\s*actions\/checkout@/gmu)];
  const pinnedCheckouts = [
    ...source.matchAll(/^\s*ref:\s*\$\{\{ github\.sha \}\}\s*$/gmu),
  ];
  if (checkouts.length !== 2 || pinnedCheckouts.length !== checkouts.length) {
    problems.push("every rehearsal checkout must be pinned to github.sha");
  }
  forbidMatch(
    /^\s*ref:\s*\$\{\{ inputs\./mu,
    "rehearsal must never check out a caller-supplied ref",
  );

  requireMatch(
    /node scripts\/verify-stage2-rehearsal-source\.mjs/u,
    "rehearsal does not verify the completed Stage 2 run",
  );
  const layoutCalls = [
    ...source.matchAll(/node scripts\/verify-stage2-artifact-layout\.mjs/gmu),
  ];
  if (layoutCalls.length < 2) {
    problems.push("rehearsal must validate the artifact layout in both jobs");
  }
  const uploads = [
    ...source.matchAll(/^\s*uses:\s*actions\/upload-artifact@/gmu),
  ];
  if (uploads.length !== 1) {
    problems.push("Stage 3 must create exactly one proof-only artifact");
  }
  requireMatch(
    /CN=DISPOSABLE Stage 3 DO NOT INSTALL/u,
    "rehearsal certificate is not visibly disposable",
  );
  requireMatch(
    /the disposable certificate unexpectedly equals the permanent certificate/u,
    "rehearsal does not reject the permanent certificate",
  );

  for (const block of source.matchAll(/^ {8}run: \|\n((?: {10}.*\n|\n)*)/gmu)) {
    if (/\$\{\{[^}]*\}\}/u.test(block[1] ?? "")) {
      problems.push("GitHub expressions must reach shell only through env");
      break;
    }
  }

  const generateAt = source.indexOf(
    "- name: Generate an in-run disposable key",
  );
  const cleanupAt = source.indexOf(
    "- name: Destroy every APK and the disposable key",
  );
  const proofAt = source.indexOf(
    "- name: Write proof that contains no APK and no private key",
  );
  const publishAt = source.indexOf("- name: Publish proof only — no APK");
  if (
    generateAt < 0 ||
    cleanupAt <= generateAt ||
    proofAt <= cleanupAt ||
    publishAt <= proofAt
  ) {
    problems.push(
      "generate, destroy, prove and publish steps are out of order",
    );
  } else {
    const keyLifetime = source.slice(generateAt, cleanupAt);
    const cleanup = source.slice(cleanupAt, proofAt);
    const publish = source.slice(publishAt);
    if (/^\s*uses:/mu.test(keyLifetime)) {
      problems.push(
        "a third-party action runs while the disposable key exists",
      );
    }
    if (
      /\b(?:curl|wget|gh|git|ssh|scp|sftp|rsync|nc|ncat|netcat|socat|telnet|ftp|lftp)\b|\/dev\/tcp|https?:\/\//u.test(
        keyLifetime,
      )
    ) {
      problems.push("network access remains after the disposable key exists");
    }
    for (const required of [
      "if: always()",
      "shred -u",
      "disposable_store",
      "STAGE3-DISPOSABLE-aligned.apk",
      "STAGE3-DISPOSABLE-DO-NOT-INSTALL.apk",
      "SIGNED_PATH",
      "rehearsal-input/verified-unsigned.apk",
      "rehearsal-input.zip",
      "test ! -e",
    ]) {
      if (!cleanup.includes(required)) {
        problems.push(`cleanup is missing ${JSON.stringify(required)}`);
      }
    }
    if (/^\s+[^#\n]*\.apk\s*$/mu.test(publish)) {
      problems.push("proof artifact path includes an APK");
    }
    const publishedPaths = [
      ...publish.matchAll(/^ {12}(\$\{\{ runner\.temp \}\}\/\S+)\s*$/gmu),
    ].map((match) => match[1]);
    const expectedPublishedPaths = [
      "${{ runner.temp }}/stage3-rehearsal-proof.json",
      "${{ runner.temp }}/stage3-disposable.apksigner.txt",
    ];
    if (
      publishedPaths.length !== expectedPublishedPaths.length ||
      publishedPaths.some(
        (path, index) => path !== expectedPublishedPaths[index],
      )
    ) {
      problems.push(
        "proof upload must contain exactly the JSON and certificate report",
      );
    }
    if (!/retention-days:\s*1/u.test(publish)) {
      problems.push("proof artifact must expire after one day");
    }
  }

  requireMatch(
    /name:\s*REHEARSAL-PROOF-ONLY-NO-APK-\$\{\{ inputs\.source_sha \}\}/u,
    "proof artifact is not unmistakably named",
  );
  requireMatch(/publishable:\s*false/u, "proof does not say publishable=false");
  requireMatch(
    /signedApkPublished:\s*false/u,
    "proof does not say signedApkPublished=false",
  );
  requireMatch(
    /if \(field\("KEY_DESTROYED"\) !== "true"\)/u,
    "proof does not refuse missing disposable-key destruction",
  );
  requireMatch(
    /disposableKeyDestroyed:\s*true/u,
    "proof does not record proven disposable-key destruction",
  );
  requireMatch(
    /retention-days:\s*1/u,
    "rehearsal handoff must expire after one day",
  );
  forbidMatch(
    /name:\s*elrs-android-physicaltest-signed-/u,
    "rehearsal uses the production signed-artifact namespace",
  );

  if (problems.length > 0) throw new Error(problems.join("\n"));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const path = process.argv[2];
    if (!path) {
      throw new Error(
        "usage: verify-disposable-rehearsal-workflow.mjs <workflow>",
      );
    }
    verifyDisposableRehearsalWorkflow(readFileSync(path, "utf8"));
    console.log("Disposable rehearsal workflow boundary passed.");
  } catch (error) {
    for (const line of error.message.split("\n")) {
      console.error(`::error::disposable rehearsal rejected — ${line}`);
    }
    process.exitCode = 1;
  }
}
