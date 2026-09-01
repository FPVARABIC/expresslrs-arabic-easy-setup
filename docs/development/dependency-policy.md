# Direct-Dependency Admission Policy and Ledger

Status: **M1 Foundation admission only**

Inspected: `2026-08-20`. Source of exact versions: committed `package.json`
files and `pnpm-lock.yaml`. All versions are exact; workspace packages use
`workspace:*` and are not third-party admissions.

This ledger records why each direct external dependency exists. `M1_ACCEPTED`
means it may be used in the current public-source, synthetic/no-real-device-I/O
Foundation. It does **not** mean Release-cleared, vulnerability-free, or a
substitute for the final license/SBOM/security gates.

## Admission rules

A dependency addition or version change must include, in the same Pull Request:

1. necessity and the built-in/smaller alternatives considered;
2. exact version and regenerated lockfile from the pinned package manager;
3. runtime/build/test scope and expected bundle or CI cost;
4. upstream repository, maintenance signal, declared license, and required
   notices;
5. advisory/malware review and transitive-diff review;
6. tests/build evidence and any browser/Android impact;
7. an updated ledger row and reviewer decision.

No dependency update is auto-merged. Registry scripts, install hooks, lockfile
changes, new maintainers, repository transfers, unexpected native binaries, and
license changes receive additional review. Floating Git URLs, mutable branches,
and unpinned direct versions are prohibited.

CI requires the committed `pnpm-lock.yaml` before dependency setup and always
installs with `--frozen-lockfile`. There is no bootstrap or generated-lockfile
fallback for Pull Requests.

## Automated fail-closed license gate

CI first preserves pnpm's complete installed dependency inventory, then runs
[`check-license-policy.mjs`](../../scripts/check-license-policy.mjs) against the
machine-readable
[`dependency-license-policy.json`](../../config/dependency-license-policy.json).
An absent/malformed inventory, an unknown license expression, a package without
an exact version, or an unreviewed expression fails the job.

The allowlist records license expressions admitted for this M1 dependency set;
it is not legal clearance for Release and does not erase notice/source duties.
If package metadata is missing or reports a non-allowlisted expression, review
must add an exact `packageName + version` exception with the observed expression,
an approved allowlisted expression, and an evidence reference. Wildcards are
prohibited. The preferred response is to reject/replace the dependency or fix
its metadata; an exception is not a way to label an unknown license as safe.

The workspace currently enforces `minimumReleaseAge: 1440` and strict age
checking. The two version-scoped Vite exclusions were added only because those
exact reviewed versions were younger than the window when the lockfile was
created. An exclusion may never be broadened to a package wildcard.

## Runtime and shipped assets

| Package | Exact version | Purpose / reason over alternative | Declared license | Cost / boundary | Decision |
| --- | --- | --- | --- | --- | --- |
| `@fontsource-variable/cairo` | `5.3.0` | Self-host Cairo variable font for Arabic-first, offline/privacy-safe rendering; avoids a remote font request | `OFL-1.1` | Shipped font/CSS asset; preserve font license/attribution | `M1_ACCEPTED` |
| `react` | `19.2.8` | Component/runtime model for the accepted Web architecture; vanilla DOM would increase bespoke state/accessibility code | `MIT` | Browser runtime and bundle | `M1_ACCEPTED` |
| `react-dom` | `19.2.8` | Required React browser renderer; isolated to the Web app | `MIT` | Browser runtime and bundle; forbidden in Core | `M1_ACCEPTED` |

The Cairo license applies to the bundled font files. Final distributions must
retain the applicable OFL notice. The product repository's own license remains a
separate unresolved Release gate.

### Reviewed transitive license expression

`BlueOak-1.0.0` was accepted for dependencies after review on 2026-08-20. It is
an SPDX-listed and OSI-approved permissive license whose distribution condition
requires recipients to receive its text or official link. The M1 inventory
currently observes it on transitive tooling dependencies `lru-cache@11.5.2` and
`minimatch@10.2.6`; final distributions must preserve the applicable notice.

- [SPDX BlueOak-1.0.0 entry](https://spdx.org/licenses/BlueOak-1.0.0.html)
- [OSI approval and license text](https://opensource.org/license/blueoak-1-0-0)
- [License steward text](https://blueoakcouncil.org/license/1.0.0.html)

## Build, type, test, and quality tooling

| Package | Exact version | Scope / necessity | Declared license | Cost / boundary | Decision |
| --- | --- | --- | --- | --- | --- |
| `@eslint/js` | `10.0.1` | ESLint recommended JavaScript rules | `MIT` | CI/development only | `M1_ACCEPTED` |
| `eslint` | `10.8.1` | Static quality gate | `MIT` | CI/development only | `M1_ACCEPTED` |
| `typescript-eslint` | `8.67.0` | TypeScript parser/config/rules for ESLint | `MIT` | CI/development only | `M1_ACCEPTED` |
| `eslint-plugin-react-hooks` | `7.1.1` | Enforce React hook invariants | `MIT` | Web lint only | `M1_ACCEPTED` |
| `eslint-plugin-react-refresh` | `0.5.4` | Detect exports incompatible with safe Fast Refresh | `MIT` | Web development/lint only | `M1_ACCEPTED` |
| `globals` | `17.11.0` | Explicit ESLint runtime-global sets | `MIT` | Lint configuration only | `M1_ACCEPTED` |
| `prettier` | `3.9.6` | Deterministic formatting gate | `MIT` | CI/development only | `M1_ACCEPTED` |
| `typescript` | `6.0.3` | Strict shared contract and Web type checking | `Apache-2.0` | Compiler only; no runtime bundle | `M1_ACCEPTED` |
| `@types/react` | `19.2.18` | React compile-time declarations | `MIT` | Types only | `M1_ACCEPTED` |
| `@types/react-dom` | `19.2.4` | React DOM compile-time declarations | `MIT` | Types only | `M1_ACCEPTED` |
| `vite` | `8.2.2` | Accepted Web development/production bundler | `MIT` | Build/dev server only; exact release-age exception | `M1_ACCEPTED` |
| `@vitejs/plugin-react` | `6.1.0` | Official Vite React transform/refresh integration | `MIT` | Build/development only; exact release-age exception | `M1_ACCEPTED` |
| `vitest` | `4.1.11` | Unit/integration/UI runner aligned with Vite transforms | `MIT` | Test/CI only | `M1_ACCEPTED` |
| `@vitest/coverage-v8` | `4.1.11` | Optional V8 coverage for the selected test runner | `MIT` | Test/CI only; not a runtime dependency | `M1_ACCEPTED` |
| `jsdom` | `30.0.1` | DOM environment for Web component tests | `MIT` | Web test only; must not become a Core runtime dependency | `M1_ACCEPTED` |
| `@testing-library/react` | `16.3.2` | Accessible, user-observable React tests | `MIT` | Web test only | `M1_ACCEPTED` |
| `@testing-library/user-event` | `14.6.5` | Realistic keyboard/pointer interaction tests | `MIT` | Web test only | `M1_ACCEPTED` |
| `@testing-library/jest-dom` | `7.0.1` | Semantic DOM assertions for UI tests | `MIT` | Web test only | `M1_ACCEPTED` |

## Toolchain pins

| Tool | Pin | Role | Decision |
| --- | --- | --- | --- |
| Node.js | `>=24` in package metadata; CI currently uses major `24` | JavaScript runtime for tooling/CI | Exact patch/container digest remains a reproducible-build follow-up |
| pnpm | `11.19.0` | Workspace install and lockfile owner | `M1_ACCEPTED`; CI uses frozen lockfile |

## Outstanding gates

- CI generates and preserves the installed direct/transitive license inventory
  and enforces the fail-closed M1 policy; official candidate run #6 passed.
  Legal review and generated Release notices remain outstanding.
- CI now blocks known advisories at `high` or `critical`; broader SAST,
  signature/SBOM, and final hosting checks remain Release work.
- Review transitive changes whenever the lockfile changes; direct admission does
  not approve arbitrary future transitives.
- CI actions are pinned to verified immutable Commit SHAs; the adjacent version
  comments record `checkout v6.0.2`, `setup-node v6.5.0`, `upload-artifact
  v4.6.2`, and `pnpm/action-setup v5.0.0`. Any update requires verifying and
  reviewing both the new tag and resolved SHA.
- Record production bundle sizes and budgets after the Web shell/API wiring
  stabilizes.
- Re-run the ledger for Android/native dependencies after the real-device spike;
  no Android framework is approved by this document.

## Primary metadata links

- [React package](https://www.npmjs.com/package/react)
- [Cairo Fontsource package](https://www.npmjs.com/package/%40fontsource-variable/cairo)
- [TypeScript package](https://www.npmjs.com/package/typescript)
- [Vite package](https://www.npmjs.com/package/vite)
- [Vitest package](https://www.npmjs.com/package/vitest)
- [ESLint package](https://www.npmjs.com/package/eslint)
