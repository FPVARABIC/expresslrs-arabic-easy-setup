import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: false,
        test: {
          name: "core",
          environment: "node",
          include: ["packages/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        extends: false,
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/**/*.{test,spec}.{ts,tsx}"],
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
