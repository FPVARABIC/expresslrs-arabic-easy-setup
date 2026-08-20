# Project Status

| Field | Value |
| --- | --- |
| Date | 2026-08-20 |
| Phase | Milestone 1 — Foundation |
| Local branch | `research/upstream-baseline` |
| Remote repository | `https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup`; public repository with Draft PR #1 |
| Stable upstream | ExpressLRS 4.1.0 / `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` |
| Development reference | `73ce820ba51437f73f31686233b607c58e188e7b` |
| Hardware validation | None |
| Firmware modifications | None |
| Performance claims | None |
| Phase 0 exit | Accepted for Mock/Foundation; hardware/write/release gates deferred |

## Completed

- Project identity and independent local repository initialized.
- Stable and development ExpressLRS references pinned.
- Official related repositories pinned for inspection.
- Architecture, Binding, Build, Flashing, Target, Web, Android, RF, licensing, security, upstream, and performance reports completed at source-review level.
- Reuse matrix, ADR set, Phase 0 exit review, and Mock-only Milestone 1 proposal completed.
- No upstream/project Firmware source copied or modified.
- Owner approved model-agnostic M1 Foundation and Cairo typography.
- TypeScript workspace and six independent packages created: Domain, Device, Compatibility, Workflows, Mock Platform, and i18n.
- Device identity resolution is evidence-based and requires independent trust domains for `CONFIRMED`.
- Exclusive device-session ownership, fail-closed Compatibility, and verified-only operation success are implemented.
- Read-only discovery handles confirmed, unknown, ambiguous, conflicting, disconnected, and cancelled synthetic cases.
- Arabic-first responsive Web shell created with local Cairo Variable, English fallback, Easy/Advanced modes, and explicit Mock/read-only labelling.
- 29 automated test cases authored (25 Core + 4 Web/i18n).
- Production Core, Web, i18n, and the complete source/test structure pass TypeScript 6.0.3 checking.
- All 25 Core cases and all 4 Web/i18n behaviours passed deterministic local compatibility runs.
- Root CI/tooling configuration created; no publish/release action exists.

## In progress

- Generate and review `pnpm-lock.yaml`, then run the official `pnpm check` toolchain. The first CI run can preserve a bootstrap lockfile artifact; all later runs become frozen automatically once it is committed.
- Fix the first executable CI finding: skip dependency caching until `pnpm-lock.yaml` exists, then rerun Draft PR #1.
- Execute the real Vitest/React DOM suite and Vite production bundle after dependency installation.
- Complete Mock workflow coverage required by the final Milestone 1 exit gate; this checkpoint is not an M1 completion claim.

## Blocked

- Web Flasher/Targets reuse: no explicit repository-level license at inspected SHAs.
- Product repository license and distinct public brand: pending review.
- Browser/Android support: pending real-device/browser spikes, including Chrome Android 148+.
- Binding/update verification: source model defined; per-provider hardware proof pending.
- Official 4.1.0 artifact Inputs: exact Targets/toolchain identity not fully known.
- Performance hardware/controlled RF setup: not selected. This does not block Mock/Foundation.
- This execution environment cannot reach the npm registry, so dependencies/lockfile and the official formatter/linter/Vitest/Vite gates remain pending. Exact TypeScript 6.0.3 source validation and dependency-free compatibility runners were used instead; they are not presented as a replacement for `pnpm check`.

## Next

- Install the exact pinned dependencies in a network-enabled CI/local environment, commit the generated lockfile, and run `pnpm check`.
- Fix any official-toolchain findings before an M1 completion review.
- Keep the real Targets adapter synthetic/license-safe until upstream permission is resolved.
- Do not implement real hardware writes until reference hardware and provider verification exist.
- Stage/commit/push only after separate explicit authorization for each action.
