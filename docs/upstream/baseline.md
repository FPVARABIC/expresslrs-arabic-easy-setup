# Upstream Baseline — 2026-08-20

## الهدف

تثبيت الحالة الدقيقة التي تُقرأ في Milestone 0. لا توجد نسخة upstream داخل مستودع المنتج، ولا توجد تعديلات على المصادر الرسمية.

## المصادر الرسمية المثبتة

| Repository | Purpose | Default branch | Inspected SHA | Release baseline | License evidence |
| --- | --- | --- | --- | --- | --- |
| `ExpressLRS/ExpressLRS` | Firmware/link source | `master` | `73ce820ba51437f73f31686233b607c58e188e7b` | `4.1.0` → `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` | Root `LICENSE`: GPL v3 text |
| `ExpressLRS/ExpressLRS-Configurator` | Desktop build/config/flash tool | `master` | `421d656f1987117e37472979444cee464e3fcdef` | `1.8.3` at same SHA | Root `LICENSE`; package declares `GPL-3.0-or-later` |
| `ExpressLRS/web-flasher` | Browser flasher | `master` | `4125a4e07d37ce1e872bb562ebd4286e6fd143f9` | No pinned release selected | No root license file observed; reuse blocked pending clarification |
| `ExpressLRS/Targets` | Approved hardware target metadata | `master` | `c4bd7b823594c233e673828ab493a2f8319a756a` | No GitHub releases | No root license file observed; reuse blocked pending clarification |
| `ExpressLRS/Docs` | Official documentation source | `master` | `043f06727b2859dd5e67b725763645df5bccddee` | Not applicable | Root `LICENSE`: GPL v3 text |

## Stable vs development

ExpressLRS `4.1.0` is the Stable behavior/build baseline for the first analysis. The inspected `master` HEAD is newer and already contains development work not part of 4.1.0; it is an awareness reference only. Results must name which SHA they describe.

## Evidence URLs

- https://github.com/ExpressLRS/ExpressLRS/releases/tag/4.1.0
- https://github.com/ExpressLRS/ExpressLRS/commit/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6
- https://github.com/ExpressLRS/ExpressLRS/commit/73ce820ba51437f73f31686233b607c58e188e7b
- https://github.com/ExpressLRS/ExpressLRS-Configurator/commit/421d656f1987117e37472979444cee464e3fcdef
- https://github.com/ExpressLRS/web-flasher/commit/4125a4e07d37ce1e872bb562ebd4286e6fd143f9
- https://github.com/ExpressLRS/Targets/commit/c4bd7b823594c233e673828ab493a2f8319a756a
- https://github.com/ExpressLRS/Docs/commit/043f06727b2859dd5e67b725763645df5bccddee

## Sync record fields for future updates

كل مزامنة لاحقة تسجل: inspection date، previous/new SHA، release/tag، change classes، affected patch areas، build/test results، performance re-baseline requirement، license/security changes، والقرار.
