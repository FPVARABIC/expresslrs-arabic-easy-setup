import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const WEB_HARDWARE_TESTS = "apps/web/src/hardware/**/*.{test,spec}.ts";
const GENERATED_TEST_PATHS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
];

export default defineConfig({
  test: {
    projects: [
      {
        extends: false,
        test: {
          name: "core",
          environment: "node",
          include: ["packages/**/*.{test,spec}.{ts,tsx}"],
          exclude: GENERATED_TEST_PATHS,
        },
      },
      {
        extends: false,
        test: {
          name: "web-hardware",
          environment: "node",
          include: [WEB_HARDWARE_TESTS],
          exclude: GENERATED_TEST_PATHS,
        },
      },
      {
        extends: false,
        plugins: [react()],
        test: {
          name: "web-ui",
          environment: "jsdom",
          include: ["apps/web/**/*.{test,spec}.{ts,tsx}"],
          exclude: [WEB_HARDWARE_TESTS, ...GENERATED_TEST_PATHS],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
