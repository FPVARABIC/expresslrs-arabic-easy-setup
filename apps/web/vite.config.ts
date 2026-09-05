import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

const pagesBuild = process.env.GITHUB_PAGES === "true";
const configuredBase = process.env.PAGES_BASE_PATH ?? "/";
const configuredBuildSha = process.env.VITE_BUILD_SHA?.trim() ?? "";
const pagesContentSecurityPolicy = [
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

function pagesSecurityMetaPlugin(): Plugin {
  return {
    name: "github-pages-security-meta",
    apply: "build",
    transformIndexHtml: {
      order: "pre",
      handler() {
        if (!pagesBuild) {
          return [];
        }
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: pagesContentSecurityPolicy,
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

export default defineConfig({
  base: normalizeBase(configuredBase),
  plugins: [pagesSecurityMetaPlugin(), react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
