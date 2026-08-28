import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = path.join(repositoryRoot, "apps/web/public/_headers");
const builtPath = path.join(repositoryRoot, "apps/web/dist/_headers");
const expectedConnectSources = new Set([
  "'self'",
  "http://10.0.0.1",
  "http://elrs_rx.local",
  "http://elrs_tx.local",
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
      "connect-src must contain only self and the three reviewed ExpressLRS origins",
    );
  }
  return headers;
}

const source = await readFile(sourcePath, "utf8");
validate(source, "apps/web/public/_headers");

if (process.argv.includes("--built")) {
  const built = await readFile(builtPath, "utf8");
  validate(built, "apps/web/dist/_headers");
  if (built !== source) {
    fail(
      "the built header file does not exactly match the reviewed source policy",
    );
  }
}

console.log(
  process.argv.includes("--built")
    ? "Browser security headers verified in source and build output."
    : "Browser security headers verified.",
);
