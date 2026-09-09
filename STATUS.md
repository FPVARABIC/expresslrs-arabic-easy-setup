# Project Status

> This is the current execution checkpoint. Earlier detailed evidence remains
> available in Git history and the milestone records.

| Field | Value |
| --- | --- |
| Audit date | 2026-09-09 |
| Phase | Software feature integration complete; no operation proven on hardware |
| Published commit | `835c5ab8a1b8b71314fabeb407060482bd82c092` on `main` |
| Published URL | <https://fpvarabic.github.io/expresslrs-arabic-easy-setup/> |
| Integration PR | [#7](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/7) — **merged** at `f47e2e5` |
| Candidate identity | Injected at build time as the exact 40-character `VITE_BUILD_SHA`, shown in the interface |
| Release record | [HARDWARE_VALIDATION_BETA_RELEASE.md](docs/hardware/HARDWARE_VALIDATION_BETA_RELEASE.md) |
| Software status | `SOFTWARE_FEATURE_INTEGRATION_COMPLETE — HARDWARE UNVERIFIED` |
| Release stage | Hardware validation beta, published. **Not** a stable release |
| Highest evidence level reached | `BROWSER_VERIFIED` — see the [status vocabulary](docs/FEATURE_REALITY_MATRIX.md#status-vocabulary) |
| Known integration gaps | None open. Android remains `UNVERIFIED` with the evidence recorded in [ANDROID.md](docs/ANDROID.md); it is an unproven platform, not an unfinished feature |
| Hardware validation | **NONE** — nothing in this build has been proven on a physical device |
| Public device-changing operations | **ENABLED, evidence-gated** — no project-phase lock; each write requires live device evidence and operator confirmation |
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
| `pnpm check:write-path-integrity` | PASS — flashers reachable only through the authorized boundary; no phase lock; no handler-less control |
| `pnpm check:ui-honesty` | PASS — 5 UI modules; every control has a handler, an action, and a documented reality |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (`--max-warnings=0`) |
| `pnpm typecheck` | PASS |
| `pnpm check:boundaries` | PASS — 9 workspace packages |
| `pnpm check:security-headers` | PASS — source and build output |
| `pnpm check:pwa-safety` | PASS — source and build output |
| `pnpm check:visual-theme` | PASS |
| `pnpm check:links` | PASS — 133 local links across 77 Markdown files |
| `pnpm check:master-plan` | PASS — headings 1–449 in order |
| `pnpm test` | PASS — see the exact counts below |
| `pnpm build` | PASS |
| `pnpm qa:browser` | PASS — 6 browser checks in Chromium against the built app and its shipped headers |

### Exact test counts

`pnpm test` (Vitest 4.1.11), measured, not estimated:

| Project | Files | Tests |
| --- | --- | --- |
| `core` (`packages/**`) | 38 passed | 528 passed |
| `web-hardware` (`apps/web/src/hardware/**`) | 28 passed + 2 skipped | 303 passed + 5 skipped |
| `web-ui` (remaining `apps/web/**`) | 11 passed | 108 passed |
| **Total** | **77 passed + 2 skipped (79)** | **939 passed + 5 skipped (944)** |

The `web-ui` figure is lower than an earlier record because the Mock-backed
`App.tsx` and `view-model/` interface, which was never reachable from the entry
point, was removed along with its tests, and 212 dead message keys went with
it. Nothing reachable from `main.tsx` lost coverage.

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
- `apps/web/src/App.tsx` and the `view-model/` modules **no longer exist**.
  They were the Mock-backed interface, reachable only from their own tests, and
  they would have presented simulated results as device results. They were
  removed after being shown unreachable from the entry point; Easy Mode was
  never built on them.

Consequently the `realWritesEnabled: false` field in
`packages/workflows/src/software-readiness.ts` is a field of a reporting
object. It is **not** the control that keeps the public build read-only, and it
must not be cited as one.

## How device writes are authorized

There is no project-phase lock, and no feature is hidden or disabled because of
where the project is. `apps/web/src/hardware/write-authority.ts` issues a
single-use capability bound to one device session, one device fingerprint, and
one operation, with a TTL. Consuming it invalidates it, so a repeated click
cannot start a second write, and a device or session that changed between
authorization and write cannot inherit the authorization.

A refusal always names the missing condition — no session, unconfirmed
identity, unconfirmed port cleanup, an operation already running, an unreadable
recovery journal, a pending checkpoint, an unmatched Target or band, an
unverified artifact, a missing recovery package, an unacknowledged bench, or a
missing confirmation. "The feature is locked" is not among the possible
answers.

Recovery is modelled as its own case: it requires the pending checkpoint and an
operator-confirmed Target instead of a live identity, because it runs on a
device that may no longer answer CRSF. Wi-Fi and download are handoffs rather
than writes, so they require a known recovery path but not a live USB identity.

`scripts/check-write-path-integrity.mjs` fails the build if a flasher becomes
reachable outside the reviewed boundary, if that boundary stops requesting and
consuming a capability, if a phase lock reappears anywhere under
`apps/web/src`, or if any shipped button renders without a handler. The
boundary is `apps/web/src/hardware/useDeviceController.ts`: the one controller
both modes render, which is what makes "Easy Mode has no write path of its own"
mechanically checkable rather than a claim.

See the [Feature Reality Matrix](docs/FEATURE_REALITY_MATRIX.md) for what each
feature and each individual control is, and what remains unproven on hardware.
`scripts/check-ui-honesty.mjs` fails the build if a control appears in the
interface without a row there, if its handler does nothing, if an Easy Mode
operation hands off instead of completing, if a mock becomes reachable from a
shipped module, or if a constant flag gates a control.

## Success semantics

A flash never reports success because a write command returned. After writing,
the workbench requires a physical reconnect and then verifies, in order:

1. the reconnected device's identity against the planned Target
   (`verifyReconnectTarget`), and
2. the observed firmware version/commit against the expected release
   (`verifyObservedFirmwareBuild`).

Only then is a completion message shown. Any failure writes a
`RECOVERY_REQUIRED` checkpoint instead. A recovery write that completes without
a readable identity restages its checkpoint to `RECOVERY_INCOMPLETE` and keeps
it, so a half-recovered device always retains a way back. Binding is graded the
same way: link telemetry from the device is the only machine evidence, and an
operator's observation is recorded as `USER_CONFIRMED_LINK`, never as a
verified success. The separate core state machine in
`packages/workflows/src/operation-machine.ts` enforces the same rule
structurally — `SUCCESS` is reachable only from `VERIFYING` — but that module
does not ship in the public bundle, so the workbench path above is the one that
governs the released application.

## Browser evidence

Measured in Chromium (Playwright) against the real production Pages build,
served locally. Unit tests alone were not treated as sufficient.

- Easy Mode is the landing view, Arabic with `dir="rtl"` and `lang="ar"`, and
  offers all three operations with none disabled when no device is attached.
- Choosing an operation with nothing connected starts the five-step flow at the
  connect step rather than presenting a disabled control.
- No placeholder or locked-feature copy appears anywhere in the shipped UI.
- English is a real switch in the shipped path: the heading becomes
  "Set up ExpressLRS" and direction becomes `ltr`.
- The technical workbench opens only after an explicit mode choice.
- The skip link is the first tab stop and targets `#product-main`.
- No console or page errors at 1280px, at a Pixel 7 viewport, or at 320px, and
  no horizontal overflow at any of them.
- The service worker installs, activates, and controls the page after a second
  navigation; an offline reload still renders the shell from the versioned
  cache. A waiting update is reported without replacing the running session.
- With no hardware attached, identification fails closed with a plain message
  and no device is described as identified.

Browser QA is now a permanent suite in the repository
([`browser-qa/`](browser-qa/shipped-application.spec.ts)) and a required CI
step, so these claims are reproducible rather than a one-off observation. See
[browser QA](docs/testing/browser-qa.md) for exactly what it covers and what it
deliberately does not.

Android capability remains `UNVERIFIED`, and the reason is recorded rather than
assumed. A phone-sized viewport on desktop Chromium is not evidence about
Android and is not used as such. `caniuse-lite` in this repository's own
dependency tree lists Chrome for Android as `y #1` for Web Serial — supported
with a caveat whose text that package strips and whose sources this
environment's egress policy blocks — while Samsung Internet, Firefox for
Android and every iOS browser are a plain `n`. No package could be built here:
`dl.google.com` returns `CONNECT tunnel failed, response 403` and `adb` is
absent. What exists instead is runtime capability detection that names the
missing API to the operator, and a validated native bridge seam that lets a
host supply the serial transport so every existing device code path runs
unchanged over it. See [ANDROID.md](docs/ANDROID.md).

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

Until those gates are completed, validation remains `HARDWARE: NONE` and no
general device-support or performance claim is allowed. Device-changing
controls are **not** locked: they are gated on live evidence, and every refusal
names the missing condition rather than the project's phase.

Reference documents:

- [Physical acceptance package status](docs/hardware/PHYSICAL_ACCEPTANCE_PACKAGE_STATUS.md)
- [Physical acceptance plan](docs/hardware/PHYSICAL_ACCEPTANCE_PLAN_AR.md)
- [Hardware/Browser runbook](docs/testing/milestone-2-hardware-browser-runbook.md)
- [M2 acceptance evidence](docs/testing/milestone-2-read-only-acceptance.md)
- [Master Plan](MASTER_PLAN.md)
