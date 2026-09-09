// Proves the shipped interface does not lie.
//
// Six things make a control dishonest, and each one has been a real defect in
// this project at some point:
//
//   1. A button with no handler                → decoration
//   2. A handler that does nothing             → decoration with extra steps
//   3. A control nobody documented             → a feature with no stated reality
//   4. An Easy Mode task that hands off        → an incomplete feature sold as complete
//   5. A Mock reachable from the product       → simulated results shown as device results
//   6. A constant flag hiding a working option → a permanent lock wearing a condition's clothes
//
// The matrix is the record: every control in the shipped UI must have a row in
// docs/FEATURE_REALITY_MATRIX.md saying what it does and what proves it.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

/** Every module that renders a control in the shipped product. */
const UI_MODULES = [
  "apps/web/src/components/ProductShell.tsx",
  "apps/web/src/components/BuildBanner.tsx",
  "apps/web/src/components/EasySetup.tsx",
  "apps/web/src/components/ExpressLrsParityWorkbench.tsx",
  "apps/web/src/components/DiagnosticsPanel.tsx",
  "apps/web/src/components/PhysicalAcceptancePanel.tsx",
];

const MATRIX = "docs/FEATURE_REALITY_MATRIX.md";

/** Pulls every onClick expression out of a module. */
function clickHandlers(source) {
  const handlers = [];
  const pattern = /onClick=\{/gu;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      index += 1;
    }
    handlers.push(source.slice(match.index + match[0].length, index - 1));
  }
  return handlers;
}

/** The action names a handler expression invokes or references. */
function actionsIn(handler) {
  const ignored = new Set([
    "void",
    "if",
    "else",
    "String",
    "Number",
    "Boolean",
    "setTimeout",
    "return",
  ]);
  const names = new Set();
  const bare = /^\s*([A-Za-z_$][\w$]*)\s*$/u.exec(handler);
  if (bare !== null) names.add(bare[1]);
  for (const call of handler.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/gu)) {
    if (!ignored.has(call[1])) names.add(call[1]);
  }
  return [...names];
}

const documented = existsSync(path.join(root, MATRIX)) ? read(MATRIX) : "";
if (documented === "") failures.push(`${MATRIX} is missing`);

const NO_OP = /^\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null|void 0)\s*$/u;

for (const relative of UI_MODULES) {
  if (!existsSync(path.join(root, relative))) {
    failures.push(`a shipped UI module is missing: ${relative}`);
    continue;
  }
  const source = read(relative);

  // 1. Every button carries a handler.
  for (const button of source.match(/<button\b[\s\S]*?>/gu) ?? []) {
    if (!/onClick=/u.test(button) && !/type="submit"/u.test(button)) {
      failures.push(
        `a button without a handler in ${relative}: ${button.replace(/\s+/gu, " ").slice(0, 70)}`,
      );
    }
  }

  for (const handler of clickHandlers(source)) {
    // 2. A handler that does nothing is a decoration.
    if (NO_OP.test(handler)) {
      failures.push(`a no-op click handler in ${relative}: ${handler.trim()}`);
      continue;
    }
    const actions = actionsIn(handler);
    if (actions.length === 0) {
      failures.push(
        `a click handler that invokes nothing in ${relative}: ${handler.replace(/\s+/gu, " ").slice(0, 70)}`,
      );
      continue;
    }
    // 3. Every action is documented in the matrix.
    for (const action of actions) {
      if (!new RegExp(`\`${action}\``, "u").test(documented)) {
        failures.push(
          `a control action is not in ${MATRIX}: ${action} (${relative})`,
        );
      }
    }
  }
}

// 4. Easy Mode must finish its own tasks. Handing an operation to the Advanced
//    view is the shape this product used to ship instead of a feature, so the
//    only place Easy Mode may open Advanced is its explicit "open advanced"
//    affordance — never from the runner that executes a chosen operation.
const easy = existsSync(
  path.join(root, "apps/web/src/components/EasySetup.tsx"),
)
  ? read("apps/web/src/components/EasySetup.tsx")
  : "";
const runnerBlock =
  /onClick=\{\(\) => \{\s*if \(operation ===[\s\S]*?\n\s*\}\}/u.exec(easy);
if (runnerBlock === null) {
  failures.push("Easy Mode's operation runner could not be located");
} else if (/onOpenAdvanced/u.test(runnerBlock[0])) {
  failures.push(
    "Easy Mode hands an operation to Advanced Mode instead of completing it",
  );
}
for (const marker of ["easy.firmware.handoff", "easy.run.firmware"]) {
  if (easy.includes(marker) && marker === "easy.firmware.handoff") {
    failures.push(`Easy Mode still renders a hand-off message: ${marker}`);
  }
}

// 5. No Mock may be reachable from the shipped product.
const mockImport = /from\s+["'][^"']*(platform-mock|\/mock[A-Za-z-]*)["']/u;
for (const relative of UI_MODULES) {
  if (!existsSync(path.join(root, relative))) continue;
  if (mockImport.test(read(relative))) {
    failures.push(`a shipped UI module imports a mock: ${relative}`);
  }
}

// 6. A constant boolean flag that gates a control is a lock, not a condition.
//    A real condition is read from live state; a `const X = false` is not.
for (const relative of UI_MODULES) {
  if (!existsSync(path.join(root, relative))) continue;
  const source = read(relative);
  for (const declaration of source.matchAll(
    /^const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*boolean\s*)?=\s*(true|false)\s*;/gmu,
  )) {
    failures.push(
      `a constant feature flag in ${relative}: ${declaration[1]} = ${declaration[2]}`,
    );
  }
}

if (failures.length > 0) {
  console.error("UI honesty check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `UI honesty verified (${UI_MODULES.length} modules; every control has a handler, an action, and a documented reality).`,
);
