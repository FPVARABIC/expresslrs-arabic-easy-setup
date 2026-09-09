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

if (process.exitCode === 1) process.exit(1);
console.log(
  `✓ CI hygiene passed (${[...allowedWorkflows].join(", ")}; one canonical hardware workbench)`,
);
