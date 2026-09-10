import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Renders and verifies the runtime availability matrix.
 *
 * `apps/web/src/runtime-availability.test.tsx` drives every operation through
 * the real production shell and writes `docs/runtime-availability.json`. This
 * turns that into `docs/RUNTIME_AVAILABILITY.md` and refuses a build where any
 * supported operation never became enabled, or where an operation has no row
 * at all.
 *
 * The point is that a static search cannot establish this. `disabled={expr}`
 * looks dynamic and can still be false forever; only running it settles the
 * question, so the evidence here is a recording of it having run.
 */

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dataPath = path.join(repositoryRoot, "docs/runtime-availability.json");
const documentPath = path.join(repositoryRoot, "docs/RUNTIME_AVAILABILITY.md");

/**
 * Every operation the controller answers readiness for. A new one has to
 * appear here and be driven, or this fails: an operation with no row is an
 * operation nobody has watched become available.
 */
const requiredOperations = new Set([
  "connect",
  "diagnostics",
  "settingsWrite",
  "settingsRestore",
  "binding",
  "bindingPrerequisites",
  "firmwareWrite",
  "recovery",
  // The imported-package path is its own operation, not a variant of
  // `recovery`: it is the one that works with no application state at all,
  // and it went a round with no control in either surface. A row is what
  // makes that impossible to lose again quietly.
  "recoveryImport",
  "rxAsTx",
  "airport",
]);

/** Surfaces that must each be represented by at least one row. */
const requiredSurfaces = new Set(["easy", "advanced"]);
const requiredTransports = new Set(["browser", "android"]);

const failures = [];
function fail(message) {
  failures.push(message);
}

let data;
try {
  data = JSON.parse(readFileSync(dataPath, "utf8"));
} catch {
  console.error(
    `✗ ${path.relative(repositoryRoot, dataPath)} is missing or unreadable. ` +
      "Run `pnpm test` — the runtime availability suite writes it.",
  );
  process.exit(1);
}

const rows = Array.isArray(data.rows) ? data.rows : [];
if (rows.length === 0) fail("the matrix has no rows");

for (const operation of requiredOperations) {
  const matching = rows.filter((row) => row.operation === operation);
  if (matching.length === 0) {
    fail(`no row proves ${operation} ever becomes enabled`);
    continue;
  }
  for (const row of matching) {
    if (row.enabledAfter !== true) {
      fail(
        `${operation} (${row.surface}/${row.transport}) never became enabled; ` +
          "its readiness expression may evaluate false permanently",
      );
    }
    if (row.readinessInputs === undefined || row.readinessInputs.length === 0) {
      fail(`${operation} (${row.surface}) records no readiness inputs`);
    }
    for (const field of [
      "control",
      "handler",
      "driver",
      "writeAuthority",
      "recoveryCheckpoint",
      "verification",
      "onFailure",
    ]) {
      if (typeof row[field] !== "string" || row[field].trim() === "") {
        fail(`${operation} (${row.surface}) records no ${field}`);
      }
    }
  }
}

for (const surface of requiredSurfaces) {
  if (!rows.some((row) => row.surface === surface)) {
    fail(`no row covers the ${surface} surface`);
  }
}
for (const transport of requiredTransports) {
  if (!rows.some((row) => row.transport === transport)) {
    fail(`no row covers the ${transport} transport`);
  }
}

/**
 * The two operations that have no prerequisites, and must not acquire any.
 *
 * `connect` is available from a cold start because there is nothing to be
 * missing yet, and `diagnostics` is available with nothing attached because
 * that is exactly the situation an operator needs a report in. Every other
 * operation must have been observed refused before it was observed available;
 * otherwise the row records a control that happened to be enabled, not a gate
 * that was proven to open.
 */
const unconditionalOperations = new Set(["connect", "diagnostics"]);

for (const row of rows) {
  if (unconditionalOperations.has(row.operation)) continue;
  if (row.disabledBefore !== true) {
    fail(
      `${row.operation} (${row.surface}) was never observed disabled, so the ` +
        "transition it claims to prove was not observed",
    );
  }
}

// And the converse: an operation that is supposed to have prerequisites must
// not quietly become unconditional.
for (const operation of requiredOperations) {
  if (unconditionalOperations.has(operation)) continue;
  if (
    rows
      .filter((row) => row.operation === operation)
      .every((row) => row.disabledBefore !== true)
  ) {
    fail(`${operation} is gated on nothing in any recorded surface`);
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`✗ ${message}`);
  process.exit(1);
}

function cell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function list(values) {
  return values.map((value) => `- ${cell(value)}`).join("<br>");
}

const lines = [
  "# Runtime availability matrix",
  "",
  "Generated by `scripts/check-runtime-availability.mjs` from",
  "`docs/runtime-availability.json`, which",
  "`apps/web/src/runtime-availability.test.tsx` writes while driving each",
  "operation through the real production entry point",
  `(\`${cell(data.entryPoint)}\`).`,
  "",
  "**Why this exists rather than a code search.** A static check for",
  "`disabled={true}` proves nothing: an expression can be present, dynamic, and",
  "still evaluate false forever. Each row below was produced by rendering the",
  "shipped shell, observing the control refused, satisfying exactly the",
  "prerequisites the application itself names, and observing it become",
  "available. The suite fails if any of those steps does not happen.",
  "",
  "**What this is not.** Nothing here is a hardware claim. The device is a",
  "fake driver that answers CRSF correctly; the rows prove the application's",
  "own gating and wiring, not that a transmitter did anything.",
  "",
  `${rows.length} rows.`,
  "",
  "| Operation | Surface | Transport | Visible control | Readiness inputs | Refused before | Enabled after | Handler | Driver | Write authority | Recovery checkpoint | Verification | On failure |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
];

for (const row of rows) {
  lines.push(
    `| \`${cell(row.operation)}\` | ${cell(row.surface)} | ${cell(row.transport)} | ${cell(row.control)} | ${list(row.readinessInputs)} | ${row.disabledBefore ? "yes" : "no — it has no prerequisites"} | ${row.enabledAfter ? "**yes**" : "NO"} | \`${cell(row.handler)}\` | ${cell(row.driver)} | ${cell(row.writeAuthority)} | ${cell(row.recoveryCheckpoint)} | ${cell(row.verification)} | ${cell(row.onFailure)} |`,
  );
}

lines.push("");

const rendered = `${lines.join("\n")}\n`;
const existing = (() => {
  try {
    return readFileSync(documentPath, "utf8");
  } catch {
    return null;
  }
})();

if (process.argv.includes("--write") || existing === null) {
  writeFileSync(documentPath, rendered);
} else if (existing !== rendered) {
  writeFileSync(documentPath, rendered);
  console.log(
    "docs/RUNTIME_AVAILABILITY.md was stale and has been regenerated; commit it.",
  );
}

console.log(
  `Runtime availability verified (${rows.length} rows; every one of ${requiredOperations.size} operations observed becoming enabled from the production entry point).`,
);
