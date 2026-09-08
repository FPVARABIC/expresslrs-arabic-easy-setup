# Project Status

> This is the current execution checkpoint. Earlier detailed evidence remains
> available in Git history and the milestone records.

| Field | Value |
| --- | --- |
| Audit date | 2026-09-08 |
| Phase | M2 physical-acceptance software candidate — independently re-verified; Hardware pending |
| Branch | `claude/expresslrs-hardware-validation-i073sx` (fast-forward of `feat/m2-real-hardware-first-test`) |
| Draft PR | [#7](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/7) — Draft, unmerged |
| Candidate identity | Branch HEAD; injected at build time as the exact 40-character `VITE_BUILD_SHA` |
| Software status | `READY_FOR_READ_ONLY_HARDWARE_VALIDATION` |
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
| `pnpm check:ci-hygiene` | PASS — `ci.yml`, `deploy-pages.yml`, one canonical workbench |
| `pnpm check:physical-acceptance` | PASS — 9 files, 19 recorder steps, JSON + Markdown export |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (`--max-warnings=0`) |
| `pnpm typecheck` | PASS |
| `pnpm check:boundaries` | PASS — 9 workspace packages |
| `pnpm check:security-headers` | PASS — source and build output |
| `pnpm check:pwa-safety` | PASS — source and build output |
| `pnpm check:visual-theme` | PASS |
| `pnpm check:links` | PASS — 123 local links across 73 Markdown files |
| `pnpm check:master-plan` | PASS — headings 1–449 in order |
| `pnpm test` | PASS — see the exact counts below |
| `pnpm build` | PASS |

### Exact test counts

`pnpm test` (Vitest 4.1.11), measured, not estimated:

| Project | Files | Tests |
| --- | --- | --- |
| `core` (`packages/**`) | 38 passed | 528 passed |
| `web-hardware` (`apps/web/src/hardware/**`) | 25 passed + 2 skipped | 259 passed + 5 skipped |
| `web-ui` (remaining `apps/web/**`) | 16 passed | 151 passed |
| **Total** | **79 passed + 2 skipped (81)** | **938 passed + 5 skipped (943)** |

The 5 skipped tests are the three `*.live.*` describe blocks that reach the
official ExpressLRS mirrors. They are network-gated behind an explicit opt-in
environment variable and are skipped by default on purpose. There is no `.only`
anywhere in the repository, and no test path is excluded beyond
`node_modules`, `dist`, and `coverage`.

## What the public build actually contains

This section exists because the shipped entry point and the wider workspace are
not the same thing, and earlier summaries conflated them.

`apps/web/src/main.tsx` mounts `ExpressLrsParityWorkbench` and nothing else.
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
  their own tests. They are not part of the public application.

Consequently the `realWritesEnabled: false` field in
`packages/workflows/src/software-readiness.ts` is a field of a reporting
object. It is **not** the control that keeps the public build read-only, and it
must not be cited as one.

## The control that actually locks device writes

`ExpressLrsParityWorkbench` takes `allowDestructiveWrites`, which defaults to
`false`. `main.tsx` mounts the workbench with no props, so the public build has
no device-write authority. Every settings write, Binding command, bootloader
entry, flash, and recovery path is gated on it.

Enforcement, so the lock cannot regress silently:

- `scripts/check-physical-acceptance-package.mjs` requires `main.tsx` to mount
  exactly `<ExpressLrsParityWorkbench />` and to never name
  `allowDestructiveWrites`.
- The same gate scans every non-test source under `apps/web/src` and fails if
  any module other than the workbench that defines the prop names it. This
  closes the wrapper bypass, where a new component could have been given write
  authority without `main.tsx` changing.

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
