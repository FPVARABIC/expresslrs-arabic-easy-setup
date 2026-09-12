#!/usr/bin/env node
/** Verifies the exact two-file artifact emitted by Stage 2's verify job. */
import { lstatSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGE2_APK_RELATIVE_PATH = "verified-unsigned.apk";
export const STAGE2_MANIFEST_RELATIVE_PATH =
  "verified-unsigned.provenance.json";

function portable(root, path) {
  return relative(root, path).split(sep).join("/");
}

function listRegularFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      const relativePath = portable(root, path);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `symbolic links are forbidden (${JSON.stringify(relativePath)})`,
        );
      }
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        throw new Error(
          `non-regular entry is forbidden (${JSON.stringify(relativePath)})`,
        );
      }
    }
  }
  visit(root);
  return files.sort();
}

export function verifyStage2ArtifactLayout(artifactRoot) {
  const root = resolve(artifactRoot);
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("artifact root must be a real directory");
  }
  const files = listRegularFiles(root);
  const expected = [STAGE2_APK_RELATIVE_PATH, STAGE2_MANIFEST_RELATIVE_PATH];
  if (
    files.length !== expected.length ||
    files.some((file, index) => file !== expected[index])
  ) {
    throw new Error(
      `expected exactly ${expected.map(JSON.stringify).join(", ")}; found ${files.map(JSON.stringify).join(", ") || "<none>"}`,
    );
  }
  return {
    apk: join(root, STAGE2_APK_RELATIVE_PATH),
    manifest: join(root, STAGE2_MANIFEST_RELATIVE_PATH),
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const root = process.argv[2];
    if (!root)
      throw new Error("usage: verify-stage2-artifact-layout.mjs <directory>");
    process.stdout.write(
      `${JSON.stringify(verifyStage2ArtifactLayout(root))}\n`,
    );
  } catch (error) {
    console.error(
      `::error::Stage 2 artifact layout is invalid — ${error.message}`,
    );
    process.exitCode = 1;
  }
}
