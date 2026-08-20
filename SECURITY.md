# Security Policy — Foundation + M2A Read-only Candidate

هذا المستودع العام لا يقدّم Release للمستخدم بعد، ولا يحتوي Firmware خاصًا به أو Provider يكتب على جهاز حقيقي. يحتوي فرع M2A على Provider حقيقي واحد للقراءة فقط عبر Local HTTP:

- لا يبدأ الاتصال قبل فعل صريح من المستخدم.
- لا يقبل إلا `http://10.0.0.1` و`http://elrs_rx.local` و`http://elrs_tx.local`.
- يرسل `GET /config` فقط، ويرفض redirects، ولا يرسل credentials، ولا يفحص الشبكة.
- يحد حجم الاستجابة ويتحقق من النوع والبنية، ثم يعيد بناء Allowlist فقط.
- يستبعد raw response وUID وWi-Fi options وSSID وكلمة المرور والحقول غير المعروفة.
- يعامل جميع الحقائق كـ`UNVALIDATED` ولا يمنح صلاحية Binding أو Update.
- يصدّر عند طلب المستخدم تقرير دعم ثابت الفئات بلا قيم جهاز أو أسماء حقول خام.

وخلال Foundation/M2A:

- لا تُقبل ملفات Firmware مجهولة كمصدر حقيقة.
- لا تُخزن Binding phrases أو UID أو Wi-Fi credentials في تقارير البحث أو logs.
- لا تُنفذ Hardware writes.
- لا تُنسخ secrets أو access tokens إلى المستودع.
- أي dependency أو artifact أو manifest يدخل لاحقًا يحتاج provenance وhash وسياسة تحديث.
- نتائج Audit تمر عبر Allowlist؛ الحقول السرية/المعرّفات الحساسة تُستبعد افتراضيًا.
- أسباب وتفاصيل أخطاء Providers ونتائج receipts/verification لا تعبر حدود Workflows دون إعادة بناء Core؛ ولا تُنفّذ accessors التي يملكها Provider، ولا تظهر أسماء الحقول غير الموثوقة في Audit exports.
- لا توجد storage keys أو analytics أو cloud logging مسجلة.
- يوجد ملف رؤوس إنتاج مُراجع ومتحقق آليًا يقيد CSP إلى السطح الحالي؛ يجب أن يقدمه Host الفعلي أو يترجمه إلى إعداد مكافئ قبل Release.
- إعداد CI يولّد license inventory، ويفرض سياسة تراخيص Fail-closed، ويفشل عند advisories بدرجة `high` أو `critical`. مرشح M1 عند `5c543cb` اجتاز التشغيل الرسمي #7؛ تغييرات M2A المحلية تحتاج تشغيل CI مستقلًا بعد نشرها.

التفاصيل الملزمة موجودة في:

- [Threat Model](docs/adr/ADR-0009-milestone-1-threat-model.md).
- [Privacy and Audit Policy](docs/security/privacy-and-audit.md).
- [Storage-Key Registry](docs/security/storage-key-registry.md).
- [Dependency Admission Policy](docs/development/dependency-policy.md).

حدود trust الخاصة بـreal Targets، artifact hosting، Browser Local Network Access/mixed content، Android permissions، أي توسيع مستقبلي للتشخيص، device authenticity، وhardware adapters تبقى Gates قبل اعتماد الدعم أو تنفيذ الكتابة.

المستودع عام حاليًا، لكن لم تُنشر بعد قناة خاصة لاستقبال تفاصيل الثغرات. هذه فجوة موثقة تمنع Release موثوقًا: يمكن استخدام Issues للمشاكل غير الحساسة فقط، ولا تُنشر Secrets أو خطوات استغلال حساسة علنًا حتى تُحدد قناة خاصة في سياسة لاحقة.

GitHub Actions مثبتة الآن على Commit SHAs رسمية تم التحقق منها، مع تعليق الإصدار بجانب كل SHA. يوجد CSP إنتاجي في artifact الاستضافة والبناء، لكن التحقق من أن Host الحقيقي يرسله، ومصفوفة Hardware/Browser/LNA، يبقيان بوابتين صريحتين قبل أي Hosted/Trusted Release. ويجب أن يمر مرشح M2A بتشغيل CI الرسمي نفسه.
