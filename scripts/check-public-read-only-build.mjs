// Proves that the public entry point cannot reach a real device-write module.
//
// The workbench keeps the destructive UI behind a default-false prop, but a
// prop is a runtime control. This gate is a static one: it walks the actual
// import graph from apps/web/src/main.tsx and fails if any module that
// performs a real firmware write is reachable, except through the reviewed
// boundary module that owns that capability.
//
// Keeping the write modules and their tests in the repository is deliberate.
// They are needed by the future controlled-write laboratory entry point; what
// must not happen is the public read-only build acquiring them by accident.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "apps/web/src/main.tsx");

/** Modules that actually write to a device. */
const WRITE_MODULES = new Set(
  [
    "apps/web/src/hardware/esp-flasher.ts",
    "apps/web/src/hardware/stm32-dfu.ts",
    "apps/web/src/hardware/xmodem.ts",
  ].map((relative) => path.join(root, relative)),
);

/**
 * The single reviewed module allowed to import them. It gates every call on
 * `allowDestructiveWrites`, which the public entry point never grants.
 * Widening this set is a security decision, not a refactor.
 */
const WRITE_BOUNDARY = new Set(
  ["apps/web/src/components/ExpressLrsParityWorkbench.tsx"].map((relative) =>
    path.join(root, relative),
  ),
);

const failures = [];

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
      try {
        if (readFileSync(candidate)) return candidate;
      } catch {
        /* not a readable file */
      }
    }
  }
  return null;
}

const seen = new Set();

function walk(file, chain) {
  if (seen.has(file)) return;
  seen.add(file);
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const pattern = /(?:from|import)\s+["']([^"']+)["']/gu;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const resolved = resolveImport(file, match[1]);
    if (resolved === null) continue;
    if (WRITE_MODULES.has(resolved) && !WRITE_BOUNDARY.has(file)) {
      const trail = [...chain, file, resolved]
        .map((entryPath) => path.relative(root, entryPath))
        .join(" -> ");
      failures.push(`a real device-write module is reachable: ${trail}`);
    }
    walk(resolved, [...chain, file]);
  }
}

if (!existsSync(entry)) {
  failures.push("apps/web/src/main.tsx is missing");
} else {
  walk(entry, []);
}

// The boundary module must exist and must still gate on the write lock,
// otherwise the exception above would be permitting an ungated importer.
for (const boundary of WRITE_BOUNDARY) {
  if (!existsSync(boundary)) {
    failures.push(`the reviewed write boundary is missing: ${boundary}`);
    continue;
  }
  const source = readFileSync(boundary, "utf8");
  if (!source.includes("allowDestructiveWrites")) {
    failures.push(
      `the reviewed write boundary no longer gates writes: ${path.relative(root, boundary)}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Public read-only build check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Public read-only build verified (${seen.size} modules reachable from main.tsx; device writes only behind the reviewed boundary).`,
);
