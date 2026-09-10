import { existsSync, readdirSync, readFileSync } from "node:fs";

// Each entry is a reviewed workflow. A new file here is a deliberate decision,
// not something that appears by accident:
//   ci.yml            the quality, license and security gates
//   deploy-pages.yml  the GitHub Pages deploy
//   upstream-live.yml the opt-in live suites against the official mirror
//   android.yml       the Android host APK, lint and unit tests
const allowedWorkflows = new Set([
  "ci.yml",
  "deploy-pages.yml",
  "upstream-live.yml",
  "android.yml",
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

// 1. The candidate branch carries no workflow that can read the key.
for (const name of readdirSync(workflowDirectory)) {
  const contents = readFileSync(`${workflowDirectory}/${name}`, "utf8");
  if (signingSecretPattern.test(contents)) {
    fail(
      `${name} references a permanent signing secret. No workflow here may: ` +
        "the trusted signer lives on the default branch and is the only place " +
        "those secrets are readable. See docs/ANDROID_SIGNING.md",
    );
  }
}

// 2. The signing workflow must not be here either. It is deliberately not on
//    this branch: a `workflow_dispatch` workflow is only dispatchable from the
//    default branch, and keeping it out of the candidate diff is what makes
//    "pull-request code cannot reach the key" a structural claim.
if (existsSync(`${workflowDirectory}/android-release-candidate.yml`)) {
  fail(
    "android-release-candidate.yml is present on this branch. The trusted " +
      "signer belongs on the default branch only; see docs/ANDROID_SIGNING.md",
  );
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
