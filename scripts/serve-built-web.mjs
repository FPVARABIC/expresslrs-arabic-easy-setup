// Serves the built web application the way a static host does, including the
// headers in `_headers`.
//
// `vite preview` ignores that file, so a preview server proves nothing about
// the Content-Security-Policy or the Permissions-Policy that actually ship.
// The browser QA suite needs the real headers to make a `BROWSER_VERIFIED`
// claim about them, so this server parses `_headers` and applies it.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "apps/web/dist");
const port = Number(process.env.PORT ?? 4173);

const MIME = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
  }),
);

/** Parses the `/*` block of a `_headers` file into plain header pairs. */
async function readGlobalHeaders() {
  const headers = new Map();
  let contents;
  try {
    contents = await readFile(path.join(distRoot, "_headers"), "utf8");
  } catch {
    return headers;
  }
  let inGlobalBlock = false;
  for (const line of contents.split("\n")) {
    if (!line.startsWith(" ") && line.trim().length > 0) {
      inGlobalBlock = line.trim() === "/*";
      continue;
    }
    if (!inGlobalBlock) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    headers.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
  }
  return headers;
}

const globalHeaders = await readGlobalHeaders();

/**
 * The base path this build was compiled for.
 *
 * A Pages build rewrites every asset URL to `/<repo>/assets/...`, so serving
 * it from the root returns `index.html` for each asset and the browser rejects
 * them on MIME type. Detecting the prefix from the build's own markup lets the
 * browser QA run against the exact artifact that ships, base path and all,
 * instead of against a second build made only for testing.
 */
async function readBasePath() {
  try {
    const html = await readFile(path.join(distRoot, "index.html"), "utf8");
    return /(?:src|href)="(\/[^"]*\/)assets\//u.exec(html)?.[1] ?? "/";
  } catch {
    return "/";
  }
}

const basePath = await readBasePath();

function resolveWithinDist(urlPath) {
  let decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (basePath !== "/" && decoded.startsWith(basePath)) {
    decoded = `/${decoded.slice(basePath.length)}`;
  }
  const candidate = path.resolve(distRoot, `.${decoded}`);
  // Never serve outside the build output, whatever the request path claims.
  return candidate === distRoot ||
    candidate.startsWith(`${distRoot}${path.sep}`)
    ? candidate
    : null;
}

const server = createServer((request, response) => {
  void (async () => {
    const resolved = resolveWithinDist(request.url ?? "/");
    if (resolved === null) {
      response.writeHead(403).end("forbidden");
      return;
    }
    let filePath = resolved;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = path.join(filePath, "index.html");
    } catch {
      // A single-page application serves its shell for unknown routes.
      filePath = path.join(distRoot, "index.html");
    }
    let body;
    try {
      body = await readFile(filePath);
    } catch {
      response.writeHead(404).end("not found");
      return;
    }
    for (const [name, value] of globalHeaders) response.setHeader(name, value);
    response.setHeader(
      "Content-Type",
      MIME.get(path.extname(filePath)) ?? "application/octet-stream",
    );
    response.writeHead(200).end(body);
  })();
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `Serving apps/web/dist with _headers on http://127.0.0.1:${port}${basePath}`,
  );
});
