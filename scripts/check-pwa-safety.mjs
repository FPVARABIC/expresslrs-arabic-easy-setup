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

function validateWorker(source, label) {
  const requiredFragments = [
    'const CACHE_PREFIX = "elrs-easy-shell-"',
    'if (request.method !== "GET")',
    "requestUrl.origin !== self.location.origin",
    "SENSITIVE_PATH_FRAGMENTS.some",
    "CACHEABLE_DESTINATIONS.has(request.destination)",
    "const response = await fetch(request);",
    "const cached = await cache.match(request);",
    "event.respondWith(networkFirst(event.request));",
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      fail(`${label} is missing reviewed guard ${fragment}`);
    }
  }
  for (const sensitiveFragment of [
    "/firmware",
    "/artifacts",
    "/catalog",
    "/release",
    "/update-metadata",
    "/update-manifest",
  ]) {
    if (!source.includes(`"${sensitiveFragment}"`)) {
      fail(`${label} does not explicitly bypass ${sensitiveFragment}`);
    }
  }
  if (/skipWaiting\s*\(|clients\.claim\s*\(/u.test(source)) {
    fail(`${label} must not force activation into an existing client`);
  }
  const networkIndex = source.indexOf("const response = await fetch(request);");
  const cacheFallbackIndex = source.indexOf(
    "const cached = await cache.match(request);",
  );
  if (networkIndex < 0 || cacheFallbackIndex <= networkIndex) {
    fail(`${label} must be network-first with cache only as failure fallback`);
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

const sourceManifest = await readFile(sourceManifestPath, "utf8");
const sourceWorker = await readFile(sourceWorkerPath, "utf8");
const sourceIcon = await readFile(sourceIconPath, "utf8");
const sourceIndex = await readFile(sourceIndexPath, "utf8");
const registration = await readFile(registrationPath, "utf8");

validateManifest(sourceManifest, "apps/web/public/manifest.webmanifest");
validateWorker(sourceWorker, "apps/web/public/sw.js");
validateSourceIndex(sourceIndex);
validateRegistration(registration);

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
  validateWorker(builtWorker, "apps/web/dist/sw.js");
  validateBuiltIndex(builtIndex);
  if (
    builtManifest !== sourceManifest ||
    builtWorker !== sourceWorker ||
    builtIcon !== sourceIcon
  ) {
    fail("built PWA static files must exactly match the reviewed source files");
  }
}

console.log(
  process.argv.includes("--built")
    ? "PWA safety policy verified in source and build output."
    : "PWA safety policy verified.",
);
