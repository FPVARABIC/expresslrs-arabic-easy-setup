# Project Status

> This is the current execution checkpoint. Earlier detailed evidence remains
> available in Git history and the milestone records.

| Field | Value |
| --- | --- |
| Audit date | 2026-09-09 |
| Phase | Software feature integration complete; no operation proven on hardware |
| Branch | `claude/expresslrs-advanced-i18n-and-locks` (branched from `main` at `835c5ab`) |
| Corrective review | Six findings reproduced from `main` at `835c5ab`; all six fixed on this branch and awaiting review |
| Candidate identity | Branch HEAD; injected at build time as the exact 40-character `VITE_BUILD_SHA` |
| Software status | `SOFTWARE_FEATURE_INTEGRATION_COMPLETE — HARDWARE UNVERIFIED` |
| Highest evidence level reached | `BROWSER_VERIFIED` for the web application, `EMULATOR_VERIFIED` for the Android host — see the [status vocabulary](docs/FEATURE_REALITY_MATRIX.md#status-vocabulary) |
| Android instrumentation | 42 tests, 0 skipped, 0 failed, on an API 34 emulator against a fake USB backend — [ANDROID.md](docs/ANDROID.md#what-the-apk-proves-and-what-it-does-not) |
| Runtime availability | All 10 operations observed becoming available from the shipped entry point — [RUNTIME_AVAILABILITY.md](docs/RUNTIME_AVAILABILITY.md) |
| Target and layout provenance | Frozen into a hashed, release-scoped pack; nothing mutable is fetched during a write — [PROVENANCE.md](docs/upstream/PROVENANCE.md#determinism-the-pack-not-the-mirror) |
| Known integration gaps | None open. Receiver-as-transmitter was reimplemented after an earlier version modelled it as AirPort; see [the upstream baseline](docs/upstream/baseline.md#receiver-as-transmitter---rx-as-tx). Android remains `UNVERIFIED` with the evidence recorded in [ANDROID.md](docs/ANDROID.md); it is an unproven platform, not an unfinished feature |
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
| `pnpm check:ci-hygiene` | PASS — the four reviewed workflows, one canonical entry chain, and the Android host's WebView confinement |
| `pnpm check:physical-acceptance` | PASS — 9 files, 19 recorder steps, JSON + Markdown export |
| `pnpm check:write-path-integrity` | PASS — flashers reachable only through the authorized boundary; no phase lock; no handler-less control |
| `pnpm check:ui-honesty` | PASS — 6 UI modules; every control has a handler, an action, and a documented reality |
| `pnpm check:ui-reality` | PASS — 122 modules; no Arabic outside the catalog, no pinned locale or direction, no build-stage lock, no dead control, rx-as-tx independent of AirPort |
| `pnpm check:reachability` | PASS — 58 modules reachable from `main.tsx`; every driver present, no write-switch module in the graph |
| `pnpm check:availability` | PASS — 12 rows; all 10 operations observed becoming enabled from the production entry point |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (`--max-warnings=0`) |
| `pnpm typecheck` | PASS |
| `pnpm check:boundaries` | PASS — 9 workspace packages |
| `pnpm check:security-headers` | PASS — source and build output |
| `pnpm check:pwa-safety` | PASS — source and build output |
| `pnpm check:visual-theme` | PASS |
| `pnpm check:links` | PASS — 165 local links across 83 Markdown files |
| `pnpm check:master-plan` | PASS — headings 1–449 in order |
| `pnpm test` | PASS — see the exact counts below |
| `pnpm build` | PASS |
| `pnpm qa:browser` | PASS — Chromium against the built app and its shipped headers, in both locales at desktop and 320px |

### Exact test counts

`pnpm test` (Vitest 4.1.11), measured, not estimated:

| Project | Files | Tests |
| --- | --- | --- |
| `core` (`packages/**`) | 37 passed | 519 passed |
| `web-hardware` (`apps/web/src/hardware/**`) | 31 passed + 2 skipped | 393 passed + 5 skipped |
| `web-ui` (remaining `apps/web/**`) | 12 passed | 128 passed |
| **Total** | **80 passed + 2 skipped (82)** | **1040 passed + 5 skipped (1045)** |

The Android host's tests are not in this total. They run under Gradle: JVM unit
tests for the pure rules, and an instrumentation suite on an emulator against a
fake USB backend for the bridge and WebView behaviour. See
[ANDROID.md](docs/ANDROID.md#what-the-apk-proves-and-what-it-does-not).

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

`packages/workflows/src/software-readiness.ts` is **deleted**. It carried a
`realWritesEnabled: false` field in a reporting object; it was never the control
that kept anything read-only, it was never reachable from `main.tsx`, and
proving it unreachable was not enough — stale production-shaped code that says
writes are disabled is misleading whether or not anything imports it today.
`scripts/check-production-reachability.mjs` fails the build if a module of that
shape returns, and `check-write-path-integrity` fails on the field itself.

The rest of `packages/workflows` remains, because it is not unused:
`packages/platform-mock` imports `runReadOnlyDiscovery`, `runEasyBinding`,
`FoundationExpressLrsModule`, `WorkflowClock` and others from it across eight of
its own files — six tests, plus `manual-clock.ts` and
`mock-sensitive-operation-providers.ts`. None of it is reachable from `main.tsx` — the reachability gate proves
that on every build — so none of it reaches an operator, and deleting a package
other packages legitimately import would be a different change from the one
that was asked for.

One marker remains outside the shipped graph:
`packages/diagnostics/src/read-only-health.ts` emits a
`KEEP_ALL_REAL_WRITES_DISABLED` finding. It is an `INFO` line in a report
generated by that package's own tests, in a package unreachable from
`main.tsx`, and it is recorded here rather than left for someone to find.

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
