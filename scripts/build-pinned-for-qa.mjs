// Builds the web application the way the Pages deploy does: with an exact
// 40-character commit SHA embedded as the build identity.
//
// This exists because a build without one is not representative. The banner
// then reads `unpinned-development-build`, and the acceptance panel's candidate
// SHA is empty — so a layout defect that only a real 40-character hex run can
// cause is invisible locally and first appears in CI, which tests the actual
// Pages artifact. That happened once; this closes the gap.

import { execFileSync } from "node:child_process";

const sha =
  process.env.VITE_BUILD_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

if (!/^[0-9a-f]{40}$/u.test(sha)) {
  console.error(
    `Refusing to build with "${sha}": the build identity must be an exact 40-character commit SHA, as the deploy provides.`,
  );
  process.exit(1);
}

console.log(`Building with VITE_BUILD_SHA=${sha}`);
execFileSync("pnpm", ["build"], {
  stdio: "inherit",
  env: { ...process.env, VITE_BUILD_SHA: sha },
});
