import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  UNSIGNED_APK_RELATIVE_PATH,
  UNSIGNED_MANIFEST_RELATIVE_PATH,
  verifyUnsignedCandidateLayout,
} from "./verify-unsigned-candidate-layout.mjs";
import {
  STAGE2_APK_RELATIVE_PATH,
  STAGE2_MANIFEST_RELATIVE_PATH,
  verifyStage2ArtifactLayout,
} from "./verify-stage2-artifact-layout.mjs";
import { verifyStage2RehearsalSource } from "./verify-stage2-rehearsal-source.mjs";
import { verifyDisposableRehearsalWorkflow } from "./verify-disposable-rehearsal-workflow.mjs";

const allowedWorkflows = new Set([
  "ci.yml",
  "deploy-pages.yml",
  // The trusted post-build signer. It belongs on the default branch and
  // nowhere else: `workflow_dispatch` is only dispatchable from here, and
  // keeping it out of candidate branches is what makes "pull-request code
  // cannot reach the signing key" a structural claim. See
  // docs/ANDROID_SIGNING.md.
  "android-physical-test-signer.yml",
  // A manual, proof-only rehearsal that generates and destroys its own
  // disposable key. It never names the permanent environment or secrets and
  // never uploads an APK.
  "android-physical-test-rehearsal.yml",
]);
const workflowDirectory = ".github/workflows";
const forbiddenPaths = [
  ".acceptance-stage",
  ".github/patches/foundation-repair.patch",
  "scripts/m2-final-audit-correction.py",
  "scripts/m2-final-audit-repair.py",
  "scripts/m2-user-journey-audit-repair.py",
  "apps/web/src/main-v2.tsx",
  "apps/web/src/components/ExpressLrsParityWorkbenchV2.tsx",
  "apps/web/src/components/ExpressLrsParityWorkbenchV2.test.tsx",
  "apps/web/src/hardware/official-catalog-v2.ts",
  "apps/web/src/hardware/official-target-index-v2.ts",
  "apps/web/src/hardware/official-target-index-v2.test.ts",
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

if (!existsSync(workflowDirectory)) {
  fail(`${workflowDirectory} is missing`);
} else {
  const workflows = readdirSync(workflowDirectory, { withFileTypes: true });
  for (const entry of workflows) {
    if (!entry.isFile() || !/\.ya?ml$/u.test(entry.name)) continue;
    if (!allowedWorkflows.has(entry.name)) {
      fail(`temporary or unreviewed workflow remains: ${entry.name}`);
    }
  }
}

for (const path of forbiddenPaths) {
  if (existsSync(path)) fail(`temporary or duplicate path remains: ${path}`);
}

const mainPath = "apps/web/src/main.tsx";
const canonicalWorkbenchPath =
  "apps/web/src/components/ExpressLrsParityWorkbench.tsx";
if (!existsSync(mainPath) || !existsSync(canonicalWorkbenchPath)) {
  fail("the canonical production entrypoint or workbench is missing");
} else {
  const main = readFileSync(mainPath, "utf8");
  const shellPath = "apps/web/src/components/ProductShell.tsx";
  if (!main.includes('from "./components/ProductShell"')) {
    fail("main.tsx does not import the canonical product shell");
  }
  if (!existsSync(shellPath)) {
    fail(`${shellPath} is missing`);
  } else {
    const shell = readFileSync(shellPath, "utf8");
    if (!shell.includes('from "./ExpressLrsParityWorkbench"')) {
      fail("the product shell does not import the canonical workbench");
    }
    if (!shell.includes('from "./EasySetup"')) {
      fail("the product shell does not import Easy Mode");
    }
    if (/WorkbenchV2|main-v2/u.test(shell)) {
      fail("the product shell still references a V2-only entrypoint");
    }
  }
  if (/WorkbenchV2|main-v2/u.test(main)) {
    fail("main.tsx still references a V2-only entrypoint");
  }
}

const canonicalCiPath = ".github/workflows/ci.yml";
if (!existsSync(canonicalCiPath)) {
  fail(`${canonicalCiPath} is missing`);
} else {
  const canonicalCi = readFileSync(canonicalCiPath, "utf8");
  if (!/^\s*run:\s*pnpm check:physical-acceptance\s*$/mu.test(canonicalCi)) {
    fail("ci.yml does not enforce the physical acceptance package gate");
  }
  if (!/^\s*run:\s*pnpm check:write-path-integrity\s*$/mu.test(canonicalCi)) {
    fail("ci.yml does not enforce device write-path integrity");
  }

  if (!/^\s*run:\s*pnpm check:ui-honesty\s*$/mu.test(canonicalCi)) {
    fail("ci.yml does not enforce interface honesty");
  }

  // The Pages deploy runs the tests with VITE_BUILD_SHA set for the whole job.
  // CI must exercise that same shape, or a pinned-build failure first appears
  // during a deploy rather than on the pull request.
  if (
    !/VITE_BUILD_SHA: \$\{\{ github\.sha \}\}[\s\S]*?run: pnpm test/u.test(
      canonicalCi,
    )
  ) {
    fail("ci.yml does not run the test suite against a pinned build identity");
  }

  // Browser QA is the only thing that can make a BROWSER_VERIFIED claim. If it
  // stops running, every such claim in the matrix becomes unsupported.
  if (!canonicalCi.includes("pnpm qa:browser")) {
    fail("ci.yml does not run browser QA against the shipped build");
  }
  if (!canonicalCi.includes("playwright install")) {
    fail("ci.yml does not install the browser QA runtime");
  }
  if (!canonicalCi.includes("VITE_BUILD_SHA: ${{ github.sha }}")) {
    fail("ci.yml does not bind the Pages artifact to github.sha");
  }
  if (!/^\s*pnpm check:pages-build\s*$/mu.test(canonicalCi)) {
    fail("ci.yml does not verify the exact Pages artifact");
  }
  if (
    /actions\/deploy-pages|pages:\s*write|id-token:\s*write/u.test(canonicalCi)
  ) {
    fail("ci.yml must remain a read-only PR workflow without deploy authority");
  }
}

const pagesWorkflowPath = ".github/workflows/deploy-pages.yml";
if (!existsSync(pagesWorkflowPath)) {
  fail(`${pagesWorkflowPath} is missing`);
} else {
  const pagesWorkflow = readFileSync(pagesWorkflowPath, "utf8");
  const triggerBlock = /\non:\n([\s\S]*?)\npermissions:/u.exec(
    pagesWorkflow,
  )?.[1];
  const triggerNames = [
    ...(triggerBlock ?? "").matchAll(/^\s{2}([a-z_]+):/gmu),
  ].map((match) => match[1]);
  if (
    triggerBlock === undefined ||
    !/^\s{2}push:\n\s{4}branches:\n\s{6}- main\s*$/mu.test(triggerBlock) ||
    triggerNames.length !== 2 ||
    triggerNames[0] !== "push" ||
    triggerNames[1] !== "workflow_dispatch"
  ) {
    fail(
      "deploy-pages.yml must be limited to main pushes or manual main dispatch, never a PR",
    );
  }
  if (!pagesWorkflow.includes("if: github.ref == 'refs/heads/main'")) {
    fail("deploy-pages.yml build job is not fail-closed to refs/heads/main");
  }
  if (!pagesWorkflow.includes("VITE_BUILD_SHA: ${{ github.sha }}")) {
    fail("deploy-pages.yml does not bind the artifact to github.sha");
  }
  if (!/^\s*run:\s*pnpm check:pages-build\s*$/mu.test(pagesWorkflow)) {
    fail("deploy-pages.yml does not verify the exact artifact before upload");
  }
}

// The signer holds the one permanent signing key, so the shape of its shell is
// part of the security boundary rather than a style question. Each rule below
// corresponds to a defect that was actually present in this file.
const signerPath = ".github/workflows/android-physical-test-signer.yml";
if (!existsSync(signerPath)) {
  fail(`${signerPath} is missing`);
} else {
  const signer = readFileSync(signerPath, "utf8");

  // 1. No GitHub expression inside a `run:` block.
  //
  //    Actions substitutes `${{ … }}` into the script text before any shell
  //    parses it, so a value carrying `$(…)` becomes a command in the job that
  //    holds the key. Values belong in `env:`, where a substituted `$(…)`
  //    is the variable's contents and never a command. Two of these were here:
  //    `github.run_id` in a URL, and four `inputs.*` in a JSON heredoc — and
  //    the heredoc was unquoted, so it really did evaluate command
  //    substitutions.
  for (const block of signer.matchAll(/^ {8}run: \|\n((?: {10}.*\n|\n)*)/gmu)) {
    const expression = /\$\{\{[^}]*\}\}/u.exec(block[1] ?? "");
    if (expression !== null) {
      fail(
        `${signerPath} interpolates ${expression[0]} into a run block; pass it through env: instead`,
      );
    }
  }

  // 2. The provenance record is serialised, not concatenated.
  //
  //    `versionName` is read out of an APK built from pull-request code. In a
  //    document assembled by pasting strings, a quote in it rewrites the
  //    record that ties a tester's phone to a tree.
  if (/cat > "\$SIGNED\.provenance\.json" <</u.test(signer)) {
    fail(
      `${signerPath} writes the signed provenance with a heredoc; it must be produced by a JSON encoder`,
    );
  }

  // 3. A failed `apksigner` is not evidence of an unsigned APK.
  //
  //    `apksigner verify` exits non-zero for a missing file, an unreadable
  //    zip or a JVM that would not start. Accepting any non-zero status as
  //    "no signature found" lets a broken toolchain hand an APK to the key.
  if (
    /if\s+"\$apksigner"\s+verify\s+"\$apk"\s+>\/dev\/null\s+2>&1;\s+then/u.test(
      signer,
    )
  ) {
    fail(
      `${signerPath} treats any non-zero apksigner status as proof the APK is unsigned`,
    );
  }
  if (
    !signer.includes(
      "DOES NOT VERIFY|No JAR signature|Missing (APK Signature Scheme|META-INF)|not signed",
    )
  ) {
    fail(
      `${signerPath} does not read apksigner's own statement that the APK carries no signature`,
    );
  }

  // 4. The filename AGP actually writes.
  //
  //    AGP appends `-unsigned` precisely when no signing config was applied,
  //    so the name is itself the claim being checked. The candidate build
  //    looked for the wrong one and died silently at `test -f` under `set -e`
  //    for two rounds; the signer carried the same mistake.
  if (/RUNNER_TEMP\/candidate\/app-physicalTest\.apk/u.test(signer)) {
    fail(
      `${signerPath} looks for app-physicalTest.apk; the candidate build writes app-physicalTest-unsigned.apk`,
    );
  }
  if (/RUNNER_TEMP\/candidate\/app-physicalTest-unsigned\.apk/u.test(signer)) {
    fail(
      `${signerPath} looks for the unsigned APK at the artifact root; upload-artifact preserves its app/build/outputs path`,
    );
  }
  if (
    !/node scripts\/verify-unsigned-candidate-layout\.mjs \\\s*"\$RUNNER_TEMP\/candidate"/u.test(
      signer,
    )
  ) {
    fail(
      `${signerPath} does not verify the candidate artifact's exact layout before selecting the APK`,
    );
  }

  // 5. Bounded formats for everything a candidate controls.
  for (const [what, pattern] of [
    ["source_sha", /source_sha must be a full 40-character lowercase SHA/u],
    [
      "expected_apk_sha256",
      /expected_apk_sha256 must be a 64-character lowercase SHA-256/u,
    ],
    ["source_run_id", /source_run_id must be numeric/u],
    ["artifact_id", /artifact_id must be numeric/u],
    ["artifact_name", /artifact_name must be a plain artifact name/u],
    ["versionCode", /APK versionCode is not a plain number/u],
    ["versionName", /APK versionName is not a plain version string/u],
  ]) {
    if (!pattern.test(signer)) {
      fail(`${signerPath} does not bound the format of ${what}`);
    }
  }

  // 6. The build-tools that sign are the ones the workflow asked for, not
  //    whatever happens to be newest on the runner image. apksigner's
  //    signature-scheme defaults move between versions.
  if (/ls -1 "\$ANDROID_HOME\/build-tools"/u.test(signer)) {
    fail(
      `${signerPath} picks build-tools by listing the directory; pin the version instead`,
    );
  }
}

// Stage 3 is deliberately weaker than the production signer in one direction
// (its generated key is disposable) and stricter in another (no APK may leave
// the runner). Keep that distinction structural rather than dependent on a
// label in the Actions UI.
const rehearsalPath = ".github/workflows/android-physical-test-rehearsal.yml";
if (!existsSync(rehearsalPath)) {
  fail(`${rehearsalPath} is missing`);
} else {
  const rehearsal = readFileSync(rehearsalPath, "utf8");
  try {
    verifyDisposableRehearsalWorkflow(rehearsal);
  } catch (error) {
    for (const problem of error.message.split("\n")) {
      fail(`${rehearsalPath}: ${problem}`);
    }
  }

  function replaceRehearsalOnce(source, before, after) {
    if (!source.includes(before)) {
      fail(`rehearsal mutation anchor is missing: ${JSON.stringify(before)}`);
      return source;
    }
    return source.replace(before, after);
  }

  function expectRehearsalWorkflowRejection(name, mutate, expectedMessage) {
    try {
      verifyDisposableRehearsalWorkflow(mutate(rehearsal));
      fail(`rehearsal-workflow boundary accepted ${name}`);
    } catch (error) {
      if (!expectedMessage.test(error.message)) {
        fail(
          `rehearsal-workflow boundary rejected ${name} for the wrong reason: ${error.message}`,
        );
      }
    }
  }

  expectRehearsalWorkflowRejection(
    "push-trigger",
    (source) =>
      replaceRehearsalOnce(source, "  workflow_dispatch:\n", "  push:\n"),
    /workflow_dispatch as its only trigger/u,
  );
  expectRehearsalWorkflowRejection(
    "permanent-environment",
    (source) =>
      replaceRehearsalOnce(
        source,
        "environment: physical-test-signing-rehearsal",
        "environment: physical-test-signing",
      ),
    /separate protected environment|permanent signing environment/u,
  );
  expectRehearsalWorkflowRejection(
    "permanent-secret-reference",
    (source) => source + "\n# ${{ secrets.ELRS_KEYSTORE_BASE64 }}\n",
    /must not name or read a signing secret/u,
  );
  expectRehearsalWorkflowRejection(
    "candidate-checkout",
    (source) =>
      replaceRehearsalOnce(
        source,
        "ref: ${{ github.sha }}",
        "ref: ${{ inputs.source_sha }}",
      ),
    /pinned to github\.sha|caller-supplied ref/u,
  );
  expectRehearsalWorkflowRejection(
    "missing-stage2-verifier",
    (source) =>
      replaceRehearsalOnce(
        source,
        "verify-stage2-rehearsal-source.mjs",
        "stage2-source-not-verified.mjs",
      ),
    /does not verify the completed Stage 2 run/u,
  );
  expectRehearsalWorkflowRejection(
    "network-after-key-generation",
    (source) =>
      replaceRehearsalOnce(
        source,
        "- name: Align and sign the disposable copy",
        "- name: Unsafe network after key\n        run: curl https://example.invalid\n\n      - name: Align and sign the disposable copy",
      ),
    /network access remains after the disposable key exists/u,
  );
  expectRehearsalWorkflowRejection(
    "action-while-key-exists",
    (source) =>
      replaceRehearsalOnce(
        source,
        "- name: Align and sign the disposable copy",
        "- name: Unsafe action after key\n        uses: example/action@0000000000000000000000000000000000000000\n\n      - name: Align and sign the disposable copy",
      ),
    /third-party action runs while the disposable key exists/u,
  );
  expectRehearsalWorkflowRejection(
    "cleanup-without-shred",
    (source) => source.replaceAll("shred -u", "rm -f"),
    /cleanup is missing "shred -u"/u,
  );
  expectRehearsalWorkflowRejection(
    "unproven-key-destruction",
    (source) =>
      replaceRehearsalOnce(
        source,
        'if (field("KEY_DESTROYED") !== "true")',
        'if (field("KEY_DESTROYED") !== "false")',
      ),
    /does not refuse missing disposable-key destruction/u,
  );
  expectRehearsalWorkflowRejection(
    "published-apk",
    (source) =>
      replaceRehearsalOnce(
        source,
        "${{ runner.temp }}/stage3-disposable.apksigner.txt",
        "${{ runner.temp }}/stage3-disposable.apksigner.txt\n            ${{ runner.temp }}/STAGE3-DISPOSABLE-DO-NOT-INSTALL.apk",
      ),
    /proof artifact path includes an APK/u,
  );
  expectRehearsalWorkflowRejection(
    "production-artifact-name",
    (source) =>
      replaceRehearsalOnce(
        source,
        "REHEARSAL-PROOF-ONLY-NO-APK-${{ inputs.source_sha }}",
        "elrs-android-physicaltest-signed-${{ inputs.source_sha }}",
      ),
    /not unmistakably named|production signed-artifact namespace/u,
  );
}

// The Stage 2 run is expected to be red only because the key is absent. Prove
// that the verifier rejects every materially different history before Stage 3
// is allowed to manufacture even a disposable signature.
const stage2RunId = "4001";
const stage2ArtifactId = "5001";
const stage2SignerSha = "a".repeat(40);
const stage2SourceSha = "b".repeat(40);
const stage2Fixture = {
  run: {
    id: Number(stage2RunId),
    repository: { full_name: "FPVARABIC/example" },
    path: ".github/workflows/android-physical-test-signer.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "failure",
    head_branch: "main",
    head_sha: stage2SignerSha,
    run_attempt: 1,
  },
  jobs: {
    jobs: [
      {
        name: "Verify the candidate, with no secrets present",
        conclusion: "success",
        run_id: Number(stage2RunId),
        head_sha: stage2SignerSha,
        steps: [
          {
            name: "Pass the verified candidate to the signing job",
            conclusion: "success",
          },
        ],
      },
      {
        name: "Sign the verified candidate",
        conclusion: "failure",
        run_id: Number(stage2RunId),
        head_sha: stage2SignerSha,
        steps: [
          {
            name: "Re-confirm the digest immediately before signing",
            conclusion: "success",
          },
          {
            name: "Materialise the signing keystore",
            conclusion: "failure",
          },
          { name: "Align and sign", conclusion: "skipped" },
          {
            name: "Verify the signature and the certificate fingerprint",
            conclusion: "skipped",
          },
          { name: "Write the signed provenance", conclusion: "skipped" },
          { name: "Publish the signed candidate", conclusion: "skipped" },
          { name: "Destroy the keystore", conclusion: "success" },
        ],
      },
    ],
  },
  artifact: {
    id: Number(stage2ArtifactId),
    name: `verified-unsigned-${stage2SourceSha}`,
    expired: false,
    workflow_run: { id: Number(stage2RunId) },
  },
  oldSigner: { sha: "trusted-signer-blob" },
  currentSigner: { sha: "trusted-signer-blob" },
  repository: "FPVARABIC/example",
  stage2RunId,
  stage2ArtifactId,
  stage2SignerSha,
  sourceSha: stage2SourceSha,
  defaultBranch: "main",
};

verifyStage2RehearsalSource(stage2Fixture);

function expectStage2SourceRejection(name, mutate, expectedMessage) {
  const fixture = structuredClone(stage2Fixture);
  mutate(fixture);
  try {
    verifyStage2RehearsalSource(fixture);
    fail(`Stage 2 source verifier accepted ${name}`);
  } catch (error) {
    if (!expectedMessage.test(error.message)) {
      fail(
        `Stage 2 source verifier rejected ${name} for the wrong reason: ${error.message}`,
      );
    }
  }
}

expectStage2SourceRejection(
  "a green signer run",
  (fixture) => (fixture.run.conclusion = "success"),
  /run conclusion/u,
);
expectStage2SourceRejection(
  "another workflow",
  (fixture) => (fixture.run.path = ".github/workflows/other.yml"),
  /run workflow path/u,
);
expectStage2SourceRejection(
  "an expired artifact",
  (fixture) => (fixture.artifact.expired = true),
  /artifact has expired/u,
);
expectStage2SourceRejection(
  "a failed verification job",
  (fixture) => (fixture.jobs.jobs[0].conclusion = "failure"),
  /verify job conclusion/u,
);
expectStage2SourceRejection(
  "a key that materialised",
  (fixture) =>
    (fixture.jobs.jobs[1].steps.find(
      (step) => step.name === "Materialise the signing keystore",
    ).conclusion = "success"),
  /missing-secret stop/u,
);
expectStage2SourceRejection(
  "a signed candidate",
  (fixture) =>
    (fixture.jobs.jobs[1].steps.find(
      (step) => step.name === "Align and sign",
    ).conclusion = "success"),
  /Align and sign step/u,
);
expectStage2SourceRejection(
  "failed cleanup",
  (fixture) =>
    (fixture.jobs.jobs[1].steps.find(
      (step) => step.name === "Destroy the keystore",
    ).conclusion = "failure"),
  /keystore cleanup/u,
);
expectStage2SourceRejection(
  "changed signer source",
  (fixture) => (fixture.currentSigner.sha = "changed-signer-blob"),
  /signer blob/u,
);
expectStage2SourceRejection(
  "an extra job",
  (fixture) => fixture.jobs.jobs.push({ name: "Unexpected" }),
  /total Stage 2 jobs/u,
);

const stage2LayoutRoot = mkdtempSync(join(tmpdir(), "elrs-stage2-layout-"));
function writeStage2Layout(root) {
  writeFileSync(join(root, STAGE2_APK_RELATIVE_PATH), "verified-unsigned");
  writeFileSync(join(root, STAGE2_MANIFEST_RELATIVE_PATH), "{}");
}
try {
  writeStage2Layout(stage2LayoutRoot);
  verifyStage2ArtifactLayout(stage2LayoutRoot);
  writeFileSync(join(stage2LayoutRoot, "unexpected.apk"), "ambiguous");
  try {
    verifyStage2ArtifactLayout(stage2LayoutRoot);
    fail("Stage 2 layout verifier accepted a second APK");
  } catch (error) {
    if (!/expected exactly/u.test(error.message)) {
      fail(
        `Stage 2 layout verifier rejected the second APK incorrectly: ${error.message}`,
      );
    }
  }
} finally {
  rmSync(stage2LayoutRoot, { recursive: true, force: true });
}

// The first live rehearsal exposed a contract mismatch that a source-only
// check could not: upload-artifact preserved the APK below app/build/outputs,
// while the signer looked only at the extraction root. Exercise the same
// resolver the workflow invokes against both the real layout and the ways a
// candidate could otherwise make an ambiguous or misleading archive.
const layoutProbeRoot = mkdtempSync(join(tmpdir(), "elrs-signer-layout-"));

function writeValidCandidateLayout(root) {
  const apk = join(root, ...UNSIGNED_APK_RELATIVE_PATH.split("/"));
  mkdirSync(dirname(apk), { recursive: true });
  writeFileSync(apk, "unsigned-apk-fixture");
  writeFileSync(join(root, UNSIGNED_MANIFEST_RELATIVE_PATH), "{}");
}

function expectLayoutRejection(name, mutate, expectedMessage) {
  const root = join(layoutProbeRoot, name);
  mkdirSync(root, { recursive: true });
  writeValidCandidateLayout(root);
  mutate(root);
  try {
    verifyUnsignedCandidateLayout(root);
    fail(`candidate-layout check accepted ${name}`);
  } catch (error) {
    if (!expectedMessage.test(error.message)) {
      fail(
        `candidate-layout check rejected ${name} for the wrong reason: ${error.message}`,
      );
    }
  }
}

try {
  const validRoot = join(layoutProbeRoot, "valid");
  mkdirSync(validRoot, { recursive: true });
  writeValidCandidateLayout(validRoot);
  const valid = verifyUnsignedCandidateLayout(validRoot);
  if (
    valid.apk !== join(validRoot, ...UNSIGNED_APK_RELATIVE_PATH.split("/")) ||
    valid.manifest !== join(validRoot, UNSIGNED_MANIFEST_RELATIVE_PATH)
  ) {
    fail("candidate-layout check did not resolve the producer's exact paths");
  }

  expectLayoutRejection(
    "flattened-apk",
    (root) => {
      rmSync(join(root, ...UNSIGNED_APK_RELATIVE_PATH.split("/")));
      writeFileSync(join(root, "app-physicalTest-unsigned.apk"), "wrong-place");
    },
    /not app\/build\/outputs\/apk\/physicalTest/u,
  );
  expectLayoutRejection(
    "two-apks",
    (root) => writeFileSync(join(root, "second.apk"), "ambiguous"),
    /expected exactly one APK, found 2/u,
  );
  expectLayoutRejection(
    "missing-manifest",
    (root) => rmSync(join(root, UNSIGNED_MANIFEST_RELATIVE_PATH)),
    /contains no app-physicalTest-unsigned\.provenance\.json/u,
  );
  expectLayoutRejection(
    "extra-file",
    (root) => writeFileSync(join(root, "candidate-script.sh"), "echo unsafe"),
    /contains unexpected file/u,
  );
  expectLayoutRejection(
    "symlink",
    (root) => {
      const manifest = join(root, UNSIGNED_MANIFEST_RELATIVE_PATH);
      rmSync(manifest);
      symlinkSync(
        join(root, ...UNSIGNED_APK_RELATIVE_PATH.split("/")),
        manifest,
      );
    },
    /symbolic links are forbidden/u,
  );
} finally {
  rmSync(layoutProbeRoot, { recursive: true, force: true });
}

const serialPath = "apps/web/src/hardware/serial.ts";
if (!existsSync(serialPath)) {
  fail(`${serialPath} is missing`);
} else {
  const serial = readFileSync(serialPath, "utf8");
  if (!serial.includes("EXPRESSLRS_CRSF_BAUD_RATE = 420_000")) {
    fail("the direct CRSF transport is not fixed at 420000 baud");
  }
  if (/EXPRESSLRS_CRSF_BAUD_RATE\s*=\s*115_?200/u.test(serial)) {
    fail("the direct CRSF transport regressed to 115200 baud");
  }
}

if (process.exitCode === 1) process.exit(1);
console.log(
  `✓ CI hygiene passed (${[...allowedWorkflows].join(", ")}; one canonical hardware workbench)`,
);
