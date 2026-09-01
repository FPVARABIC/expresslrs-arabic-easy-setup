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
- Arabic-first responsive Web shell created with local Cairo Variable, English fallback, Easy/Advanced modes, and explicit Mock/no-hardware-write labelling.
- The published baseline contained 29 automated cases (25 Core + 4 Web); the local M1 candidate now passes 176/176 Vitest cases across 16 files, including adversarial input-mutation, cancellation, malformed/non-string-version, observer-failure, workflow/privacy, and i18n matrices.
- The full local `pnpm check` gate passes: Prettier, ESLint with zero warnings, TypeScript, dependency boundaries for seven workspace packages, 45 local links across 47 Markdown files, the complete `MASTER_PLAN.md` contract, all 176 tests, and the production Web build.
- The frozen offline install confirms that the lockfile is current and all 272 lockfile entries pass pnpm's configured supply-chain policies.
- The dependency license policy passes for 248 package/version records across 11 observed expressions with no exact exception, and the high-severity advisory audit reports no known vulnerability.
- Root CI/tooling configuration created; no publish/release action exists.
- Draft PR #1 CI now reaches dependency installation; run #2 generated the reviewed bootstrap lockfile artifact and exposed the first source gate at formatting.
- Draft PR #1 CI run #4 passed frozen dependency installation, ESLint, and TypeScript; 27 of 29 Vitest cases passed, with the two Web failures traced to missing DOM cleanup between tests.
- The CI-generated Prettier patch was reviewed and applied to 19 source/config files; the generated `pnpm-lock.yaml` keeps pnpm's native format and is excluded from Prettier.
- Explicit React DOM cleanup now covers both root-workspace and direct Web Vitest runs.
- Draft PR #1 CI run #5 passed the complete published baseline: frozen install, Prettier, ESLint, TypeScript, 29/29 tests, and production Web build.
- Vitest is split into Core/Node and Web/jsdom projects; Core no longer receives React DOM test setup.
- Dependency direction and Markdown local links now have deterministic CI checkers.
- Typed Synthetic Easy Binding and Firmware Update workflows now re-identify after reconnect and require independent verification before `SUCCESS`.
- Interrupted write, no-return, wrong Target/version, no-link, Model Mismatch, permission denial, invalid artifact, major mismatch, retry, and per-stage disconnect fixtures are implemented.
- A provisional `FoundationExpressLrsModule` proves Discovery/Binding/Update can be invoked outside React and is exercised by the Web Mock preview.
- Structured Audit events, fail-closed Allowlist privacy scrubbing, threat model, storage registry, and dependency-admission ledger are implemented.
- `ArtifactProvenance` and `VerificationPlan` are provisional standalone Domain shapes only; they are not yet required/populated by the M1 module or update workflow.
- CI requires the committed lockfile with frozen installation and has no PR bootstrap fallback. It is also configured for dependency inventory plus a fail-closed license policy, high-severity advisory audit, Core browser/DOM boundary enforcement, Markdown-link checking, and verified immutable Action pins.
- Draft PR #1 GitHub Actions run #6 passed on candidate commit `9db3f268d32732840d475281cd2435acbbe0f7bb`, including the frozen install, all quality/build gates, license inventory/policy, and high-severity advisory audit.

## In progress

- Commit and push the immutable CI evidence update, confirm its documentation-only successor check remains green, then conduct the owner acceptance review.

## Blocked

- Web Flasher/Targets reuse: no explicit repository-level license at inspected SHAs.
- Product repository license and distinct public brand: pending review.
- Browser/Android support: pending real-device/browser spikes, including Chrome Android 148+.
- Real Binding/update verification: Synthetic contract proven; per-provider hardware proof pending.
- Official 4.1.0 artifact Inputs: exact Targets/toolchain identity not fully known.
- Performance hardware/controlled RF setup: not selected. This does not block Mock/Foundation.
- Production CSP is documented but not deployed; it remains a trusted-hosting/Release blocker.
- The public repository does not yet publish a private vulnerability-reporting route. Non-sensitive Issues remain possible, but sensitive exploit details must not be posted publicly.

## Next

- Perform the M1 owner acceptance review after the evidence-only successor CI passes.
- Keep the real Targets adapter synthetic/license-safe until upstream permission is resolved.
- Do not implement real hardware writes until reference hardware and provider verification exist.
- Stage/commit/push only after separate explicit authorization for each action.
