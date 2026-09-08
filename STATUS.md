# Project Status

> This is the current execution checkpoint. Earlier detailed evidence remains
> available in Git history and the milestone records.

| Field | Value |
| --- | --- |
| Audit date | 2026-09-08 |
| Phase | M2 candidate with the Arabic product entry point shipped; Hardware pending |
| Branch | `claude/expresslrs-hardware-validation-i073sx` (fast-forward of `feat/m2-real-hardware-first-test`) |
| Draft PR | [#7](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/7) — Draft, unmerged |
| Candidate identity | Branch HEAD; injected at build time as the exact 40-character `VITE_BUILD_SHA` |
| Technical workbench | `TECHNICAL_WORKBENCH_READY_FOR_READ_ONLY_HARDWARE_VALIDATION` |
| Easy Mode product | `EASY_MODE_PRODUCT_INTEGRATION_IN_PROGRESS` — read-only identification shipped; guided Binding, settings, and update not built |
| Hardware validation | **NONE** |
| Public device-changing operations | **LOCKED** |
| Performance / RF claims | **NONE** |
| Stable Release claim | **NO** |

## Verification commands and exact results

Every row below was reproduced from a clean install
(`pnpm install --frozen-lockfile`) on the branch HEAD recorded in this file.
Node 22.22.2 was used locally; CI pins Node 24, which is the authoritative
environment declared in `package.json` `engines`.

| Command | Result |
| --- | --- |
| `pnpm check` | PASS (exit 0) — runs every gate below in one sequence |
| `pnpm check:ci-hygiene` | PASS — `ci.yml`, `deploy-pages.yml`, one canonical entry chain |
| `pnpm check:physical-acceptance` | PASS — 9 files, 19 recorder steps, JSON + Markdown export |
| `pnpm check:read-only-build` | PASS — 42 modules reachable from `main.tsx`; no device-write module outside the reviewed boundary |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (`--max-warnings=0`) |
| `pnpm typecheck` | PASS |
| `pnpm check:boundaries` | PASS — 9 workspace packages |
| `pnpm check:security-headers` | PASS — source and build output |
| `pnpm check:pwa-safety` | PASS — source and build output |
| `pnpm check:visual-theme` | PASS |
| `pnpm check:links` | PASS — 125 local links across 74 Markdown files |
| `pnpm check:master-plan` | PASS — headings 1–449 in order |
| `pnpm test` | PASS — see the exact counts below |
| `pnpm build` | PASS |

### Exact test counts

`pnpm test` (Vitest 4.1.11), measured, not estimated:

| Project | Files | Tests |
| --- | --- | --- |
| `core` (`packages/**`) | 38 passed | 528 passed |
| `web-hardware` (`apps/web/src/hardware/**`) | 25 passed + 2 skipped | 262 passed + 5 skipped |
| `web-ui` (remaining `apps/web/**`) | 18 passed | 165 passed |
| **Total** | **81 passed + 2 skipped (83)** | **955 passed + 5 skipped (960)** |

The 5 skipped tests are the three `*.live.*` describe blocks that reach the
official ExpressLRS mirrors. They are network-gated behind an explicit opt-in
environment variable and are skipped by default on purpose. There is no `.only`
anywhere in the repository, and no test path is excluded beyond
`node_modules`, `dist`, and `coverage`.

The `web-ui` project runs with `testTimeout: 30_000`. Its heaviest journeys
drive more than a dozen `userEvent` interactions through jsdom and measured
close to the 5s default, which failed the suite on timing alone under parallel
load while every assertion still held. That is a time budget only; the Node
projects keep the tight default, and no assertion, gate, or skip is involved.

## What the public build actually contains

This section exists because the shipped entry point and the wider workspace are
not the same thing, and earlier summaries conflated them.

`apps/web/src/main.tsx` mounts `ProductShell`, which opens in Arabic Easy Mode
and reaches the technical workbench only through an explicit user choice. Both
modes are presentations over the same device session service, so they cannot
disagree about what is connected or about who may write. See
[ADR-0022](docs/adr/ADR-0022-single-product-architecture.md).

Verified against the built bundle:

- The real firmware write path **is** compiled into the public bundle:
  `esptool-js` is a production dependency of `@elrs-easy/web`, and the
  Espressif stub flashers plus `writeFlash`/`eraseFlash` are present in
  `apps/web/dist/assets`.
- Mock devices are **not** in the public bundle. `MockScenario` and the
  synthetic scenario data resolve to zero occurrences in the built output.
- `packages/workflows`, `packages/device`, `packages/compatibility`,
  `packages/diagnostics`, `packages/platform-mock`, and
  `packages/platform-browser` are **not reachable** from `main.tsx`. Their
  marker strings (`SOFTWARE_ONLY_READINESS_REPORT`, `VERIFICATION_PASSED`,
  `KEEP_ALL_REAL_WRITES_DISABLED`) are absent from the built bundle.
  `packages/i18n` ships; `packages/domain` is reached only as a type import.
- `apps/web/src/App.tsx` and the `view-model/` modules are reachable only from
  their own tests. They are not part of the public application, and Easy Mode
  is not built on them: they depend on Mock scenarios and would present
  simulated results as device results.

Consequently the `realWritesEnabled: false` field in
`packages/workflows/src/software-readiness.ts` is a field of a reporting
object. It is **not** the control that keeps the public build read-only, and it
must not be cited as one.

## The control that actually locks device writes

`ExpressLrsParityWorkbench` takes `allowDestructiveWrites`, which defaults to
`false`. `ProductShell` mounts the workbench with no props and `main.tsx` mounts
the shell with no props, so the public build has no device-write authority.
Every settings write, Binding command, bootloader entry, flash, and recovery
path is gated on it.

Enforcement, so the lock cannot regress silently:

- `scripts/check-physical-acceptance-package.mjs` requires `main.tsx` to mount
  exactly `<ProductShell />`, requires the shell to mount exactly
  `<ExpressLrsParityWorkbench />` and Easy Mode, and fails if either names the
  write prop. Both links in the chain are checked.
- The same gate scans every non-test source under `apps/web/src` and fails if
  any module other than the workbench that defines the prop names it. This
  closes the wrapper bypass, where a new component could have been given write
  authority without `main.tsx` changing.
- `scripts/check-public-read-only-build.mjs` is a static boundary rather than a
  runtime one. It walks the real import graph from `main.tsx` and fails if any
  module performing a device write becomes reachable outside the single
  reviewed boundary that gates on the lock. Verified by making Easy Mode import
  the ESP flasher: the gate fails and prints the trail
  `main.tsx -> ProductShell -> EasySetup -> esp-flasher`. The write modules and
  their tests are kept for the future controlled-write laboratory entry point.

There is no query parameter, `localStorage` key, environment variable, or build
flag that enables writes. The only `import.meta.env` reads in shipped code are
`VITE_BUILD_SHA` and `PROD`.

## Success semantics

A flash never reports success because a write command returned. After writing,
the workbench requires a physical reconnect and then verifies, in order:

1. the reconnected device's identity against the planned Target
   (`verifyReconnectTarget`), and
2. the observed firmware version/commit against the expected release
   (`verifyObservedFirmwareBuild`).

Only then is a completion message shown. Any failure writes a
`RECOVERY_REQUIRED` checkpoint instead. The separate core state machine in
`packages/workflows/src/operation-machine.ts` enforces the same rule
structurally — `SUCCESS` is reachable only from `VERIFYING` — but that module
does not ship in the public bundle, so the workbench path above is the one that
governs the released application.

## Browser evidence

Measured in Chromium (Playwright) against the real production Pages build,
served locally. Unit tests alone were not treated as sufficient.

- Easy Mode is the landing view, Arabic with `dir="rtl"` and `lang="ar"`.
- English is a real switch in the shipped path: the heading becomes
  "Set up ExpressLRS" and direction becomes `ltr`.
- The technical workbench opens only after an explicit mode choice.
- No flashing, Binding, settings-write, recovery, or bootloader control is
  offered in either mode in the public build — absent, not merely disabled.
- The skip link is the first tab stop and targets `#product-main`.
- No console or page errors at 1280px, at a Pixel 7 viewport, or at 320px, and
  no horizontal overflow at any of them.
- The service worker installs, activates, and controls the page after a second
  navigation; an offline reload still renders the shell from the versioned
  cache. A waiting update is reported without replacing the running session.
- With no hardware attached, identification fails closed with a plain message
  and no device is described as identified.

Android capability remains `UNVERIFIED`: only layout was exercised at a phone
viewport on desktop Chromium. That is not evidence about a physical Android
device, USB permissions, or backgrounding.

## Reviewed browser policy corrections

Two changes were made to the network policy, both narrowing it:

- `http://elrs_rx.local` and `http://elrs_tx.local` were removed from
  `connect-src`. An underscore is not legal in a CSP host-source, so Chromium
  rejected both with "contains an invalid source ... It will be ignored" on
  every page load. They granted nothing and only produced console errors.
  `http://10.0.0.1` is valid and remains. Note that all three are plain HTTP
  and an HTTPS deployment blocks such requests as mixed content regardless, so
  Local HTTP discovery is not a product path; device contact is Web Serial only.
- The Artifactory mirror is no longer offered to a document. Chromium refuses
  that origin against this policy, so a browser fallback to it could never
  succeed. Node callers keep both mirrors. Its CORS, redirect, and content
  behaviour could not be observed here because this environment's egress policy
  denies both mirror hosts, so the policy was not widened on an assumption.

## Git history and deployment provenance

Resolved by ancestry and tree inspection, not by commit names:

- `main` at `cfbb7b6bf0a9c75ccd9a2b653516862b6b21f52b` contains exactly two
  paths: `.github/workflows/deploy-reviewed-pages.yml` and `README.md`. The
  application is not on `main`.
- `d3ff69b28e5387bbb208ca060df6842858eb3763` is **not** an ancestor of `main`.
  Their merge base is the repository root commit `1aaee5e`.
- `main` **is** an ancestor of `feat/m2-real-hardware-first-test`
  (`88c48786d9f79e9b11f1cc32d1e966af1200c72a`), which is therefore the only
  branch that carries both the deployment history and the full application.
- The published GitHub Pages preview was built from `d3ff69b`, because
  `main`'s workflow pins `REVIEWED_SHA` to it. The published preview is
  therefore **older than the reviewed candidate** and does not contain the
  latest hardening commits.
- Unmerged work exists on `automation/atomic-ci-cleanup-2026-09-01`: superseded
  `*-v2` modules and roughly thirty one-shot automation workflows. It is
  deliberately excluded; `check:ci-hygiene` fails if those paths reappear.

## External and physical gates still open

- identify reference TX and RX hardware on a controlled bench;
- execute the documented desktop/mobile Browser and permission matrix;
- validate reversible settings, Binding, supported flashing, reconnect, and
  recovery on explicitly named device/Target/version rows;
- review the sanitized physical-acceptance evidence tied to one immutable SHA;
- verify production-host response headers before any trusted-host claim;
- complete any remaining owner/legal decisions before a Stable Release.

Until those gates are completed, validation remains `HARDWARE: NONE`, all
public device-changing controls remain locked, and no general device-support or
performance claim is allowed.

Reference documents:

- [Physical acceptance package status](docs/hardware/PHYSICAL_ACCEPTANCE_PACKAGE_STATUS.md)
- [Physical acceptance plan](docs/hardware/PHYSICAL_ACCEPTANCE_PLAN_AR.md)
- [Hardware/Browser runbook](docs/testing/milestone-2-hardware-browser-runbook.md)
- [M2 acceptance evidence](docs/testing/milestone-2-read-only-acceptance.md)
- [Master Plan](MASTER_PLAN.md)
