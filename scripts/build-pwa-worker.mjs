import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distRoot = path.join(repositoryRoot, "apps/web/dist");
const workerPath = path.join(distRoot, "sw.js");
const excludedFiles = new Set(["_headers", "sw.js"]);
const sensitiveFragments = Object.freeze([
  "/firmware",
  "/artifacts",
  "/catalog",
  "/release",
  "/update-metadata",
  "/update-manifest",
]);

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile() && !excludedFiles.has(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function isSensitivePath(relativePath) {
  const normalized = `/${relativePath.toLowerCase()}`;
  return sensitiveFragments.some((fragment) => normalized.includes(fragment));
}

function toScopedUrl(relativePath) {
  return `./${relativePath.replaceAll("\\", "/")}`;
}

async function buildShellIdentity(relativeFiles) {
  const aggregate = createHash("sha256");
  for (const relativePath of relativeFiles) {
    const bytes = await readFile(path.join(distRoot, relativePath));
    const fileDigest = createHash("sha256").update(bytes).digest("hex");
    aggregate.update(relativePath, "utf8");
    aggregate.update("\0", "utf8");
    aggregate.update(fileDigest, "ascii");
    aggregate.update("\n", "utf8");
  }
  return aggregate.digest("hex").slice(0, 16);
}

function createWorkerSource({ buildId, precacheUrls }) {
  const serializedUrls = JSON.stringify(precacheUrls, null, 2);
  const serializedSensitive = JSON.stringify(sensitiveFragments, null, 2);
  return `/* global self, caches */

const BUILD_KIND = "production-precache";
const CACHE_PREFIX = "elrs-easy-shell-";
const CACHE_NAME = \`\${CACHE_PREFIX}${buildId}\`;
const PRECACHE_URLS = Object.freeze(${serializedUrls});
const SENSITIVE_PATH_FRAGMENTS = Object.freeze(${serializedSensitive});

function isSensitiveUrl(url) {
  return SENSITIVE_PATH_FRAGMENTS.some((fragment) =>
    url.pathname.toLowerCase().includes(fragment),
  );
}

function isEligibleRequest(request) {
  if (request.method !== "GET") {
    return false;
  }
  const url = new URL(request.url);
  return url.origin === self.location.origin && !isSensitiveUrl(url);
}

async function currentCache() {
  return caches.open(CACHE_NAME);
}

async function serveNavigation(request) {
  const cache = await currentCache();
  const shell = await cache.match("./index.html");
  if (shell !== undefined) {
    return shell;
  }
  return fetch(request);
}

async function serveStatic(request) {
  const cache = await currentCache();
  const cached = await cache.match(request);
  if (cached !== undefined) {
    return cached;
  }
  return fetch(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    currentCache().then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  if (!isEligibleRequest(event.request)) {
    return;
  }
  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(serveNavigation(event.request));
    return;
  }
  event.respondWith(serveStatic(event.request));
});
`;
}

const relativeFiles = (await collectFiles(distRoot))
  .filter((relativePath) => !isSensitivePath(relativePath))
  .sort((left, right) => left.localeCompare(right, "en"));

for (const required of ["index.html", "manifest.webmanifest", "app-icon.svg"]) {
  if (!relativeFiles.includes(required)) {
    throw new Error(`PWA build cannot continue without ${required}`);
  }
}

if (relativeFiles.length === 0 || relativeFiles.length > 256) {
  throw new Error("PWA shell file count is outside the reviewed bound");
}

const buildId = await buildShellIdentity(relativeFiles);
const precacheUrls = Object.freeze(relativeFiles.map(toScopedUrl));
await writeFile(workerPath, createWorkerSource({ buildId, precacheUrls }), "utf8");
console.log(
  `Generated versioned PWA worker ${buildId} for ${precacheUrls.length} shell files.`,
);
