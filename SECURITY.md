# Security Policy — M2 Physical-Acceptance Candidate

هذا المستودع العام لا يقدّم Release للمستخدم بعد، ولا يحتوي Firmware محسنًا
خاصًا به، ولا توجد له نتيجة Hardware Validation. يحتوي مرشح M2 الحالي على
مسارات قراءة حقيقية وعلى كود لتغيير الإعدادات والربط والتفليش والاستعادة، لكن
نقطة الدخول العامة الحالية تقفل كل العمليات التي تغير الجهاز. يتطلب تفعيلها
نقطة دخول قبول منفصلة وتغييرًا مراجعًا صراحة؛ لا يوجد مفتاح بناء أو مستخدم
عام يفتحها.

يبقى Provider الـLocal HTTP المنفصل للقراءة فقط ضمن الحدود الآتية:

- لا يبدأ الاتصال قبل فعل صريح من المستخدم.
- لا يقبل إلا `http://10.0.0.1` و`http://elrs_rx.local` و`http://elrs_tx.local`.
- يرسل `GET /config` فقط، ويرفض redirects، ولا يرسل credentials، ولا يفحص الشبكة.
- يحد حجم الاستجابة ويتحقق من النوع والبنية، ثم يعيد بناء Allowlist فقط.
- يستبعد raw response وUID وWi-Fi options وSSID وكلمة المرور والحقول غير المعروفة.
- يعامل جميع الحقائق كـ`UNVALIDATED` ولا يمنح صلاحية Binding أو Update.
- يصدّر عند طلب المستخدم تقرير دعم ثابت الفئات بلا قيم جهاز أو أسماء حقول خام.

ويضيف مرشح M2 اتصال CRSF يبدأه المستخدم عبر Web Serial لقراءة الهوية
وParameters دون اشتراط تنزيل الكتالوج. لا تصبح مطابقة Target حقيقة إلا بعد
دليل مطابق، وتبقى الكتابة والربط مقفلين في نقطة الدخول العامة حتى مع نجاح
القراءة.

وخلال هذا المرشح:

- لا تُقبل ملفات Firmware مجهولة كمصدر حقيقة.
- لا تُخزن Binding phrases أو UID أو Wi-Fi credentials في تقارير البحث أو logs.
- لم تُنفذ أي Hardware writes ولم تُسجل أي جلسة عتاد في هذا العمل.
- لا تُنسخ secrets أو access tokens إلى المستودع.
- تنزيلات ExpressLRS محصورة بمرآة Web Flasher الرسمية عبر HTTPS ومسارات
  مبنية ومحدودة، لكن الكتالوج وTargets وlayouts وfallback logo العالمية mutable
  وغير موقعة؛ HTTPS وURL مطابق لا يحولانها إلى منشور موثق تشفيريًا.
- الحزم المجهزة ترتبط بمراجعة Target وبيانات الإصدار وSHA-256 للقطاعات، لكن
  hashes المحلية تكشف فساد الحزمة ولا تصادق ناشر upstream.
- نتائج Audit تمر عبر Allowlist؛ الحقول السرية/المعرّفات الحساسة تُستبعد افتراضيًا.
- أسباب وتفاصيل أخطاء Providers ونتائج receipts/verification لا تعبر حدود Workflows دون إعادة بناء Core؛ ولا تُنفّذ accessors التي يملكها Provider، ولا تظهر أسماء الحقول غير الموثوقة في Audit exports.
- لا توجد analytics أو cloud logging؛ التخزين المحلي المراجع محصور في cache
  الـstatic shell ذي الإصدار، وcheckpoint الاستعادة، وسجل القبول الفيزيائي
  المنقح.
- يوجد ملف رؤوس إنتاج مُراجع ومتحقق آليًا يقيد CSP إلى السطح الحالي؛ يجب أن يقدمه Host الفعلي أو يترجمه إلى إعداد مكافئ قبل Release.
- إعداد CI يولّد license inventory، ويفرض سياسة تراخيص Fail-closed، ويفشل عند advisories بدرجة `moderate` أو أعلى.
- بناء Pages يتطلب `VITE_BUILD_SHA` مطابقًا لـ40 خانة hexadecimal صغيرة، وتتحقق
  البوابة من وجوده داخل artifact قبل القبول. مسودة PR تبني artifact للفحص فقط؛
  Workflow النشر لا يستجيب لـPull Requests ومقيد بـ`main`.

التفاصيل الملزمة موجودة في:

- [Threat Model](docs/adr/ADR-0009-milestone-1-threat-model.md).
- [Privacy and Audit Policy](docs/security/privacy-and-audit.md).
- [Storage-Key Registry](docs/security/storage-key-registry.md).
- [Dependency Admission Policy](docs/development/dependency-policy.md).

حدود trust الخاصة بـreal Targets، artifact hosting، Browser Local Network
Access/mixed content، Android permissions، device authenticity، وhardware
adapters تبقى Gates قبل اعتماد الدعم أو تشغيل الكتابة على جهاز فعلي.

المستودع عام حاليًا، لكن لم تُنشر بعد قناة خاصة لاستقبال تفاصيل الثغرات. هذه فجوة موثقة تمنع Release موثوقًا: يمكن استخدام Issues للمشاكل غير الحساسة فقط، ولا تُنشر Secrets أو خطوات استغلال حساسة علنًا حتى تُحدد قناة خاصة في سياسة لاحقة.

GitHub Actions مثبتة على Commit SHAs كاملة مع تعليق الإصدار بجانب كل SHA.
تضع معاينة Pages meta-CSP مبكرًا داخل HTML، لكنها لا تفسر ملف `_headers` كرؤوس
استجابة. لذلك يبقى التحقق من أن Host إنتاجي يرسل الرؤوس الفعلية، مع مصفوفة
Hardware/Browser/LNA، بوابتين صريحتين قبل أي Hosted/Trusted Release. ويجب أن
يمر SHA النهائي للمرشح بتشغيل CI الرسمي المستقل قبل تسجيله كدليل.
