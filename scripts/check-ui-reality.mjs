// Static gates for the defects found in the corrective review.
//
// Each rule here exists because a specific wrong thing shipped once. They are
// deliberately narrow: a rule that fires on anything vaguely suspicious gets
// silenced, and a silenced rule protects nothing.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);

async function sourceFiles(dir, accumulated = []) {
  for (const entry of await readdir(path.join(root, dir), {
    withFileTypes: true,
  })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      await sourceFiles(relative, accumulated);
    } else if (
      /\.tsx?$/u.test(entry.name) &&
      !/\.test\.tsx?$/u.test(entry.name)
    ) {
      accumulated.push(relative);
    }
  }
  return accumulated;
}

const files = [
  ...(await sourceFiles("apps/web/src")),
  ...(await sourceFiles("packages")),
];
const sources = new Map(
  await Promise.all(
    files.map(async (file) => [
      file,
      await readFile(path.join(root, file), "utf8"),
    ]),
  ),
);

const ARABIC = /[؀-ۿ]/u;
// The i18n package is where localised copy belongs. Everything in it declares
// both locales side by side under a `Record<Locale, …>`, so TypeScript already
// refuses a half-translated entry there.
const CATALOG = /^packages\/i18n\/src\//u;

/** Comments describe defects; they must not be mistaken for committing one. */
const withoutComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");

// 1. No Arabic interface text outside the catalog. The one allowed exception is
//    redaction data, which must say so on the line above it.
for (const [file, text] of sources) {
  if (CATALOG.test(file)) continue;
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (!ARABIC.test(line)) return;
    const preceding = lines.slice(Math.max(0, index - 4), index).join("\n");
    if (/redaction \*?patterns?\*?|not interface text/u.test(preceding)) return;
    fail(
      "arabic-outside-catalog",
      `${file}:${index + 1} carries Arabic text that belongs in the shared catalog`,
    );
  });
}

// 2. Both locales must define every key, so English can never fall back to
//    Arabic at runtime.
for (const pair of ["workbench", "acceptance"]) {
  const en = sources.get(`packages/i18n/src/locales/${pair}-en.ts`);
  const ar = sources.get(`packages/i18n/src/locales/${pair}-ar.ts`);
  if (en === undefined || ar === undefined) {
    fail("catalog-pair-missing", `${pair}-en.ts / ${pair}-ar.ts`);
    continue;
  }
  const keys = (text) =>
    new Set([...text.matchAll(/^\s{2}"([^"]+)":/gmu)].map((m) => m[1]));
  const enKeys = keys(en);
  const arKeys = keys(ar);
  for (const key of enKeys) {
    if (!arKeys.has(key))
      fail("catalog-key-missing", `${pair}-ar.ts lacks "${key}"`);
  }
  for (const key of arKeys) {
    if (!enKeys.has(key))
      fail("catalog-key-missing", `${pair}-en.ts lacks "${key}"`);
  }
}

// 3. A component must never pin a locale or a direction. Both come from the
//    shell, or English renders as right-to-left Arabic.
for (const [file, text] of sources) {
  if (!file.endsWith(".tsx")) continue;
  const code = withoutComments(text);
  for (const [pattern, rule] of [
    [/locale=["']ar["']|locale=["']en["']/u, "hardcoded-locale"],
    [/dir=["'](rtl)["']/u, "hardcoded-direction"],
  ]) {
    const match = pattern.exec(code);
    if (match !== null) {
      fail(
        rule,
        `${file} pins ${match[0]}; pass it down from ProductShell instead`,
      );
    }
  }
}

// 4. No build-stage lock, anywhere, in any locale.
const LOCK_PHRASES =
  /not available yet|coming soon|locked in this (?:build|version|release)|in a (?:later|future) (?:build|release|version)|مقفل حتى|غير متاح بعد|في نسخة لاحقة|سيتم تفعيل|لم يُنفَّذ بعد/iu;
for (const [file, text] of sources) {
  const match = LOCK_PHRASES.exec(withoutComments(text));
  if (match !== null) {
    fail(
      "build-stage-lock",
      `${file} claims "${match[0]}"; gate on a live condition or ship the feature`,
    );
  }
}

// 5. No statically dead control.
for (const [file, text] of sources) {
  if (!file.endsWith(".tsx")) continue;
  for (const [pattern, rule] of [
    [/disabled(?:=\{true\})?\s*(?:\n\s*)?\/?>/u, "static-disabled"],
    [/\breadOnly\b/u, "static-readonly"],
    [/checked=\{false\}/u, "decorative-checkbox"],
  ]) {
    const match = pattern.exec(withoutComments(text));
    if (match !== null) {
      fail(
        rule,
        `${file} has ${match[0].trim()}; disable on live state or remove the control`,
      );
    }
  }
}

// 6. RX-as-TX is a role change, not AirPort. The two must stay independent:
//    `is-airport` may only ever be written from the AirPort option.
const packaging =
  sources.get("apps/web/src/hardware/firmware-package.ts") ?? "";
for (const line of packaging.split("\n")) {
  if (!line.includes('"is-airport"') || !line.includes("=")) continue;
  if (/rxAsTx|receiverAsTransmitter/iu.test(line)) {
    fail(
      "rx-as-tx-airport-conflation",
      `firmware-package.ts writes is-airport from an rx-as-tx value: "${line.trim()}"`,
    );
  }
}
const rxAsTx = sources.get("apps/web/src/hardware/rx-as-tx.ts") ?? "";
if (!rxAsTx.includes('replaceAll("_RX", "_TX")')) {
  fail(
    "rx-as-tx-artifact",
    "rx-as-tx.ts no longer selects the _TX artifact; a role change needs the transmitter build",
  );
}
if (/is-airport/u.test(withoutComments(rxAsTx))) {
  fail(
    "rx-as-tx-airport-conflation",
    "rx-as-tx.ts references is-airport outside its documentation",
  );
}

// 7. Post-write success must depend on verification, never on the write alone.
const controller =
  sources.get("apps/web/src/hardware/useDeviceController.ts") ?? "";
for (const required of [
  "verifyReconnectTarget",
  "verifyObservedFirmwareBuild",
  "rxAsTxMode: prepared.optionsSummary.rxAsTxMode",
]) {
  if (!controller.includes(required)) {
    fail(
      "unverified-success",
      `useDeviceController.ts no longer calls ${required}`,
    );
  }
}
const verification =
  sources.get("apps/web/src/hardware/reconnect-target-verification.ts") ?? "";
if (!verification.includes("RX_AS_TX_ROLE_NOT_APPLIED")) {
  fail(
    "unverified-success",
    "reconnect verification no longer fails a device that comes back as a receiver after rx-as-tx",
  );
}

// 8. Readiness must stay per operation.
if (!controller.includes("readiness")) {
  fail(
    "blanket-readiness",
    "useDeviceController.ts no longer exposes per-operation readiness",
  );
}
for (const [file, text] of sources) {
  if (!file.endsWith(".tsx")) continue;
  if (/deviceChangesEnabled/u.test(text)) {
    fail(
      "blanket-readiness",
      `${file} still passes a single deviceChangesEnabled gate`,
    );
  }
}

if (failures.length > 0) {
  console.error("UI reality check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `UI reality verified (${sources.size} modules; no Arabic outside the catalog, no pinned locale or direction, no build-stage lock, no dead control, rx-as-tx independent of AirPort, success gated on verification).`,
);
