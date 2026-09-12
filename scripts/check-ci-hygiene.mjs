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

// Each entry is a reviewed workflow. A new file here is a deliberate decision,
// not something that appears by accident:
//   ci.yml            the quality, license and security gates
//   deploy-pages.yml  the GitHub Pages deploy
//   upstream-live.yml the opt-in live suites against the official mirror
//   android.yml       the Android host APK, lint and unit tests
//   android-physical-test-signer.yml
//                     the trusted post-build signer, which holds the one
//                     permanent signing key
const allowedWorkflows = new Set([
  "ci.yml",
  "deploy-pages.yml",
  "upstream-live.yml",
  "android.yml",
  // The signer is authored and merged on the default branch, which is the
  // only place GitHub will dispatch a `workflow_dispatch` workflow from. It
  // reaches a candidate branch only by merging main into it, so its presence
  // here is not by itself a finding. What the signer boundary now rests on is
  // checked below, against this file's contents rather than its absence: it is
  // the only workflow allowed to name the permanent secrets, it stays
  // manual-only and read-only, the job holding the key is gated by a protected
  // environment, and it never checks out a candidate commit or runs a build
  // tool. See docs/ANDROID_SIGNING.md.
  "android-physical-test-signer.yml",
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

/** Strips block and line comments so a rule tests code, not prose about it. */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
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

  const livePath = ".github/workflows/upstream-live.yml";
  if (!existsSync(livePath)) {
    fail(
      "upstream-live.yml is missing; the live mirror suites would never run",
    );
  } else {
    const live = readFileSync(livePath, "utf8");
    if (!/EXPRESSLRS_LIVE_CATALOG:\s*"1"/u.test(live)) {
      fail("upstream-live.yml does not enable the live catalog suites");
    }
    if (!/capture-upstream-manifest\.mjs/u.test(live)) {
      fail("upstream-live.yml does not record what upstream served");
    }
  }

  // The corrective-review gates: Arabic left in the English interface, a pinned
  // locale or direction, a build-stage lock, a dead control, rx-as-tx conflated
  // with AirPort, or success claimed without verification.
  if (!/^\s*run:\s*pnpm check:ui-reality\s*$/mu.test(canonicalCi)) {
    fail("ci.yml does not enforce interface reality");
  }

  // Proves every driver is reachable from the shipped entry point, and that no
  // module resembling a global write switch is in that graph.
  if (!/^\s*run:\s*pnpm check:reachability\s*$/mu.test(canonicalCi)) {
    fail("ci.yml does not enforce production reachability");
  }

  // Reachability is static; this is the runtime half. Without it, an operation
  // whose readiness expression evaluates false forever would pass every gate.
  if (!/^\s*run:\s*pnpm check:availability\s*$/mu.test(canonicalCi)) {
    fail("ci.yml does not enforce runtime availability");
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

// The Android host is a WebView that can rewrite a transmitter's firmware. The
// properties below are what stop it being a general-purpose browser with USB
// access, and every one of them is a single edit away from being lost.
const androidWorkflowPath = ".github/workflows/android.yml";
if (!existsSync(androidWorkflowPath)) {
  fail(`${androidWorkflowPath} is missing`);
} else {
  const androidWorkflow = readFileSync(androidWorkflowPath, "utf8");
  if (!/connectedDebugAndroidTest/u.test(androidWorkflow)) {
    fail(
      "android.yml does not run the instrumentation suite; the bridge and WebView rules would go unexecuted",
    );
  }
  // The APK bundles the web build. Without this step Gradle fails loudly, but
  // the failure would be a mystery rather than a missing step.
  if (!/^\s*run: pnpm build\s*$/mu.test(androidWorkflow)) {
    fail("android.yml does not build the web application before Gradle");
  }
  if (!/verify --print-certs/u.test(androidWorkflow)) {
    fail("android.yml does not record the APK signing certificate");
  }
  if (!/source-identity\.json/u.test(androidWorkflow)) {
    fail("android.yml does not record the embedded web and native source SHAs");
  }
  // Recording the embedded digests is not the same as checking them. The
  // Gradle task writes the literal "absent" rather than failing when a digest
  // has nothing to hash, so without this assertion an APK can be published
  // whose provenance names nothing — and the whole point of the record is that
  // a result from a phone can be traced back to a tree.
  if (!/\^\[0-9a-f\]\{64\}\$/u.test(androidWorkflow)) {
    fail(
      'android.yml does not assert the embedded source digests are real; an APK whose provenance reads "absent" would publish',
    );
  }
}

// The durable-recovery invariants. Each of these was a real gap: a recovery
// copy that only lived inside the application, a file input that silently did
// nothing on this host, and a half-written archive left behind looking whole.
const durableRules = [
  [
    "apps/web/src/hardware/useDeviceController.ts",
    /durableRecoveryVerified,\s*$/mu,
    "the firmware write is not gated on a verified durable recovery copy",
  ],
  [
    "apps/web/src/hardware/durable-recovery.ts",
    /exportDurableRecovery/u,
    "the durable recovery export is missing",
  ],
  [
    `${"android/app/src/main/java/com/fpvarabic/elrs/bridge"}/MainActivity.kt`,
    // The signature and the assignment, not just the name: a substring match
    // would pass a method renamed to something inert.
    /webChromeClient\s*=[\s\S]*override fun onShowFileChooser\(/u,
    "the host registers no file chooser, so every file input in the application would silently do nothing",
  ],
  [
    `${"android/app/src/main/java/com/fpvarabic/elrs/bridge"}/BridgeCore.kt`,
    /documents\.abandon\(\)/u,
    "a backgrounded or destroyed host does not abandon a half-written document",
  ],
];
for (const [path, pattern, complaint] of durableRules) {
  if (!existsSync(path)) {
    fail(`${path} is missing`);
    continue;
  }
  if (!pattern.test(readFileSync(path, "utf8"))) fail(`${path}: ${complaint}`);
}

// ---------------------------------------------------------------------------
// The signing boundary.
//
// The earlier design put the permanent signing key in its own workflow and
// relied on only that workflow naming the secrets. That is not sufficient
// isolation. The workflow checked out the candidate commit and ran Gradle
// while the key was in the environment, so candidate build scripts, plugins,
// dependencies and any shell step could read it — the key Android accepts as
// an update to an application holding USB write authority over flight
// hardware.
//
// So the boundary moved. No workflow in this repository may reference those
// secrets at all; the candidate build produces an *unsigned* APK, and a
// separate trusted workflow on the default branch signs that artifact
// afterwards without ever checking out a candidate commit or running Gradle.
// These are the rules that keep it that way, gated rather than documented
// because the mistake is one line of YAML away and invisible in review.
// ---------------------------------------------------------------------------
const signingSecretPattern = /secrets\.ELRS_(?:KEYSTORE|KEY)_[A-Z0-9_]+/u;

// 1. Exactly one workflow may name the permanent secrets, and it is the
//    reviewed signer. Every other workflow in this repository — the candidate
//    build above all — must be unable to read the key even by accident.
const trustedSignerName = "android-physical-test-signer.yml";
for (const name of readdirSync(workflowDirectory)) {
  if (name === trustedSignerName) continue;
  const contents = readFileSync(`${workflowDirectory}/${name}`, "utf8");
  if (signingSecretPattern.test(contents)) {
    fail(
      `${name} references a permanent signing secret. Only ${trustedSignerName} ` +
        "may: it is the one reviewed place those secrets are readable, and it " +
        "runs no candidate code. See docs/ANDROID_SIGNING.md",
    );
  }
}

// 2. That exemption is only safe while the signer keeps the shape it was
//    reviewed with, so the shape is gated here rather than trusted.
//
//    This used to be a different rule. The signer lived only on the default
//    branch, and this file failed if it appeared on a candidate branch at all,
//    because "pull-request code cannot reach the key" then followed from its
//    absence. That is no longer how the boundary is held: the signer is merged
//    on main and therefore reaches every branch that merges main. What still
//    holds it is that a `workflow_dispatch` workflow is only dispatchable from
//    the default branch, and that the file itself cannot read candidate code.
//    Each clause below is one half of that second claim.
const trustedSignerPath = `${workflowDirectory}/${trustedSignerName}`;
if (!existsSync(trustedSignerPath)) {
  fail(
    `${trustedSignerPath} is missing. The trusted signer is the only path to a ` +
      "signed physical-test APK; see docs/ANDROID_SIGNING.md",
  );
} else {
  const trustedSigner = readFileSync(trustedSignerPath, "utf8");
  // YAML comments explain the boundary at length; the rules must read the
  // workflow, not the prose about it.
  const signerYaml = trustedSigner.replace(/^[ \t]*#.*$/gmu, "");

  //    a. Manual only. A `push:`, `pull_request:` or `schedule:` trigger would
  //       put the key behind an event a candidate branch can raise.
  const signerTriggers = [
    ...(/\non:\n([\s\S]*?)\n[a-z]/u.exec(signerYaml)?.[1] ?? "").matchAll(
      /^ {2}([a-z_]+):/gmu,
    ),
  ].map((match) => match[1]);
  if (
    signerTriggers.length !== 1 ||
    signerTriggers[0] !== "workflow_dispatch"
  ) {
    fail(
      `${trustedSignerName} must be triggered by workflow_dispatch alone; found ` +
        `${signerTriggers.join(", ") || "no trigger"}`,
    );
  }

  //    b. No write authority anywhere in it. The signer publishes nothing and
  //       pushes nothing; a `write` scope here is how a leak leaves the runner.
  const signerWriteScope = /^\s+[a-z-]+:\s*write\s*$/mu.exec(signerYaml);
  if (signerWriteScope !== null) {
    fail(
      `${trustedSignerName} grants ${signerWriteScope[0].trim()}; the signer must ` +
        "stay read-only",
    );
  }
  if (!/^permissions:\n {2}contents: read\n/mu.test(signerYaml)) {
    fail(
      `${trustedSignerName} does not declare a read-only top-level permissions block`,
    );
  }

  //    c. The key is materialised only inside a protected environment, and only
  //       after the verify job has already accepted the artifact.
  if (!/^ {4}environment: physical-test-signing$/mu.test(signerYaml)) {
    fail(
      `${trustedSignerName} does not gate the signing job on the ` +
        "physical-test-signing environment",
    );
  }
  if (!/^ {4}needs: verify$/mu.test(signerYaml)) {
    fail(
      `${trustedSignerName} signs without waiting for the unprivileged verify job`,
    );
  }

  //    d. It never checks out the candidate. Every checkout pins the signer's
  //       own commit, so no pull-request tree is ever on the runner's disk.
  const signerCheckouts = [
    ...signerYaml.matchAll(
      /uses: actions\/checkout@[^\n]*\n((?: {8,}.*\n)*)/gu,
    ),
  ];
  if (signerCheckouts.length === 0) {
    fail(`${trustedSignerName} has no pinned checkout to audit`);
  }
  for (const checkout of signerCheckouts) {
    if (!/^ {10}ref: \$\{\{ github\.sha \}\}$/mu.test(checkout[1] ?? "")) {
      fail(
        `${trustedSignerName} checks out a ref other than its own github.sha; the ` +
          "signer must never place candidate code on the runner",
      );
    }
  }

  //    e. It runs no build tool. Gradle, pnpm and npm all execute code that
  //       came from the tree they build; none of them may run beside the key.
  for (const tool of ["gradle", "gradlew", "pnpm", "npm", "yarn"]) {
    const invocation = new RegExp(
      `^\\s+(?:-\\s+)?(?:run|uses):.*\\b${tool}\\b`,
      "mu",
    );
    if (invocation.test(signerYaml)) {
      fail(
        `${trustedSignerName} invokes ${tool}; the signer must run no build tool ` +
          "beside the key",
      );
    }
  }
}

// 3. Gradle must actively refuse the permanent secrets rather than merely not
//    ask for them. This is the mechanism that turns the policy into a build
//    failure if a workflow edit ever exposes them.
const gradleBuildPath = "android/app/build.gradle.kts";
const gradleBuild = readFileSync(gradleBuildPath, "utf8");
for (const secret of [
  "ELRS_KEYSTORE_BASE64",
  "ELRS_KEYSTORE_PASSWORD",
  "ELRS_KEY_ALIAS",
  "ELRS_KEY_PASSWORD",
]) {
  if (!gradleBuild.includes(secret)) {
    fail(
      `${gradleBuildPath} does not name ${secret} in the set it refuses to ` +
        "build with, so a leak of it into the environment would go unnoticed",
    );
  }
}
if (
  !/throw GradleException\([\s\S]*permanent signing secrets/u.test(gradleBuild)
) {
  fail(
    `${gradleBuildPath} does not fail the build when a permanent signing ` +
      "secret is present in the environment",
  );
}
// And it must configure no signing identity other than the disposable one the
// update-persistence test generates and shreds. Read out of the
// `signingConfigs` block by brace matching rather than by proximity: a
// character-distance rule would false-positive on the `physicalTest` *build
// type* further down the file, which is a different and legitimate thing.
const signingConfigsStart = gradleBuild.indexOf("signingConfigs {");
if (signingConfigsStart === -1) {
  fail(`${gradleBuildPath} has no signingConfigs block to inspect`);
} else {
  let depth = 0;
  let end = signingConfigsStart;
  for (
    let at = gradleBuild.indexOf("{", signingConfigsStart);
    at < gradleBuild.length;
    at += 1
  ) {
    if (gradleBuild[at] === "{") depth += 1;
    else if (gradleBuild[at] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = at;
        break;
      }
    }
  }
  const block = gradleBuild.slice(signingConfigsStart, end + 1);
  const configured = [...block.matchAll(/create\("([^"]+)"\)/gu)].map(
    (match) => match[1],
  );
  for (const name of configured) {
    if (name !== "disposableTest") {
      fail(
        `${gradleBuildPath} configures the signing identity "${name}". The ` +
          "candidate build must be unsigned; only the disposable test key the " +
          "update-persistence job generates and shreds may be configured here",
      );
    }
  }
}
if (/resolvePhysicalTestSigning/u.test(gradleBuild)) {
  fail(`${gradleBuildPath} still resolves a permanent physical-test keystore`);
}

// 4. The candidate build must produce an unsigned physical-test APK, prove it
//    is unsigned, and publish a machine-readable provenance manifest — those
//    are the signer's only inputs, so a missing one means an unsignable or
//    untraceable candidate.
const androidWorkflow = readFileSync(
  `${workflowDirectory}/android.yml`,
  "utf8",
);
for (const [pattern, complaint] of [
  [/assemblePhysicalTest/u, "does not build the physical-test candidate"],
  // Keyed on the exact guard forms, not on the step's prose and not on a name
  // that appears in several unrelated places. Two earlier versions of these
  // rules were wrong in opposite directions: the first matched a sentence, so
  // rewording the step broke it; the second matched a file name common to the
  // manifest and the upload path, so deleting the assertion did not trip it.
  [
    /!= "app-physicalTest-unsigned\.apk"/u,
    "does not assert the candidate's file name, which is the cheapest evidence that no signing config was applied",
  ],
  [
    /if "\$apksigner" verify "\$apk" >\/dev\/null 2>&1; then/u,
    "does not ask apksigner whether the candidate carries a valid signature",
  ],
  [
    /app-physicalTest-unsigned\.provenance\.json/u,
    "publishes no provenance manifest beside the unsigned candidate",
  ],
]) {
  if (!pattern.test(androidWorkflow)) {
    fail(`android.yml ${complaint}`);
  }
}
for (const field of [
  "sourceSha",
  "runId",
  "artifactName",
  "apkSha256",
  "applicationId",
  "versionCode",
  "versionName",
  "webBuildSha256",
  "nativeSourceSha256",
]) {
  if (!androidWorkflow.includes(`"${field}"`)) {
    fail(
      `android.yml's candidate provenance manifest omits ${field}, which the ` +
        "trusted signer verifies before it signs anything",
    );
  }
}

// 5. The Gradle blocks the host cannot build without.
//
//    Added after a slice-based edit to `build.gradle.kts` silently deleted
//    `sourceSets` and `buildFeatures` — the first bundles the web application
//    into the APK, the second generates `BuildConfig`, which `MainActivity`
//    reads to decide whether WebView debugging is allowed. Neither failure is
//    visible in review or reproducible without an Android toolchain, so both
//    reached CI. These are cheap to assert and expensive to lose.
for (const [pattern, complaint] of [
  [
    /buildConfig = true/u,
    "does not generate BuildConfig, which MainActivity reads",
  ],
  [
    /assets\.srcDir\(layout\.buildDirectory\.dir\("generated\/webAssets"\)\)/u,
    "does not bundle the built web application into the APK",
  ],
  [
    /assets\.srcDir\(layout\.buildDirectory\.dir\("generated\/identity"\)\)/u,
    "does not bundle the source-identity asset, so the APK loses its provenance",
  ],
]) {
  if (!pattern.test(gradleBuild)) {
    fail(`${gradleBuildPath} ${complaint}`);
  }
}

// 6. And the keystore itself is never in the tree.
for (const name of readdirSync("android/signing")) {
  if (/\.(jks|keystore|p12|pfx|pem|key)$/iu.test(name)) {
    fail(
      `android/signing/${name} looks like key material and must not be committed`,
    );
  }
}

const androidSourceRoot = "android/app/src/main/java/com/fpvarabic/elrs/bridge";
const hostActivityPath = `${androidSourceRoot}/MainActivity.kt`;
if (!existsSync(hostActivityPath)) {
  fail(`${hostActivityPath} is missing`);
} else {
  const hostActivity = readFileSync(hostActivityPath, "utf8");
  const hardening = [
    ["allowFileAccess = false", "file access is not disabled"],
    ["allowContentAccess = false", "content provider access is not disabled"],
    ["allowFileAccessFromFileURLs = false", "file URL access is not disabled"],
    [
      "allowUniversalAccessFromFileURLs = false",
      "universal file URL access is not disabled",
    ],
    ["WebSettings.MIXED_CONTENT_NEVER_ALLOW", "mixed content is not refused"],
    [
      "WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)",
      "WebView debugging is not confined to debug builds",
    ],
    ["handler.cancel()", "an SSL error is not cancelled"],
    [
      "WebViewAssetLoader",
      "the packaged assets are not served by the asset loader",
    ],
  ];
  for (const [needle, message] of hardening) {
    if (!hostActivity.includes(needle)) {
      fail(`the Android host is not hardened: ${message}`);
    }
  }
  if (/handler\.proceed\(\)/u.test(hostActivity)) {
    fail("the Android host proceeds through an SSL error");
  }
  // The deployed site must never be the document inside the bridged WebView.
  if (/loadUrl\(\s*"https?:\/\/(?!\$)/u.test(hostActivity)) {
    fail(
      "the Android host loads a hard-coded remote URL into the bridged WebView",
    );
  }
}

if (existsSync(androidSourceRoot)) {
  for (const entry of readdirSync(androidSourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".kt")) continue;
    // Comments are stripped first: UsbSerialBridge documents at length why it
    // does not use this API, and a rule that cannot tell an explanation from a
    // call would push that explanation out of the code.
    const source = withoutComments(
      readFileSync(`${androidSourceRoot}/${entry.name}`, "utf8"),
    );
    // An interface injected this way reaches every frame and cannot tell which
    // one called it. The bridge uses an origin-restricted WebMessageListener.
    if (/addJavascriptInterface/u.test(source)) {
      fail(
        `${entry.name} uses addJavascriptInterface, which cannot be origin-restricted`,
      );
    }
  }
}

// A workflow that fails GitHub's own validation produces a run with **zero
// jobs** and a conclusion of "failure", named by its file path rather than its
// `name:`. That is easy to misread as a test failure, so the two mistakes that
// cause it are checked here instead of being discovered a cycle later.
//
// 1. Job-level `env:` may use github, needs, strategy, matrix, vars, secrets
//    and inputs — but not `runner`, which does not exist until a runner is
//    assigned. Referring to it there fails the whole file.
// 2. `env:` values are literals, not shell. `$HOME/x` stays the four
//    characters `$HOME`, which silently produces a nonsense path.
const jobEnvContexts = new Set([
  "github",
  "needs",
  "strategy",
  "matrix",
  "vars",
  "secrets",
  "inputs",
]);

if (existsSync(workflowDirectory)) {
  for (const entry of readdirSync(workflowDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/u.test(entry.name)) continue;
    const source = readFileSync(`${workflowDirectory}/${entry.name}`, "utf8");
    // Job-level `env:` blocks: two-space indent, before `steps:`.
    for (const block of source.matchAll(/\n {4}env:\n((?: {6}.*\n|\n)*)/gu)) {
      for (const [, context] of block[1].matchAll(/\$\{\{\s*([a-z_]+)\./gu)) {
        if (!jobEnvContexts.has(context)) {
          fail(
            `${entry.name}: a job-level env block uses the ${context} context, ` +
              "which is not available there; the whole workflow fails to validate",
          );
        }
      }
      for (const [, key, value] of block[1].matchAll(
        /^ {6}([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/gmu,
      )) {
        if (/\$[A-Za-z{]/u.test(value) && !value.includes("${{")) {
          fail(
            `${entry.name}: job-level env ${key} contains a shell variable; ` +
              "env values are literals and will not expand",
          );
        }
      }
    }
  }
}

if (process.exitCode === 1) process.exit(1);
console.log(
  `✓ CI hygiene passed (${[...allowedWorkflows].join(", ")}; one canonical hardware workbench)`,
);
