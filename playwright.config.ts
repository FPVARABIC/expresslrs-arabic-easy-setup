import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

/**
 * Permanent browser QA. These tests run the built application in a real
 * Chromium, so the claims they make are `BROWSER_VERIFIED` rather than
 * `EMULATOR_VERIFIED`: a jsdom test cannot see a Content-Security-Policy, a
 * service worker lifecycle, or whether `navigator.serial` exists.
 *
 * They deliberately do not claim anything about hardware. No device is
 * attached, so every device path here is exercised only up to the point where
 * a real port would be required.
 */
export default defineConfig({
  testDir: "browser-qa",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI === undefined ? "list" : [["list"], ["github"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Honour a Chromium the environment already pins, so CI and a
        // preinstalled sandbox both run the same binary without a download.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH === undefined
          ? {}
          : {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
              },
            }),
      },
    },
  ],
  webServer: {
    // Serves the real production build with the headers that actually ship,
    // which `vite preview` does not apply.
    command: "node scripts/serve-built-web.mjs",
    env: { PORT: "4173" },
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
});
