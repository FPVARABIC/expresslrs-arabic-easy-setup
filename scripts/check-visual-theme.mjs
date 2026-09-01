import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const mainPath = path.join(repositoryRoot, "apps/web/src/main.tsx");
const themePath = path.join(repositoryRoot, "apps/web/src/reference-theme.css");
const packagePath = path.join(repositoryRoot, "package.json");
const indexPath = path.join(repositoryRoot, "apps/web/index.html");
const manifestPath = path.join(
  repositoryRoot,
  "apps/web/public/manifest.webmanifest",
);
const iconPath = path.join(repositoryRoot, "apps/web/public/app-icon.svg");

const [
  mainSource,
  themeSource,
  packageSource,
  indexSource,
  manifestSource,
  iconSource,
] = await Promise.all([
  readFile(mainPath, "utf8"),
  readFile(themePath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(indexPath, "utf8"),
  readFile(manifestPath, "utf8"),
  readFile(iconPath, "utf8"),
]);

const rootPackage = JSON.parse(packageSource);
const manifest = JSON.parse(manifestSource);

function fail(message) {
  throw new Error(`Visual theme policy failed: ${message}`);
}

if (!mainSource.includes('import "@fontsource-variable/cairo/wght.css";')) {
  fail("the Web entrypoint must load the local Cairo variable font");
}

if (!mainSource.includes('import "./reference-theme.css";')) {
  fail("the reviewed visual alignment layer is not activated");
}

if (rootPackage.dependencies?.["@fontsource-variable/cairo"] !== "5.3.0") {
  fail("Cairo must remain an exact, lockfile-backed local dependency");
}

const requiredTokens = new Map([
  ["--page", "#0e1116"],
  ["--surface", "#161b22"],
  ["--surface-strong", "#1c2128"],
  ["--line", "#2a313c"],
  ["--text", "#e6edf3"],
  ["--text-muted", "#8b949e"],
  ["--cyan", "#4c8dff"],
  ["--mint", "#3fb950"],
  ["--amber", "#d29922"],
  ["--danger", "#f85149"],
]);

for (const [token, value] of requiredTokens) {
  if (!themeSource.includes(`${token}: ${value};`)) {
    fail(`${token} must remain ${value}`);
  }
}

if (
  !themeSource.includes(
    'font-family: "Cairo Variable", Cairo, system-ui, sans-serif;',
  )
) {
  fail("the visual layer must enforce Cairo for Arabic UI text and controls");
}

for (const forbidden of [
  "linear-gradient(",
  "radial-gradient(",
  "filter: blur(",
]) {
  if (themeSource.includes(forbidden)) {
    fail(`the restrained technical layer must not introduce ${forbidden}`);
  }
}

if (!themeSource.includes("--shadow: none;")) {
  fail("the reference-aligned layer must not restore decorative panel shadows");
}

if (!/\.ambient\s*\{[^}]*display:\s*none;/su.test(themeSource)) {
  fail("decorative ambient glows must stay disabled");
}

if (
  !/\.task-card,\s*\.task-violet,\s*\.task-amber,\s*\.task-mint\s*\{[^}]*--task-color:\s*var\(--cyan\);/su.test(
    themeSource,
  )
) {
  fail(
    "Easy Mode task cards must use the single product accent, not decorative category colors",
  );
}

if (!/\.primary-button\s*\{[^}]*color:\s*var\(--page\);/su.test(themeSource)) {
  fail("primary blue actions must retain accessible dark text contrast");
}

if (!indexSource.includes('<meta name="theme-color" content="#0e1116" />')) {
  fail("browser chrome must use the reviewed dark background");
}

if (
  manifest.background_color !== "#0e1116" ||
  manifest.theme_color !== "#0e1116"
) {
  fail("installed PWA chrome must use the reviewed dark background");
}

if (!iconSource.includes('fill="#0e1116"') || !iconSource.includes("#4c8dff")) {
  fail(
    "the application icon must use the reviewed dark background and blue accent",
  );
}

console.log(
  "Cairo and FPV-ARBCON-aligned Web/PWA visual theme policy verified.",
);
