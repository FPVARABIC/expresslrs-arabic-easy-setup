# Milestone 0 Research Index

كل تقرير يجب أن يسجل upstream version/SHA، source paths/symbols، interpretation، confidence، open questions، وما تم اختباره فعليًا.

## المخرجات المطلوبة

- `expresslrs-architecture.md`
- `binding.md`
- `build-and-configuration.md`
- `flashing.md`
- `targets-and-device-detection.md`
- `web-capabilities.md`
- `android-risks.md`
- `rf-code-map.md`
- `reuse-matrix.md`
- `upstream-strategy.md`
- `licensing.md`
- `security-reconnaissance.md`
- `performance-measurement-plan.md`
- `performance-hypotheses.md`
- `questions-register.md`
- `phase-0-exit-review.md`

## Confidence vocabulary

- `CONFIRMED`: directly supported by pinned source/test.
- `HIGH_CONFIDENCE`: multiple primary sources agree; direct runtime test still pending.
- `AMBIGUOUS`: evidence supports more than one interpretation.
- `UNKNOWN`: not established.

## Validation labels

`CODE_REVIEWED`, `BUILD_TESTED`, `BENCH_TESTED`, `HARDWARE_TESTED`, `FLIGHT_TESTED`, `STABLE` are distinct. Milestone 0 is primarily `CODE_REVIEWED`; it must not use stronger labels.

## Current disposition

كل التقارير المذكورة أعلاه موجودة. راجع [التقرير الموحّد](../../PHASE_0_DISCOVERY_REPORT.md) ثم [Phase 0 Exit Review](phase-0-exit-review.md). قُبلت النتائج لبدء Mock/Foundation فقط؛ تراخيص وHardware/browser/verification gates تبقى ملزمة قبل real writes أو support/release claims.
