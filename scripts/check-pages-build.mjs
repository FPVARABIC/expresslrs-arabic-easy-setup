import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distPath = path.join(repositoryRoot, "apps/web/dist");
const indexPath = path.join(distPath, "index.html");
const expectedBase = process.env.PAGES_BASE_PATH;
const expectedBuildSha = process.env.VITE_BUILD_SHA;
const expectedPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self' https://expresslrs.github.io http://10.0.0.1 http://elrs_rx.local http://elrs_tx.local",
  "font-src 'self'",
  "form-action 'none'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self'",
].join("; ");

function fail(message) {
  throw new Error(`GitHub Pages build check failed: ${message}`);
}

async function rejectLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) {
      fail(`symbolic links are forbidden in dist: ${entry.name}`);
    }
    if (stats.isDirectory()) {
      await rejectLinks(entryPath);
    }
  }
}

if (
  expectedBase === undefined ||
  !/^\/[a-zA-Z0-9._-]+\/$/u.test(expectedBase)
) {
  fail("PAGES_BASE_PATH must name one repository path and end with /");
}
if (
  expectedBuildSha === undefined ||
  !/^[0-9a-f]{40}$/u.test(expectedBuildSha)
) {
  fail("VITE_BUILD_SHA must be the exact 40-character candidate commit SHA");
}

await rejectLinks(distPath);
const index = await readFile(indexPath, "utf8");
const policyTagMatch =
  /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/u.exec(index);
if (policyTagMatch === null) {
  fail("the exact reviewed Pages meta CSP is missing");
}
const policyContentMatch = /content=["']([^"']*)["']/u.exec(policyTagMatch[0]);
const decodedPolicy = policyContentMatch?.[1]
  ?.replaceAll("&#39;", "'")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");
if (decodedPolicy !== expectedPolicy) {
  fail("the Pages meta CSP does not exactly match the reviewed policy");
}
if (index.indexOf("<script") < policyTagMatch.index) {
  fail("the Pages meta CSP must appear before every script");
}
if (
  !/<meta[^>]+name=["']referrer["'][^>]+content=["']no-referrer["'][^>]*>/u.test(
    index,
  )
) {
  fail("the no-referrer meta policy is missing");
}

const assetReferences = [
  ...index.matchAll(/(?:src|href)=["']([^"']+)["']/gu),
].map((match) => match[1]);
const builtAssets = assetReferences.filter((reference) =>
  reference?.includes("/assets/"),
);
if (builtAssets.length === 0) {
  fail("index.html does not reference any built assets");
}
if (
  builtAssets.some(
    (reference) =>
      reference === undefined || !reference.startsWith(expectedBase),
  )
) {
  fail(`every built asset must be rooted under ${expectedBase}`);
}
if (assetReferences.some((reference) => reference?.startsWith("/assets/"))) {
  fail("root-relative /assets references break GitHub project Pages");
}
if (
  assetReferences.some((reference) => /^https?:\/\//u.test(reference ?? ""))
) {
  fail("runtime assets must not depend on an external HTTP origin");
}

const assetDirectory = path.join(distPath, "assets");
const assetFiles = await readdir(assetDirectory);
if (assetFiles.some((name) => name.endsWith(".map"))) {
  fail("source maps must not be published in the preview artifact");
}
const stylesheets = assetFiles.filter((name) => name.endsWith(".css"));
if (stylesheets.length !== 1) {
  fail("the preview must contain exactly one reviewed CSS bundle");
}
const css = await readFile(path.join(assetDirectory, stylesheets[0]), "utf8");
if (/url\(["']?https?:\/\//u.test(css) || /@import\s/u.test(css)) {
  fail("the CSS bundle must not load external resources");
}
if (!assetFiles.some((name) => name.endsWith(".woff2"))) {
  fail("the self-hosted Cairo font assets are missing");
}
const javascriptFiles = assetFiles.filter((name) => name.endsWith(".js"));
const javascriptBundles = await Promise.all(
  javascriptFiles.map((name) =>
    readFile(path.join(assetDirectory, name), "utf8"),
  ),
);
if (!javascriptBundles.some((bundle) => bundle.includes(expectedBuildSha))) {
  fail("the physical acceptance recorder is not bound to VITE_BUILD_SHA");
}

console.log(
  `GitHub Pages artifact verified for ${expectedBase} at ${expectedBuildSha} with a partial meta CSP and self-hosted assets.`,
);
