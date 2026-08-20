# Project Status

| Field | Value |
| --- | --- |
| Date | 2026-08-20 |
| Phase | Milestone 2A — Hardened read-only real-device candidate |
| Local branch | `feat/read-only-device-foundation` |
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
- TypeScript workspace and eight independent packages created: Domain, Diagnostics, Device, Compatibility, Workflows, Browser Platform, Mock Platform, and i18n (nine workspace projects including Web).
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
- The M1 evidence-only successor at `5c543cb` also passed [GitHub Actions run #7](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/actions/runs/32390823563); owner acceptance review remains pending.
- A separate M2A branch now contains a real Browser Local HTTP candidate that performs one explicit `GET /config` against only the three pinned ExpressLRS local origins. It does not scan, redirect, send credentials, or expose any write method.
- The M2A parser requires a bounded JSON response and rebuilds only allowlisted device-reported facts. Raw response data, UID, Wi-Fi options, SSID, password, `lua_name`, and unknown fields do not cross the adapter boundary.
- All Local HTTP facts remain `UNVALIDATED` in one self-reported trust domain. Web composition deliberately uses an empty Target Catalog, so the resulting identity remains `UNKNOWN` and cannot authorize Binding or update.
- Device-session leases now use exact opaque-object ownership, while the Core boundary rebuilds and freezes descriptors, evidence, and capabilities supplied by providers.
- The Local HTTP transport now uses fixed 256 KiB storage, rejects empty or excessive chunks, enforces a strict JSON/UTF-8 boundary, and releases an origin only after normal completion or proven successful cleanup. A rejected, absent, accessor-backed, or otherwise unprovable cleanup keeps that origin fail-closed quarantined for the current JavaScript realm.
- Provider-controlled error reasons/details, write receipts, verification diagnostics, reconnect descriptors, and attacker-controlled audit field names no longer cross Workflow/audit export boundaries without a Core-owned rebuild. Accessor-backed provider metadata is treated as absent rather than executed, and Audit output uses bounded counts and fixed categories.
- A framework-independent Diagnostics package creates value-free, fixed-category support reports and rejects inconsistent success/reconnect claims.
- The real-device UI now exposes honest Workflow progress, manual refresh/reconnect snapshot comparison, focus movement, connection guidance, and explicit safe support copy without polling or a live-connection claim.
- A production `_headers` artifact and deterministic checker restrict CSP connections to self plus the three reviewed ExpressLRS origins and enforce the policy in source/build output.
- The current local M2A candidate passes the complete quality gate: 332/332 Vitest cases across 22 files, 94.46% statement / 88.69% branch / 98.84% function / 94.41% line coverage, TypeScript, ESLint with zero warnings, formatting, nine-project dependency boundaries, 53 local links across 51 Markdown files, the Master Plan contract, production security-header source/build verification, and the Web production build. The frozen offline install passes all 272 lockfile entries, the license policy passes 248 package/version records, and the high-severity advisory audit finds no known vulnerability. This is not Hardware evidence.

## In progress

- Review the isolated M2A implementation candidate and complete the still-pending M1 owner acceptance review.
- Execute the prepared reference-hardware/browser runbook and matrix for TX and RX Local HTTP reads, disconnect/reconnect, Local Network Access, device-AP switching, and mobile behavior.
- Keep all Binding, configuration, reboot, update, Firmware, and RF paths disabled in the real-device adapter.

## Blocked

- Web Flasher/Targets reuse: no explicit repository-level license at inspected SHAs.
- Product repository license and distinct public brand: pending review.
- Browser support: code candidate exists, but desktop/mobile/LNA/mixed-content/device-AP behavior remains unvalidated on reference hardware, including Chrome Android 148+.
- Real Binding/update verification: Synthetic contract proven; per-provider hardware proof pending.
- Official 4.1.0 artifact Inputs: exact Targets/toolchain identity not fully known.
- Performance hardware/controlled RF setup: not selected. This does not block Mock/Foundation.
- A reviewed CSP deployment artifact now exists, but the eventual production host must serve and verify the same response header; `_headers` compatibility alone is not deployed-host evidence.
- Official CI for the hardened M2A branch is pending commit/push. This slice adds no external dependency, and the local online advisory audit is green.
- The public repository does not yet publish a private vulnerability-reporting route. Non-sensitive Issues remain possible, but sensitive exploit details must not be posted publicly.

## Next

- Commit and push the hardened M2A candidate, open its own Draft PR, and require green official CI.
- Conduct owner review of M1 evidence and the M2A candidate.
- Run the documented read-only Hardware/Browser runbook; record exact device, Firmware, browser, OS, field behavior, disconnect/reconnect, and privacy observations.
- Keep the real Targets adapter empty/license-safe until upstream permission is resolved; never promote a self-reported Target alone.
- Do not implement real hardware writes until reference hardware and provider verification exist.
