import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "apps/web/src/acceptance/physical-acceptance.ts",
  "apps/web/src/acceptance/physical-acceptance-storage.ts",
  "apps/web/src/acceptance/physical-acceptance.test.ts",
  "apps/web/src/acceptance/physical-acceptance-storage.test.ts",
  "apps/web/src/components/PhysicalAcceptancePanel.tsx",
  "apps/web/src/components/PhysicalAcceptancePanel.test.tsx",
  "apps/web/src/physical-acceptance.css",
  "docs/hardware/PHYSICAL_ACCEPTANCE_PLAN_AR.md",
  "docs/hardware/PHYSICAL_ACCEPTANCE_RESULT_SCHEMA.md",
];

const failures = [];
for (const relative of required) {
  try {
    const file = await stat(path.join(root, relative));
    if (!file.isFile() || file.size === 0) failures.push(`${relative}: empty`);
  } catch {
    failures.push(`${relative}: missing`);
  }
}

const [model, panel, workbench, main, packageJson] = await Promise.all([
  readFile(path.join(root, required[0]), "utf8"),
  readFile(path.join(root, required[4]), "utf8"),
  readFile(
    path.join(root, "apps/web/src/components/ExpressLrsParityWorkbench.tsx"),
    "utf8",
  ),
  readFile(path.join(root, "apps/web/src/main.tsx"), "utf8"),
  readFile(path.join(root, "package.json"), "utf8"),
]);

const stepIds = [...model.matchAll(/^\s+id: "([a-z0-9_]+)",$/gmu)].map(
  (match) => match[1],
);
if (stepIds.length !== 19 || new Set(stepIds).size !== 19) {
  failures.push(
    `physical acceptance definitions must contain 19 unique IDs, found ${stepIds.length}`,
  );
}

const contextBlock = model.match(
  /export interface PhysicalAcceptanceContextSnapshot \{([\s\S]*?)\n\}/u,
)?.[1];
if (contextBlock === undefined) {
  failures.push("PhysicalAcceptanceContextSnapshot is missing");
} else {
  for (const forbidden of [
    "wifiPassword",
    "wifiSsid",
    "bindPhrase",
    "bindingPhrase",
    "uid",
    "secret",
    "token",
  ]) {
    if (new RegExp(`\\b${forbidden}\\b`, "iu").test(contextBlock)) {
      failures.push(`sensitive context field is prohibited: ${forbidden}`);
    }
  }
}

if (!model.includes('"elrs-easy:physical-acceptance:v1"')) {
  const storage = await readFile(path.join(root, required[1]), "utf8");
  if (!storage.includes('"elrs-easy:physical-acceptance:v1"')) {
    failures.push("versioned physical acceptance storage key is missing");
  }
}

// The claim now lives in the shared catalog, so it is checked where it is
// defined (in both locales) and where the panel renders it.
if (!panel.includes('t("accp.subheading")')) {
  failures.push("the recorder must state that tests have no sequential lock");
}
for (const [locale, file] of [
  ["Arabic", "packages/i18n/src/locales/acceptance-ar.ts"],
  ["English", "packages/i18n/src/locales/acceptance-en.ts"],
]) {
  const catalog = await readFile(path.join(root, file), "utf8");
  if (!catalog.includes('"accp.subheading"')) {
    failures.push(
      `the ${locale} catalog is missing the no-sequential-lock statement`,
    );
  }
  if (!catalog.includes('"accp.recordingAlwaysOpen"')) {
    failures.push(
      `the ${locale} catalog must state the recorder is always open`,
    );
  }
}
if (!panel.includes("serializePhysicalAcceptanceJson")) {
  failures.push("JSON export is not wired to the recorder");
}
if (!panel.includes("serializePhysicalAcceptanceMarkdown")) {
  failures.push("Markdown export is not wired to the recorder");
}
if (!panel.includes("capturePhysicalAcceptanceContext")) {
  failures.push("live application context capture is not wired");
}
if (!panel.includes("const value = import.meta.env.VITE_BUILD_SHA;")) {
  failures.push("the recorder is not bound directly to VITE_BUILD_SHA");
}
if (!workbench.includes("<PhysicalAcceptancePanel")) {
  failures.push(
    "the physical acceptance recorder is absent from production UI",
  );
}
if (!workbench.includes("physicalAcceptanceContext")) {
  failures.push("the production workbench does not build a recorder context");
}
if (!main.includes('import "./physical-acceptance.css";')) {
  failures.push("physical acceptance styles are absent from the entrypoint");
}
// The public entry point mounts the product shell, and the shell is the only
// module allowed to mount the workbench. Both links are checked so the chain
// from main.tsx to the workbench cannot acquire write authority anywhere.
const shell = await readFile(
  path.join(root, "apps/web/src/components/ProductShell.tsx"),
  "utf8",
);
if (!main.includes("<ProductShell />")) {
  failures.push("the public entrypoint must mount the product shell");
}
if (!/<ExpressLrsParityWorkbenchView\b/u.test(shell)) {
  failures.push("the product shell must mount the canonical workbench");
}
// The workbench must render the shell's controller and the operator's chosen
// locale. It used to hardcode Arabic and `dir="rtl"`, so choosing English left
// the technical view in the wrong language and the wrong direction.
if (
  !/<ExpressLrsParityWorkbenchView[\s\S]{0,200}?controller=\{controller\}/u.test(
    shell,
  )
) {
  failures.push(
    "the product shell must mount the workbench over the shared controller",
  );
}
if (
  !/<ExpressLrsParityWorkbenchView[\s\S]{0,200}?locale=\{locale\}/u.test(shell)
) {
  failures.push(
    "the product shell must pass the chosen locale to the workbench",
  );
}
if (!shell.includes("<EasySetup")) {
  failures.push("the product shell must mount Easy Mode");
}
if (!shell.includes("controller={controller}")) {
  failures.push("the product shell must hand Easy Mode the shared controller");
}
// One controller means one session, one identity, and one write authority for
// both views. A second call here would silently give each mode its own device.
if ((shell.match(/useDeviceController\(/gu) ?? []).length !== 1) {
  failures.push(
    "the product shell must create exactly one device controller for both modes",
  );
}
if (!packageJson.includes('"check:physical-acceptance"')) {
  failures.push("package.json does not expose the permanent acceptance gate");
}

if (failures.length > 0) {
  console.error("Physical acceptance package check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Physical acceptance package verified (${required.length} files, ${stepIds.length} available recorder steps, JSON + Markdown export).`,
);
