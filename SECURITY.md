# Security Policy — Milestone 1 Foundation

هذا المستودع العام لا يقدّم Release للمستخدم بعد، ولا يحتوي Firmware خاصًا به أو Provider يكتب على جهاز حقيقي. خلال Milestone 1:

- لا تُقبل ملفات Firmware مجهولة كمصدر حقيقة.
- لا تُخزن Binding phrases أو UID أو Wi-Fi credentials في تقارير البحث أو logs.
- لا تُنفذ Hardware writes.
- لا تُنسخ secrets أو access tokens إلى المستودع.
- أي dependency أو artifact أو manifest يدخل لاحقًا يحتاج provenance وhash وسياسة تحديث.
- نتائج Audit تمر عبر Allowlist؛ الحقول السرية/المعرّفات الحساسة تُستبعد افتراضيًا.
- لا توجد storage keys أو analytics أو cloud logging مسجلة.
- إعداد CI يولّد license inventory، ويفرض سياسة تراخيص Fail-closed، ويفشل عند advisories بدرجة `high` أو `critical`. مرشح M1 الموسّع لم يمر بعد بتشغيل CI رسمي، لذلك هذه Controls مهيأة وليست Evidence قبول مكتملة.

التفاصيل الملزمة موجودة في:

- [Threat Model](docs/adr/ADR-0009-milestone-1-threat-model.md).
- [Privacy and Audit Policy](docs/security/privacy-and-audit.md).
- [Storage-Key Registry](docs/security/storage-key-registry.md).
- [Dependency Admission Policy](docs/development/dependency-policy.md).

حدود trust الخاصة بـreal Targets، artifact hosting، Browser/Android permissions، diagnostic export، وhardware adapters تبقى Gates قبل تنفيذها.

المستودع عام حاليًا، لكن لم تُنشر بعد قناة خاصة لاستقبال تفاصيل الثغرات. هذه فجوة موثقة تمنع Release موثوقًا: يمكن استخدام Issues للمشاكل غير الحساسة فقط، ولا تُنشر Secrets أو خطوات استغلال حساسة علنًا حتى تُحدد قناة خاصة في سياسة لاحقة.

GitHub Actions مثبتة الآن على Commit SHAs رسمية تم التحقق منها، مع تعليق الإصدار بجانب كل SHA. يبقى تطبيق CSP إنتاجية فعلية بوابة صريحة قبل أي Hosted/Trusted Release، كما يجب أن يمر المرشح الحالي بتشغيل CI الرسمي نفسه.
