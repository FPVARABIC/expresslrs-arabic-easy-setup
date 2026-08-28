# Project Status

> This file is the current execution checkpoint. The previous detailed running history remains preserved in Git history and in the milestone/ADR/testing records; it was not deleted from repository history.

| Field | Value |
| --- | --- |
| Date | 2026-08-28 |
| Phase | Pre-Hardware software checkpoint — `READY_FOR_HARDWARE_VALIDATION` |
| Branch | `feat/read-only-device-foundation` |
| Draft PR | [#3](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/3) — open, Draft, unmerged |
| Reviewed application candidate | `b05d8e257ff1f5afdde5e501b9493f5413b201e5` |
| Branch CI | GitHub Actions run #148 — passed |
| Public preview | [GitHub Pages](https://fpvarabic.github.io/expresslrs-arabic-easy-setup/) — exact-SHA Pages run #22 passed |
| Pages deployment pin | `4049d50b9b6dd0329178908691273b15e1b01b3a` |
| Automated tests | 48/48 files, 607/607 cases |
| Stable upstream reference | ExpressLRS 4.1.0 / `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` |
| Hardware validation | **NONE** |
| Real device writes | **DISABLED** |
| Performance claims | **NONE** |
| Stable Release claim | **NO** |

## Current result

All software construction gates that can be implemented and truthfully validated before reference Hardware are now accounted for. The software readiness model returns `READY_FOR_HARDWARE_VALIDATION` only when every enumerated software gate is explicitly `PASS`; a `BLOCKED` gate returns `EXTERNAL_GATES_BLOCKED` instead of a false ready state.

This status does **not** convert external evidence into software success. Hardware, trust, legal and independently operated build gates remain separate and visible.

## Pre-Hardware software gates

| Gate | Status | Evidence boundary |
| --- | --- | --- |
| Foundation | PASS | Core contracts, sessions, operations, privacy, localization and CI. |
| Easy Mode | PASS | Exactly three ordinary-user actions remain: Binding, latest approved Firmware, essential settings. |
| Read-only device path | PASS | Browser Local HTTP implementation exists; Hardware behavior remains unvalidated. |
| Binding simulation | PASS | Synthetic/Mock workflow and verification/failure behavior. |
| Firmware Update simulation | PASS | Transport-neutral orchestration, artifact validation and post-write plan with real writers blocked. |
| Diagnostics | PASS | Privacy-safe health assessment and Advanced presentation; no Auto-fix. |
| PWA/offline foundation | PASS | Manifest, versioned shell cache, offline notice and safe waiting-update behavior. |
| Platform planning | PASS | Web desktop/Web Android/native Android readiness contract; no premature native selection. |
| Performance harness | PASS | Paired measurement analysis; Synthetic evidence can never authorize a claim. |
| Web preview | PASS | Exact candidate revalidated and published by Pages run #22. |
| CI quality gates | PASS | Formatting, lint, TypeScript, security, PWA, tests, build, licenses and audit. |

The readiness result still fixes these fields to:

- `hardwareValidation: NONE`
- `realWritesEnabled: false`
- `performanceClaimsAllowed: false`

## Latest verified software evidence

Candidate `b05d8e257ff1f5afdde5e501b9493f5413b201e5` passed CI run #148 with:

- frozen lockfile installation and configured supply-chain checks;
- Prettier;
- ESLint with zero warnings;
- strict TypeScript;
- dependency-boundary checks for nine workspace packages;
- Browser security-header policy;
- PWA source/build policy;
- Cairo and FPV-ARBCON visual-theme policy;
- 121 local Markdown links across 68 files;
- complete `MASTER_PLAN.md` heading contract 1–449;
- 607/607 Vitest cases across 48 files;
- production Web build;
- dependency license policy for 248 package/version records across 11 observed expressions with 0 exceptions;
- high-severity dependency audit with no known vulnerabilities.

The same exact application SHA was checked out again by Pages run #22. The workflow repeated the full gate, built specifically for `/expresslrs-arabic-easy-setup/`, generated PWA worker `18b4187200097cf4` for nine shell files, passed the Pages artifact checker, uploaded the artifact, and published it successfully.

## Software completed in the final pre-Hardware pass

- Fixed the Pages PWA CSP checker so `worker-src 'self'` is verified consistently.
- Added a typed platform-readiness boundary for Web desktop, Web Android and Android native candidates.
- Added a Performance Laboratory analysis harness with paired baseline/candidate metrics and fail-closed admission rules.
- Hardened provider, workflow, audit, platform, performance, and readiness inputs against accessors, malformed values, oversized collections, and unsafe numeric summaries.
- Made `HARDWARE_OBSERVED` an unverified caller declaration that can only request independent evidence review; it cannot authorize a performance claim.
- Restricted sensitive operation providers to the explicit `SYNTHETIC_ONLY` assurance boundary until physical admission exists.
- Added a non-prompting Local Network permission assessment while keeping serial, USB, and Local Network permissions scoped to `self`.
- Aligned the Arabic Web/PWA presentation with the restrained FPV-ARBCON technical theme and enforced accessible primary-action contrast.
- Added a software-only exit/readiness report with explicit PASS/BLOCKED/INCOMPLETE states.
- Added a safe PWA waiting-update notice that cannot force activation or reload the current client.
- Added a global Web Error Boundary with fixed Arabic/English copy that does not reflect thrown error details.
- Updated PWA CI policy so production-only registration is enforced at the reviewed update boundary instead of direct registration from `main.tsx`.
- Repaired the exact-SHA Pages path and successfully published the reviewed candidate.

## External and physical gates — intentionally not marked complete

These items cannot be truthfully completed by additional Mock code alone:

### Hardware / Browser evidence

- reference TX and RX identification on supported models;
- desktop/mobile Local Network Access, CORS, mixed-content and device-AP behavior;
- disconnect/reconnect and browser permission behavior;
- Web Serial/WebUSB/USB-UART/passthrough behavior where applicable;
- real Binding, configuration, reboot, Firmware update, recovery and post-write verification.

### Trust / release evidence

- owner-approved production trust-root ceremony, key custody, thresholds and compromise recovery;
- owner-approved production clock assurance and atomic trust/rollback persistence contract;
- exact real Target/release/toolchain evidence for production catalog admission;
- production acquisition provider and real executable-family parsing only after the required source/licensing/trust inputs are resolved;
- independently operated real-toolchain reproducibility evidence;
- production-host response-header verification.

### Licensing / owner decisions

- reuse of repositories or Target data without a confirmed compatible license remains blocked;
- final public product license/brand decisions remain owner/legal decisions;
- private vulnerability-reporting route remains an account/repository setting decision.

### Performance and optimized Firmware

The analysis infrastructure is complete, but no RF optimization is admitted before controlled measurements. Range, Stability, Reliability, Recovery, Latency and Telemetry changes must start from a measured baseline and independently verified Hardware evidence. A caller-provided `HARDWARE_OBSERVED` label is not proof, and the software analyzer always keeps `performanceClaimAllowed: false`; Synthetic results are permanently non-admissible for a performance claim.

### Android

The shared software contract is ready. Final PWA/Web/Hybrid/Native selection waits for real Android Browser/USB/Wi-Fi/lifecycle evidence so the project does not commit to an unnecessary native rewrite.

## Next phase

The next engineering phase is **Hardware evidence collection and validation**, beginning read-only. Real write providers remain disabled until the relevant identity, compatibility, artifact, recovery and post-write verification gates have physical evidence.

Reference documents:

- [Pre-Hardware software readiness](docs/architecture/pre-hardware-software-readiness.md)
- [Pre-Hardware acceptance evidence](docs/testing/pre-hardware-software-readiness-acceptance.md)
- [Read-only Hardware/Browser runbook](docs/testing/milestone-2-hardware-browser-runbook.md)
- [Master Plan](MASTER_PLAN.md)
