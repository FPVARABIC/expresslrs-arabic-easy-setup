import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Only the build-identity check depends on this now. The Content Security
 * Policy used to be injected here for the Pages build, because GitHub Pages
 * honours no `_headers` file. It is in `index.html` instead, for every build:
 * the Android host serves the same document from an asset loader that sets no
 * headers either, so the policy has to travel with the document rather than
 * with one deployment target. Injecting it here as well produced a second meta
 * tag, and two policies intersect into one nobody reviewed.
 */
const pagesBuild = process.env.GITHUB_PAGES === "true";
const configuredBase = process.env.PAGES_BASE_PATH ?? "/";
const configuredBuildSha = process.env.VITE_BUILD_SHA?.trim() ?? "";
function normalizeBase(value: string): string {
  if (value === "/") {
    return value;
  }
  if (!/^\/[a-zA-Z0-9._-]+\/$/u.test(value)) {
    throw new Error(
      "PAGES_BASE_PATH must be / or one repository path such as /repository/",
    );
  }
  return value;
}

function validatePagesBuildSha(value: string): void {
  if (pagesBuild && !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(
      "VITE_BUILD_SHA must be the exact 40-character commit SHA for a GitHub Pages build",
    );
  }
}

validatePagesBuildSha(configuredBuildSha);

export default defineConfig({
  base: normalizeBase(configuredBase),
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
