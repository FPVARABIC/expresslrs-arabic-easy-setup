import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = path.join(repositoryRoot, "apps/web/public/_headers");
const builtPath = path.join(repositoryRoot, "apps/web/dist/_headers");
const documentPath = path.join(repositoryRoot, "apps/web/index.html");
const builtDocumentPath = path.join(repositoryRoot, "apps/web/dist/index.html");
/**
 * `frame-ancestors` is ignored in a meta policy, so the document carries every
 * other directive and the header keeps that one. Anything else diverging
 * between the two would mean the Android WebView — which gets no headers at
 * all, and is the one context where this page can reach USB hardware — runs
 * under a policy nobody reviewed.
 */
const documentOnlyOmissions = new Set(["frame-ancestors"]);
// `http://elrs_rx.local` and `http://elrs_tx.local` were removed: an underscore
// is not legal in a CSP host-source, so Chromium rejected both with "contains
// an invalid source ... It will be ignored" on every page load. They granted
// nothing and only produced console errors. Removing them narrows the declared
// policy to what a browser actually enforces.
const expectedConnectSources = new Set([
  "'self'",
  "https://expresslrs.github.io",
  "http://10.0.0.1",
]);
const requiredHeaders = new Map([
  ["referrer-policy", "no-referrer"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["cross-origin-opener-policy", "same-origin"],
  ["cross-origin-resource-policy", "same-origin"],
  [
    "permissions-policy",
    "bluetooth=(), camera=(), geolocation=(), hid=(), local-network=(self), microphone=(), payment=(), serial=(self), usb=(self)",
  ],
]);
const expectedDirectiveNames = new Set([
  "default-src",
  "base-uri",
  "connect-src",
  "font-src",
  "form-action",
  "frame-ancestors",
  "img-src",
  "manifest-src",
  "object-src",
  "script-src",
  "style-src",
  "worker-src",
]);

function fail(message) {
  throw new Error(`Browser security header policy failed: ${message}`);
}

function parseHeaderFile(source, label) {
  const lines = source.split(/\r?\n/u);
  if (lines[0]?.trim() !== "/*") {
    fail(`${label} must begin with the catch-all route /*`);
  }

  const headers = new Map();
  for (const line of lines.slice(1)) {
    if (line.trim() === "") {
      continue;
    }
    if (!/^\s{2}\S/u.test(line)) {
      fail(`${label} contains an unscoped or malformed header line`);
    }
    const separator = line.indexOf(":");
    if (separator < 0) {
      fail(`${label} contains a header without a value`);
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(name)) {
      fail(`${label} declares ${name} more than once`);
    }
    headers.set(name, value);
  }
  return headers;
}

function parseDirectives(policy) {
  const directives = new Map();
  for (const segment of policy.split(";")) {
    const tokens = segment.trim().split(/\s+/u).filter(Boolean);
    const name = tokens.shift();
    if (name === undefined) {
      continue;
    }
    if (directives.has(name)) {
      fail(`Content-Security-Policy repeats ${name}`);
    }
    directives.set(name, tokens);
  }
  return directives;
}

function requireExactDirective(directives, name, expected) {
  const actual = directives.get(name);
  if (
    actual === undefined ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(`${name} must be exactly ${expected.join(" ")}`);
  }
}

function validate(source, label) {
  const headers = parseHeaderFile(source, label);
  for (const [name, expected] of requiredHeaders) {
    if (headers.get(name) !== expected) {
      fail(`${label} must declare ${name}: ${expected}`);
    }
  }

  const policy = headers.get("content-security-policy");
  if (policy === undefined) {
    fail(`${label} is missing Content-Security-Policy`);
  }
  if (/\*|'unsafe-inline'|'unsafe-eval'/u.test(policy)) {
    fail(
      "Content-Security-Policy contains a wildcard or unsafe execution source",
    );
  }

  const directives = parseDirectives(policy);
  if (
    directives.size !== expectedDirectiveNames.size ||
    [...directives.keys()].some((name) => !expectedDirectiveNames.has(name))
  ) {
    fail("Content-Security-Policy must contain only the reviewed directives");
  }
  requireExactDirective(directives, "default-src", ["'none'"]);
  requireExactDirective(directives, "base-uri", ["'none'"]);
  requireExactDirective(directives, "font-src", ["'self'"]);
  requireExactDirective(directives, "object-src", ["'none'"]);
  requireExactDirective(directives, "frame-ancestors", ["'none'"]);
  requireExactDirective(directives, "form-action", ["'none'"]);
  requireExactDirective(directives, "img-src", ["'self'", "data:"]);
  requireExactDirective(directives, "manifest-src", ["'self'"]);
  requireExactDirective(directives, "script-src", ["'self'"]);
  requireExactDirective(directives, "style-src", ["'self'"]);
  requireExactDirective(directives, "worker-src", ["'self'"]);

  const connectSources = directives.get("connect-src");
  if (
    connectSources === undefined ||
    connectSources.length !== expectedConnectSources.size ||
    connectSources.some((source) => !expectedConnectSources.has(source))
  ) {
    fail(
      "connect-src must contain only self, the official Web Flasher mirror, and the three reviewed local ExpressLRS origins",
    );
  }
  return headers;
}

/**
 * Reads the document policy out of the meta tag.
 *
 * A page served without headers — GitHub Pages, or the Android asset loader —
 * has only this. Exactly one tag is required: two meta policies do not replace
 * each other, they intersect, and the effective policy is then one nobody
 * reviewed. A build that injects a second copy is the way that happens, and it
 * is what this catches.
 */
function documentPolicy(html, label) {
  const tags = [
    ...html.matchAll(
      /<meta\s[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/giu,
    ),
  ];
  if (tags.length === 0) {
    fail(`${label} does not carry a Content-Security-Policy meta tag`);
  }
  if (tags.length > 1) {
    fail(
      `${label} carries ${tags.length} Content-Security-Policy meta tags; ` +
        "two policies intersect into one that was never reviewed",
    );
  }
  // The delimiter is captured and back-referenced: a policy full of `'self'`
  // inside a double-quoted attribute would otherwise be cut at its first
  // apostrophe, and the truncated policy would compare as a directive
  // mismatch rather than as the parsing bug it is.
  const content = /content=(["'])([\s\S]*?)\1/u.exec(tags[0][0]);
  if (content === null) {
    fail(`${label} has a Content-Security-Policy meta tag with no content`);
  }
  // A build tool may HTML-escape the attribute, which turns every `'self'`
  // into `&#39;self&#39;`. That is the same policy and must parse as one.
  return content[2]
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

function validateDocument(html, headerPolicy, label) {
  const policy = documentPolicy(html, label);
  if (/\*|'unsafe-inline'|'unsafe-eval'/u.test(policy)) {
    fail(
      `${label} document policy contains a wildcard or unsafe execution source`,
    );
  }
  const directives = parseDirectives(policy);
  const expected = parseDirectives(headerPolicy);
  for (const omitted of documentOnlyOmissions) {
    if (directives.has(omitted)) {
      fail(
        `${label} document policy declares ${omitted}, which a meta policy ignores`,
      );
    }
    expected.delete(omitted);
  }
  if (directives.size !== expected.size) {
    fail(
      `${label} document policy does not declare the same directives as the header policy`,
    );
  }
  for (const [name, tokens] of expected) {
    requireExactDirective(directives, name, tokens);
  }
}

const source = await readFile(sourcePath, "utf8");
const sourceHeaders = validate(source, "apps/web/public/_headers");
const sourcePolicy = sourceHeaders.get("content-security-policy");
validateDocument(
  await readFile(documentPath, "utf8"),
  sourcePolicy,
  "apps/web/index.html",
);

if (process.argv.includes("--built")) {
  const built = await readFile(builtPath, "utf8");
  validate(built, "apps/web/dist/_headers");
  if (built !== source) {
    fail(
      "the built header file does not exactly match the reviewed source policy",
    );
  }
  validateDocument(
    await readFile(builtDocumentPath, "utf8"),
    sourcePolicy,
    "apps/web/dist/index.html",
  );
}

console.log(
  process.argv.includes("--built")
    ? "Browser security headers verified in source and build output, header and document."
    : "Browser security headers verified in the header file and the document.",
);
