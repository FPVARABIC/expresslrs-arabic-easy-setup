# Hardware validation beta — release record

What was proven before this candidate was merged, and what was deliberately
not. Every number here was measured, not estimated.

## Identity

| Field | Value |
| --- | --- |
| Candidate SHA reviewed in PR #7 | `9a95e532f2719051b391abd60f0da98189d78d3b` |
| Integration merge into the PR head | `2d843dff4a98fd9393737e507c6fde822ebd4708` |
| PR #7 merge into `main` | `f47e2e5ddab8d64f7d18494f151fbee6df8cec75` |
| Deploy fix merge (PR #13) | `835c5ab8a1b8b71314fabeb407060482bd82c092` |
| **Published commit** | `835c5ab8a1b8b71314fabeb407060482bd82c092` |
| Base before merge | `cfbb7b6bf0a9c75ccd9a2b653516862b6b21f52b` (two paths: a workflow and `README.md`) |
| Published URL | <https://fpvarabic.github.io/expresslrs-arabic-easy-setup/> |
| Release stage | Hardware validation beta — **not** a stable release |
| Hardware validation | **NONE** |

## Pre-merge checks

Reproduced from a wiped `node_modules` and `pnpm install --frozen-lockfile`.

| Check | Result |
| --- | --- |
| Worktree clean, nothing unpushed | PASS |
| `pnpm check` | PASS (exit 0) |
| `pnpm test` | 947 passed, 5 skipped, 79 files |
| `pnpm qa:browser` | 7 passed, against the exact Pages artifact |
| CI on the candidate head | PASS |
| No new `skip`, no `.only` | PASS — the three `*.live.*` blocks are unchanged since the pinned baseline |

The 5 skipped tests are the network-gated `*.live.*` describe blocks, opt-in
behind an environment variable.

## Present in the built bundle

Each string was grepped in `apps/web/dist`:

`نسخة تجريبية للتحقق على العتاد` (banner) · `اكتب Firmware إلى الجهاز` (Easy
firmware write) · `جهّز الحزمة الرسمية` (Easy package build) · `عبارة الربط`
(binding phrase field) · `MY_BINDING_PHRASE` (UID derivation) ·
`LINK_OBSERVED_BY_TELEMETRY` · `USER_CONFIRMED_LINK` · `Hardware validation`
(diagnostics) · `EVIDENCE_GATED` · `RECOVERY_INCOMPLETE` ·
`اختر حزمة الاستعادة` (Easy recovery picker) · `elrsNativeBridge` ·
`writeFlash` (ESP flasher).

## Absent from the built bundle

`MockScenario` · `platform-mock` · `allowDestructiveWrites` · `COMING_SOON` ·
`realWritesEnabled` · `SOFTWARE_ONLY_READINESS_REPORT` ·
`KEEP_ALL_REAL_WRITES_DISABLED` · `غير متاح بعد` · `قيد التجهيز` · `قريبًا` ·
`تقرأ فقط`.

## Browser observations

Chromium 1194, against the built application served with the headers that ship:

| Observation | Result |
| --- | --- |
| Arabic | `dir="rtl"`, `lang="ar"` |
| English | `dir="ltr"`, `lang="en"`, heading "Set up ExpressLRS" |
| Disabled controls on the landing view | **0** |
| Operations offered | 3, all enabled, in both languages |
| Console errors / HTTP ≥ 400 | 0 across six captured views |
| Horizontal overflow at 320px | 0px |
| Banner | short SHA on screen, full SHA copyable |

## Merge shape

`main`'s `deploy-reviewed-pages.yml` is **renamed** to `deploy-pages.yml`,
which builds `github.sha` rather than a pinned `REVIEWED_SHA`. No workflow is
deleted. `check:pages-build` requires the exact 40-character SHA to be embedded
in a shipped bundle, so the published preview provably matches the merged
commit.

`main` is an ancestor of the candidate, so reverting the merge commit restores
`main` exactly. Full development history is preserved — 331 files changed, no
secrets, no build output, no temporary files.

## What is still unproven

Everything involving a device. No physical TX or RX has been connected to this
application. Every Hardware cell in the
[Feature Reality Matrix](../FEATURE_REALITY_MATRIX.md) is `NONE`, and Android
is `UNVERIFIED` — see [ANDROID.md](../ANDROID.md). No RF, range, latency,
reliability or performance claim is made.

## Deployment

The first deploy of `f47e2e5` **failed**, and the failure was a defect in a
test, not in the application. The build-banner test asserted the literal
`unpinned-development-build`, which only holds when `VITE_BUILD_SHA` is unset.
`ci.yml` set it on the Pages build step alone, so the suite ran unpinned and
passed; `deploy-pages.yml` sets it for the whole job, so the same suite saw a
pinned SHA and the assertion failed — for the first time during the deploy,
after the merge.

The assertion now reads its expectation from the same environment value the
component reads, and `ci.yml` runs the suite once with the SHA pinned so this
class of failure surfaces on the pull request instead. `check-ci-hygiene.mjs`
fails the build if that step is removed. `835c5ab` deployed successfully:
deployment `6348134638`, state `success`.

## Verification of the published artifact

**This environment cannot reach the published host.** Both a direct request and
a headless Chromium navigation are refused by the egress policy:

```
$ curl -sS https://fpvarabic.github.io/expresslrs-arabic-easy-setup/
curl: (56) CONNECT tunnel failed, response 403

page.goto: net::ERR_TUNNEL_CONNECTION_FAILED
```

So the live URL has **not** been opened from here, and no claim is made about
the bytes GitHub is serving beyond what the deploy job itself verified —
`check:pages-build` ran inside that job and confirmed the exact
40-character SHA embedded in a shipped bundle for
`/expresslrs-arabic-easy-setup/`.

What was verified here instead: `main` at `835c5ab` was checked out and built
with the deploy's own environment (`GITHUB_PAGES=true`,
`PAGES_BASE_PATH=/expresslrs-arabic-easy-setup/`,
`VITE_BUILD_SHA=835c5ab…`), served with the headers that ship, and driven
through 27 checks in Chromium — **27/27 passed**:

| Group | Checks |
| --- | --- |
| Identity | displayed SHA equals the published commit; short SHA on screen; stage stated |
| Entry | Easy Mode is the default; Arabic is RTL; English is LTR with its own heading; Advanced Mode opens |
| Controls | three operations offered; every one pressable; nothing on the landing view disabled |
| Firmware | the operation stays inside Easy Mode; no hand-off to Advanced; no success claimed without a device |
| Diagnostics | renders; states `Hardware validation: NONE`; reports the real browser environment; carries no secret field |
| Resilience | refresh keeps the same commit; the service worker controls the page and serves no stale commit |
| Cleanliness | no console errors; no failed asset requests; no horizontal overflow at 320px |

That is the same commit and the same build inputs as the published artifact,
but it is a local build of it — not a read of the served bytes. **Someone with
network access to the published URL should open it and confirm the banner shows
`835c5ab` before the bench session begins.**

The next step is the bench session in
[PHYSICAL_TEST_CANDIDATE.md](PHYSICAL_TEST_CANDIDATE.md).
