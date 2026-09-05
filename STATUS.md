# Project Status

> This is the current execution checkpoint. Earlier detailed evidence remains
> available in Git history and the milestone records.

| Field | Value |
| --- | --- |
| Date | 2026-09-04 |
| Phase | M2 physical-acceptance software candidate — locally verified; Hardware pending |
| Branch | `feat/m2-real-hardware-first-test` |
| Draft PR | [#7](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/7) — Draft, unmerged |
| Candidate identity | Branch HEAD; injected at build time as the exact 40-character `VITE_BUILD_SHA` |
| Draft PR CI | **PENDING POST-PUSH VERIFICATION** |
| Full local Vitest | 79 files passed + 2 skipped (81 total); 935 tests passed + 5 skipped (940 total) |
| Focused sensitive suite | 17 files; 242 tests passed + 3 skipped |
| Live official-source suite | 3 files; 31/31 tests passed |
| Hardware validation | **NONE** |
| Public device-changing operations | **LOCKED** |
| Deployment in this work | **NONE** — Draft PR pushes cannot run the Pages deployment workflow |
| Performance claims | **NONE** |
| Stable Release claim | **NO** |

## Current result

The M2 hardening set has passed the final local automated suites listed above.
This establishes software evidence only. It does not convert catalog or Mock
results into Hardware support, authorize a device write, or establish RF,
recovery, reliability, or performance results.

The public entry point permits explicit connection, identity inspection, and
parameter reads. Settings changes, Binding, flashing, Wi-Fi handoff, and
recovery remain locked there. Enabling device-changing operations requires a
separately reviewed acceptance entry point; there is no public user or build
switch that enables them.

The immutable candidate SHA is intentionally not hard-coded into this file.
Pages builds must receive the checked-out branch/CI SHA through
`VITE_BUILD_SHA`, reject anything other than 40 lowercase hexadecimal
characters, and verify that the same value is embedded in the built artifact.

## Current software gates

| Gate | Status | Evidence boundary |
| --- | --- | --- |
| Full Vitest suite | PASS locally | 79 passed files + 2 skipped; 935 passed tests + 5 skipped |
| Sensitive write/session/recovery suite | PASS locally | 17 files; 242 passed + 3 skipped |
| Official-source compatibility | PASS locally | 3 live-source files; 31/31 passed |
| Public entry-point lock | PASS locally | Canonical `main.tsx` mounts the workbench without device-write authority |
| Candidate-SHA Pages gate | ENFORCED locally | Pages build and artifact checks require the exact build-time SHA; the final value follows the commit |
| Browser security policy | PASS locally | Reviewed CSP/meta-CSP and fixed-origin checks remain enforced |
| Draft PR official CI | PENDING | Must be verified after the final commit is pushed |
| Hardware / Browser matrix | NOT RUN | No physical TX/RX or production-browser evidence exists |
| Deployment | NOT RUN | This work does not deploy; PR events cannot trigger Pages publication |

## Software included in this candidate

- CRSF/Web Serial identity and parameter reads that do not depend on catalog
  availability;
- fail-closed settings and Binding paths with live identity/session checks;
- exact release/Target selection and bounded official-mirror acquisition;
- region-aware Firmware packaging, recovery packages, and supported transport
  handling;
- cancellation, disconnect, recovery-journal, archive, and package-integrity
  hardening;
- a 19-step physical-acceptance recorder bound to the build-time candidate SHA;
- CI/Pages gates that verify the public lock, CSP, exact SHA, and non-deployment
  boundary for pull requests.

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
