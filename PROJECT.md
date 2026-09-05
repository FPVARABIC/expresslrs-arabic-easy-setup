# Project Contract

## الهوية

- اسم المستودع العامل أثناء Discovery: `expresslrs-arabic-easy-setup`؛ الاسم/العلامة العامة النهائية لم تُعتمد بعد.
- المالك المستهدف: `melyanneahmed-rgb`
- نوع المنتج: مستقل اليوم، قابل للدمج كـModule مستقبلًا
- المنصات: Web أولًا، Android بعد Spike، Super-App لاحقًا
- اللغة: Arabic-first مع English fallback
- الخط الأساسي للواجهة: `Cairo`
- المصدر اللاسلكي: ExpressLRS الرسمي؛ لا إعادة كتابة من الصفر

## مسارا المشروع

### Track A — Product / UX

تبسيط Connect وDetect وIdentify وSetup وBinding وUpdate وDiagnostics، مع Easy Mode افتراضي وAdvanced Mode اختياري.

### Track B — Firmware / Performance Research

فهم الكود، تثبيت Baseline رسمي، بناء Measurement Harness، ثم اختبار فرضيات منفصلة حول Range-related robustness وStability وReliability وRecovery وLatency وTelemetry وResource usage. كل نتيجة غير مثبتة تبقى `UNTESTED` أو `REJECTED` ولا تدخل Stable.

## الأولويات الملزمة

1. Safety
2. Correctness
3. Reliability
4. Ease of use
5. Maintainability
6. Measured performance
7. Additional features

## الحدود المعمارية

- Core لا يعتمد على React أو DOM أو نصوص عربية أو navigation.
- Compatibility وTarget resolution وBinding strategy لا تُوزع كشروط داخل UI.
- Platform-specific I/O يبقى خلف adapters.
- نجاح العمليات الحساسة يحتاج Verification.
- الحقائق غير المؤكدة تحمل Confidence ولا تعرض كحقائق.
- دعم الأجهزة Model-agnostic: Core يقرأ Evidence/Capabilities ويحلها عبر Catalog/Adapters بدل hard-coded model branches.
- لا يبنى Super-App الآن، لكن لا يُغلق باب Shared Device Layer مستقبلًا.

## حدود الأمان المستمرة بعد Milestone 0

- Firmware patches أو RF refactors.
- Hardware writes أو flight tests.
- اختيار Android framework نهائي.
- Performance claims.
- Release أو توزيع binaries.
