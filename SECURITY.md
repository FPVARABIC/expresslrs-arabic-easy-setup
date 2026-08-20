# Security Policy — Foundation + M2A Read-only Candidate

هذا المستودع العام لا يقدّم Release للمستخدم بعد، ولا يحتوي Firmware خاصًا به أو Provider يكتب على جهاز حقيقي. يحتوي فرع M2A على Provider حقيقي واحد للقراءة فقط عبر Local HTTP:

- لا يبدأ الاتصال قبل فعل صريح من المستخدم.
- لا يقبل إلا `http://10.0.0.1` و`http://elrs_rx.local` و`http://elrs_tx.local`.
- يرسل `GET /config` فقط، ويرفض redirects، ولا يرسل credentials، ولا يفحص الشبكة.
- يحد حجم الاستجابة ويتحقق من النوع والبنية، ثم يعيد بناء Allowlist فقط.
- يستبعد raw response وUID وWi-Fi options وSSID وكلمة المرور والحقول غير المعروفة.
- يعامل جميع الحقائق كـ`UNVALIDATED` ولا يمنح صلاحية Binding أو Update.

وخلال Foundation/M2A:

- لا تُقبل ملفات Firmware مجهولة كمصدر حقيقة.
- لا تُخزن Binding phrases أو UID أو Wi-Fi credentials في تقارير البحث أو logs.
- لا تُنفذ Hardware writes.
- لا تُنسخ secrets أو access tokens إلى المستودع.
- أي dependency أو artifact أو manifest يدخل لاحقًا يحتاج provenance وhash وسياسة تحديث.
- نتائج Audit تمر عبر Allowlist؛ الحقول السرية/المعرّفات الحساسة تُستبعد افتراضيًا.
- لا توجد storage keys أو analytics أو cloud logging مسجلة.
- إعداد CI يولّد license inventory، ويفرض سياسة تراخيص Fail-closed، ويفشل عند advisories بدرجة `high` أو `critical`. مرشح M1 عند `5c543cb` اجتاز التشغيل الرسمي #7؛ تغييرات M2A المحلية تحتاج تشغيل CI مستقلًا بعد نشرها.

التفاصيل الملزمة موجودة في:

- [Threat Model](docs/adr/ADR-0009-milestone-1-threat-model.md).
- [Privacy and Audit Policy](docs/security/privacy-and-audit.md).
- [Storage-Key Registry](docs/security/storage-key-registry.md).
- [Dependency Admission Policy](docs/development/dependency-policy.md).

حدود trust الخاصة بـreal Targets، artifact hosting، Browser Local Network Access/mixed content، Android permissions، diagnostic export، device authenticity، وhardware adapters تبقى Gates قبل اعتماد الدعم أو تنفيذ الكتابة.

المستودع عام حاليًا، لكن لم تُنشر بعد قناة خاصة لاستقبال تفاصيل الثغرات. هذه فجوة موثقة تمنع Release موثوقًا: يمكن استخدام Issues للمشاكل غير الحساسة فقط، ولا تُنشر Secrets أو خطوات استغلال حساسة علنًا حتى تُحدد قناة خاصة في سياسة لاحقة.

GitHub Actions مثبتة الآن على Commit SHAs رسمية تم التحقق منها، مع تعليق الإصدار بجانب كل SHA. يبقى تطبيق CSP إنتاجية فعلية، ومصفوفة Hardware/Browser/LNA، بوابتين صريحتين قبل أي Hosted/Trusted Release، كما يجب أن يمر مرشح M2A بتشغيل CI الرسمي نفسه.
