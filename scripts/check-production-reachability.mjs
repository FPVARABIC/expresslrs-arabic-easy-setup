// Walks the real import graph from the production entry point and reports what
// is actually reachable from it.
//
// "The code exists" and "the shipped application can reach it" are different
// claims, and only the second one matters for whether an operation works. This
// resolves that by following imports from `apps/web/src/main.tsx` rather than
// by grepping, so a module that is present but orphaned is visible as orphaned.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = "apps/web/src/main.tsx";

const failures = [];
const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);

/** Resolves a specifier the way the bundler does, enough for this graph. */
function resolve(fromFile, specifier) {
  if (specifier.startsWith("@elrs-easy/")) {
    const pkg = specifier.slice("@elrs-easy/".length).split("/")[0];
    for (const candidate of [
      `packages/${pkg}/src/index.ts`,
      `packages/${pkg}/src/index.tsx`,
    ]) {
      if (existsSync(path.join(root, candidate))) return candidate;
    }
    return null;
  }
  if (!specifier.startsWith(".")) return null; // node_modules, not our graph
  const base = path.join(path.dirname(fromFile), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(path.join(root, candidate)) && /\.tsx?$/u.test(candidate)) {
      return path.relative(root, path.join(root, candidate));
    }
  }
  return null;
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/gu;
const BARE_IMPORT = /(?:^|\n)\s*import\s*["']([^"']+)["']/gu;
const DYNAMIC = /import\(\s*["']([^"']+)["']\s*\)/gu;

const reachable = new Set();
const queue = [ENTRY];
while (queue.length > 0) {
  const file = queue.pop();
  if (file === undefined || reachable.has(file)) continue;
  reachable.add(file);
  const source = await readFile(path.join(root, file), "utf8");
  for (const pattern of [IMPORT, BARE_IMPORT, DYNAMIC]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const next = resolve(file, match[1]);
      if (next !== null && !reachable.has(next)) queue.push(next);
    }
  }
}

// Every driver the application claims to reach must actually be in the graph.
const REQUIRED = {
  "CRSF protocol": "apps/web/src/hardware/crsf.ts",
  "Web Serial transport": "apps/web/src/hardware/serial.ts",
  "device session": "apps/web/src/hardware/session.ts",
  "shared device controller": "apps/web/src/hardware/useDeviceController.ts",
  "ESP flasher": "apps/web/src/hardware/esp-flasher.ts",
  "STM32 DFU flasher": "apps/web/src/hardware/stm32-dfu.ts",
  "firmware packaging": "apps/web/src/hardware/firmware-package.ts",
  "rx-as-tx": "apps/web/src/hardware/rx-as-tx.ts",
  "reconnect verification":
    "apps/web/src/hardware/reconnect-target-verification.ts",
  "recovery package": "apps/web/src/hardware/recovery-package.ts",
  "write authority": "apps/web/src/hardware/write-authority.ts",
  "XMODEM / passthrough": "apps/web/src/hardware/passthrough.ts",
  "native bridge seam": "apps/web/src/hardware/native-bridge.ts",
  "physical acceptance": "apps/web/src/acceptance/physical-acceptance.ts",
};
for (const [label, file] of Object.entries(REQUIRED)) {
  if (!existsSync(path.join(root, file))) {
    fail("driver-missing", `${label} (${file}) does not exist`);
  } else if (!reachable.has(file)) {
    fail(
      "driver-unreachable",
      `${label} (${file}) is not reachable from ${ENTRY}; the shipped application cannot run it`,
    );
  }
}

// Nothing that reads as a global write switch may be in the production graph.
// `software-readiness.ts` declares `realWritesEnabled: false` as a field of a
// *report*, not a switch — but it reads like one, so its absence is enforced
// rather than argued.
const FORBIDDEN = [
  "packages/workflows/src/software-readiness.ts",
  "packages/platform-mock/src/index.ts",
];
for (const file of FORBIDDEN) {
  if (reachable.has(file)) {
    fail(
      "lock-module-reachable",
      `${file} is reachable from ${ENTRY}; it must not be in the production graph`,
    );
  }
}

if (process.argv.includes("--list")) {
  for (const file of [...reachable].sort()) console.log(file);
}

if (failures.length > 0) {
  console.error("Production reachability check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `Production reachability verified (${reachable.size} modules reachable from ${ENTRY}; every driver present, no write-switch module in the graph).`,
);
