import { existsSync, readdirSync, readFileSync } from "node:fs";

const allowedWorkflows = new Set(["ci.yml", "deploy-pages.yml"]);
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
  if (!main.includes('from "./components/ExpressLrsParityWorkbench"')) {
    fail("main.tsx does not import the canonical workbench");
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

if (process.exitCode === 1) process.exit(1);
console.log(
  `✓ CI hygiene passed (${[...allowedWorkflows].join(", ")}; one canonical hardware workbench)`,
);
