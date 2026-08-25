import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const publicRoot = path.join(repositoryRoot, "apps/web/public");
const distRoot = path.join(repositoryRoot, "apps/web/dist");
const sourceManifestPath = path.join(publicRoot, "manifest.webmanifest");
const sourceWorkerPath = path.join(publicRoot, "sw.js");
const sourceIconPath = path.join(publicRoot, "app-icon.svg");
const sourceIndexPath = path.join(repositoryRoot, "apps/web/index.html");
const registrationPath = path.join(
  repositoryRoot,
  "apps/web/src/pwa/register-service-worker.ts",
);
const mainPath = path.join(repositoryRoot, "apps/web/src/main.tsx");
const sensitiveFragments = [
  "/firmware",
  "/artifacts",
  "/catalog",
  "/release",
  "/update-metadata",
  "/update-manifest",
];

function fail(message) {
  throw new Error(`PWA safety policy failed: ${message}`);
}

function expectExact(value, expected, label) {
  if (value !== expected) {
    fail(`${label} must be exactly ${JSON.stringify(expected)}`);
  }
}

function validateManifest(source, label) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    fail(`${label} must be valid JSON`);
  }
  expectExact(manifest.id, "./", `${label} id`);
  expectExact(manifest.start_url, "./", `${label} start_url`);
  expectExact(manifest.scope, "./", `${label} scope`);
  expectExact(manifest.display, "standalone", `${label} display`);
  expectExact(manifest.lang, "ar", `${label} lang`);
  expectExact(manifest.dir, "rtl", `${label} dir`);
  expectExact(
    manifest.background_color,
    "#071713",
    `${label} background_color`,
  );
  expectExact(manifest.theme_color, "#071713", `${label} theme_color`);
  if (!Array.isArray(manifest.icons) || manifest.icons.length !== 1) {
    fail(`${label} must contain exactly one reviewed app icon`);
  }
  const icon = manifest.icons[0];
  expectExact(icon.src, "./app-icon.svg", `${label} icon src`);
  expectExact(icon.sizes, "any", `${label} icon sizes`);
  expectExact(icon.type, "image/svg+xml", `${label} icon type`);
  expectExact(icon.purpose, "any maskable", `${label} icon purpose`);
}

function requireNoForcedActivation(source, label) {
  if (/skipWaiting\s*\(|clients\.claim\s*\(/u.test(source)) {
    fail(`${label} must not force activation into an existing client`);
  }
}

function validateSourceWorker(source) {
  const requiredFragments = [
    'const CACHE_PREFIX = "elrs-easy-shell-"',
    'if (request.method !== "GET")',
    "requestUrl.origin !== self.location.origin",
    "SENSITIVE_PATH_FRAGMENTS.some",
    "CACHEABLE_DESTINATIONS.has(request.destination)",
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      fail(`apps/web/public/sw.js is missing reviewed guard ${fragment}`);
    }
  }
  for (const fragment of sensitiveFragments) {
    if (!source.includes(`"${fragment}"`)) {
      fail(`apps/web/public/sw.js does not explicitly bypass ${fragment}`);
    }
  }
  requireNoForcedActivation(source, "apps/web/public/sw.js");
}

function extractPrecacheUrls(source) {
  const startMarker = "const PRECACHE_URLS = Object.freeze(";
  const start = source.indexOf(startMarker);
  if (start < 0) {
    fail("built Service Worker is missing PRECACHE_URLS");
  }
  const valueStart = start + startMarker.length;
  const end = source.indexOf(");", valueStart);
  if (end < 0) {
    fail("built Service Worker has malformed PRECACHE_URLS");
  }
  try {
    return JSON.parse(source.slice(valueStart, end));
  } catch {
    fail("built Service Worker PRECACHE_URLS must be canonical JSON data");
  }
}

function validateBuiltWorker(source) {
  if (!source.includes('const BUILD_KIND = "production-precache"')) {
    fail("built Service Worker must be the production precache worker");
  }
  const cacheMatch = source.match(
    /const CACHE_NAME = `\$\{CACHE_PREFIX\}([0-9a-f]{16})`;/u,
  );
  if (cacheMatch === null) {
    fail("built Service Worker cache identity must be a 16-hex build digest");
  }
  if (!source.includes('self.addEventListener("install"')) {
    fail("built Service Worker must atomically precache during install");
  }
  if (!source.includes("cache.addAll(PRECACHE_URLS)")) {
    fail("built Service Worker must fail installation if shell precache fails");
  }
  if (!source.includes('cache.match("./index.html")')) {
    fail("built Service Worker must bind navigation to its versioned shell");
  }
  requireNoForcedActivation(source, "built Service Worker");
  for (const fragment of sensitiveFragments) {
    if (!source.includes(`"${fragment}"`)) {
      fail(`built Service Worker does not explicitly bypass ${fragment}`);
    }
  }

  const urls = extractPrecacheUrls(source);
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > 256) {
    fail("built Service Worker precache list is outside the reviewed bound");
  }
  if (new Set(urls).size !== urls.length) {
    fail("built Service Worker precache list contains duplicates");
  }
  for (const required of [
    "./index.html",
    "./manifest.webmanifest",
    "./app-icon.svg",
  ]) {
    if (!urls.includes(required)) {
      fail(`built Service Worker precache list is missing ${required}`);
    }
  }
  for (const url of urls) {
    if (
      typeof url !== "string" ||
      !url.startsWith("./") ||
      url.includes("..") ||
      url.includes("?") ||
      url.includes("#") ||
      sensitiveFragments.some((fragment) =>
        url.toLowerCase().includes(fragment),
      )
    ) {
      fail(`built Service Worker contains unsafe precache URL ${String(url)}`);
    }
  }
}

function validateSourceIndex(source) {
  if (!source.includes('rel="manifest"')) {
    fail("apps/web/index.html must link the application manifest");
  }
  if (!source.includes('href="./manifest.webmanifest"')) {
    fail("the source manifest link must be repository-relative");
  }
}

function validateBuiltIndex(source) {
  if (!source.includes("manifest.webmanifest")) {
    fail("apps/web/dist/index.html must retain the application manifest link");
  }
  if (/href=["']https?:\/\/[^"']*manifest\.webmanifest/u.test(source)) {
    fail("the built manifest link must remain same-origin");
  }
}

function validateRegistration(source) {
  if (!source.includes('updateViaCache: "none"')) {
    fail("Service Worker registration must bypass the HTTP cache for updates");
  }
  if (/\.update\s*\(|skipWaiting\s*\(/u.test(source)) {
    fail("registration must not force a worker update or activation");
  }
}

function validateMain(source) {
  if (!source.includes("if (import.meta.env.PROD)")) {
    fail("Service Worker registration must be production-only");
  }
}

const sourceManifest = await readFile(sourceManifestPath, "utf8");
const sourceWorker = await readFile(sourceWorkerPath, "utf8");
const sourceIcon = await readFile(sourceIconPath, "utf8");
const sourceIndex = await readFile(sourceIndexPath, "utf8");
const registration = await readFile(registrationPath, "utf8");
const mainSource = await readFile(mainPath, "utf8");

validateManifest(sourceManifest, "apps/web/public/manifest.webmanifest");
validateSourceWorker(sourceWorker);
validateSourceIndex(sourceIndex);
validateRegistration(registration);
validateMain(mainSource);

if (!sourceIcon.startsWith("<svg") || sourceIcon.includes("<script")) {
  fail("the reviewed SVG icon must be a static script-free SVG");
}

if (process.argv.includes("--built")) {
  const builtManifest = await readFile(
    path.join(distRoot, "manifest.webmanifest"),
    "utf8",
  );
  const builtWorker = await readFile(path.join(distRoot, "sw.js"), "utf8");
  const builtIcon = await readFile(path.join(distRoot, "app-icon.svg"), "utf8");
  const builtIndex = await readFile(path.join(distRoot, "index.html"), "utf8");

  validateManifest(builtManifest, "apps/web/dist/manifest.webmanifest");
  validateBuiltWorker(builtWorker);
  validateBuiltIndex(builtIndex);
  if (builtManifest !== sourceManifest || builtIcon !== sourceIcon) {
    fail(
      "built manifest and icon must exactly match the reviewed source files",
    );
  }
}

console.log(
  process.argv.includes("--built")
    ? "PWA safety policy verified in source and build output."
    : "PWA safety policy verified.",
);
