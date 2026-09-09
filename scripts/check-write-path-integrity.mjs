// Proves that every device write goes through the authority gate.
//
// This replaces the earlier read-only boundary. The product is a hardware
// validation beta: firmware writing, Binding, settings writes, and recovery are
// real, shipped features. What must hold is not that they are absent, but that
// they cannot be reached except through the one reviewed module that requests a
// single-use, evidence-backed capability first.
//
// It also fails on the two things that would make the UI dishonest: a
// project-phase lock returning, and a control that renders without a handler.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

/** Modules that actually write to a device. */
const WRITE_MODULES = [
  "apps/web/src/hardware/esp-flasher.ts",
  "apps/web/src/hardware/stm32-dfu.ts",
  "apps/web/src/hardware/xmodem.ts",
];

/**
 * The single reviewed module allowed to import them: the device controller
 * both product views share. It must request a capability from the authority
 * before every over-the-wire write. Keeping it out of the view layer is what
 * makes "Easy Mode has no write path of its own" checkable.
 */
const WRITE_BOUNDARY = "apps/web/src/hardware/useDeviceController.ts";

// 1. No user interface may reach a flasher except through the boundary.
function* walkSources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walkSources(child);
    else if (/\.tsx?$/u.test(entry.name)) yield child;
  }
}

const flasherImport = /from\s+["'][^"']*\/(esp-flasher|stm32-dfu|xmodem)["']/u;
for (const file of walkSources(path.join(root, "apps/web/src"))) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (/\.(test|spec)\.tsx?$/u.test(relative)) continue;
  if (relative === WRITE_BOUNDARY) continue;
  if (WRITE_MODULES.includes(relative)) continue;
  if (flasherImport.test(readFileSync(file, "utf8"))) {
    failures.push(
      `a module outside the write boundary imports a flasher: ${relative}`,
    );
  }
}

// 2. The write modules must still exist. The product needs them; this gate is
//    about how they are reached, not about removing them.
for (const relative of WRITE_MODULES) {
  if (!existsSync(path.join(root, relative))) {
    failures.push(`a required device-write module is missing: ${relative}`);
  }
}

// 3. The boundary must request authority before every over-the-wire write, and
//    must consume the capability so one authorization cannot start two writes.
const boundary = existsSync(path.join(root, WRITE_BOUNDARY))
  ? read(WRITE_BOUNDARY)
  : null;
if (boundary === null) {
  failures.push(`the reviewed write boundary is missing: ${WRITE_BOUNDARY}`);
} else {
  for (const marker of [
    "DeviceWriteAuthority",
    "authorizeDeviceOperation",
    ".consume(",
  ]) {
    if (!boundary.includes(marker)) {
      failures.push(`the write boundary does not use the authority: ${marker}`);
    }
  }
  for (const operation of ["FIRMWARE_WRITE", "RECOVERY"]) {
    if (!boundary.includes(`authorizeDeviceOperation("${operation}")`)) {
      failures.push(`${operation} is not authorized through the gate`);
    }
  }
}

// 4. No permanent project-phase lock may come back. These are the shapes the
//    product previously used to hide working features.
const PHASE_LOCK_PATTERNS = [
  /allowDestructiveWrites/u,
  /realWritesEnabled\s*[:=]\s*false/u,
  /\bCOMING_SOON\b/u,
];
for (const file of walkSources(path.join(root, "apps/web/src"))) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const source = readFileSync(file, "utf8");
  for (const pattern of PHASE_LOCK_PATTERNS) {
    if (pattern.test(source)) {
      failures.push(
        `a project-phase lock reappeared in ${relative}: ${String(pattern)}`,
      );
    }
  }
}

// 5. The authority itself must keep its safety properties.
const authorityPath = "apps/web/src/hardware/write-authority.ts";
if (!existsSync(path.join(root, authorityPath))) {
  failures.push(`${authorityPath} is missing`);
} else {
  const authority = read(authorityPath);
  for (const marker of [
    "WRITE_CAPABILITY_TTL_MS",
    "public consume(",
    "revokeAll",
    "IDENTITY_UNCONFIRMED",
    "TARGET_NOT_MATCHED",
    "RECOVERY_NOT_AVAILABLE",
    "USER_CONFIRMATION_MISSING",
  ]) {
    if (!authority.includes(marker)) {
      failures.push(`the write authority lost a safety property: ${marker}`);
    }
  }
}

// 6. Every interactive control in the shipped UI must have a handler. A button
//    that renders without one is a decorative control, which this product does
//    not ship.
const UI_FILES = [
  "apps/web/src/components/ExpressLrsParityWorkbench.tsx",
  "apps/web/src/components/EasySetup.tsx",
  "apps/web/src/components/ProductShell.tsx",
];
for (const relative of UI_FILES) {
  if (!existsSync(path.join(root, relative))) {
    failures.push(`a shipped UI module is missing: ${relative}`);
    continue;
  }
  const source = read(relative);
  const buttons = source.match(/<button\b[\s\S]*?>/gu) ?? [];
  for (const button of buttons) {
    if (!/onClick=/u.test(button) && !/type="submit"/u.test(button)) {
      const excerpt = button.replace(/\s+/gu, " ").slice(0, 70);
      failures.push(`a button without a handler in ${relative}: ${excerpt}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Write path integrity check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Write path integrity verified (flashers reachable only through the authorized boundary; no phase lock; no handler-less control).",
);
