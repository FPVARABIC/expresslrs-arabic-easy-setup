# Hardware validation beta — release record

> **Superseded.** The `SOFTWARE_ONLY_READINESS_REPORT` module and its
> `realWritesEnabled: false` field were deleted. They described a preview in
> which device writes were globally withheld; that preview no longer exists.
> Writes are now gated per operation on live evidence — see
> [the feature matrix](../FEATURE_REALITY_MATRIX.md#every-operation-end-to-end).
> This document is kept for history and describes a state the code left.

What was proven before this candidate was merged, and what was deliberately
not. Every number here was measured, not estimated.

## Identity

| Field | Value |
| --- | --- |
| Candidate SHA | `9a95e532f2719051b391abd60f0da98189d78d3b` |
| Integration merge into the PR head | `2d843dff4a98fd9393737e507c6fde822ebd4708` |
| Base before merge | `cfbb7b6bf0a9c75ccd9a2b653516862b6b21f52b` (two paths: a workflow and `README.md`) |
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

The next step is the bench session in
[PHYSICAL_TEST_CANDIDATE.md](PHYSICAL_TEST_CANDIDATE.md).
