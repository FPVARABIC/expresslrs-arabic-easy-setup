#!/usr/bin/env node
/**
 * Verifies the exact file layout produced by the unsigned Android-candidate
 * artifact. The candidate controls the archive contents, so the signer does
 * not search for a convenient-looking APK and does not follow symbolic links.
 */
import { lstatSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const UNSIGNED_APK_RELATIVE_PATH =
  "app/build/outputs/apk/physicalTest/app-physicalTest-unsigned.apk";
export const UNSIGNED_MANIFEST_RELATIVE_PATH =
  "app-physicalTest-unsigned.provenance.json";

function portableRelativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function describePaths(paths) {
  return paths.map((path) => JSON.stringify(path)).join(", ");
}

function listRegularFiles(root) {
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const absolutePath = join(directory, entry.name);
      const relativePath = portableRelativePath(root, absolutePath);

      if (entry.isSymbolicLink()) {
        throw new Error(
          `symbolic links are forbidden (${JSON.stringify(relativePath)})`,
        );
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(
          `non-regular entries are forbidden (${JSON.stringify(relativePath)})`,
        );
      }
      files.push(relativePath);
    }
  }

  visit(root);
  return files.sort();
}

export function verifyUnsignedCandidateLayout(candidateRoot) {
  const root = resolve(candidateRoot);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("candidate root must be a real directory");
  }

  const files = listRegularFiles(root);
  const apkFiles = files.filter((path) => path.endsWith(".apk"));
  if (apkFiles.length !== 1) {
    throw new Error(
      `expected exactly one APK, found ${String(apkFiles.length)}: ${describePaths(apkFiles) || "<none>"}`,
    );
  }
  if (apkFiles[0] !== UNSIGNED_APK_RELATIVE_PATH) {
    throw new Error(
      `the only APK is ${JSON.stringify(apkFiles[0])}, not ${UNSIGNED_APK_RELATIVE_PATH}`,
    );
  }
  if (!files.includes(UNSIGNED_MANIFEST_RELATIVE_PATH)) {
    throw new Error(
      `the artifact contains no ${UNSIGNED_MANIFEST_RELATIVE_PATH}`,
    );
  }

  const allowedFiles = new Set([
    UNSIGNED_APK_RELATIVE_PATH,
    UNSIGNED_MANIFEST_RELATIVE_PATH,
  ]);
  const unexpectedFiles = files.filter((path) => !allowedFiles.has(path));
  if (unexpectedFiles.length > 0) {
    throw new Error(
      `the artifact contains unexpected file(s): ${describePaths(unexpectedFiles)}`,
    );
  }

  return {
    apk: join(root, ...UNSIGNED_APK_RELATIVE_PATH.split("/")),
    manifest: join(root, UNSIGNED_MANIFEST_RELATIVE_PATH),
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const candidateRoot = process.argv[2];
    if (!candidateRoot) {
      throw new Error(
        "usage: verify-unsigned-candidate-layout.mjs <directory>",
      );
    }
    process.stdout.write(
      `${JSON.stringify(verifyUnsignedCandidateLayout(candidateRoot))}\n`,
    );
  } catch (error) {
    console.error(
      `::error::candidate artifact layout is invalid — ${error.message}`,
    );
    process.exitCode = 1;
  }
}
