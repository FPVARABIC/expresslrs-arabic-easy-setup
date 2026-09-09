# ExpressLRS Arabic / Easy Setup

مشروع مستقل يضيف تجربة عربية سهلة وآمنة حول ExpressLRS الرسمي، مع Core قابل لإعادة الاستخدام في Web أولًا، ثم Android، ثم منصة FPV أكبر مستقبلًا.

## الحالة الحالية

- المرحلة: `Milestone 2 — Real TX/RX physical-acceptance candidate`
- الفرع الجاري: `feat/m2-real-hardware-first-test` داخل [Draft PR #7](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/7)
- معاينة GitHub Pages: `https://fpvarabic.github.io/expresslrs-arabic-easy-setup/`؛ المعاينة المنشورة لا تتضمن تغييرات Draft PR #7 ولم يُنشر هذا العمل
- السلوك الجاهز برمجيًا: تعريف TX/RX عبر CRSF وWeb Serial، قراءة Parameters، إعداد قابل للعكس مع read-back، أوامر Binding، كتالوج وإصدارات رسمية، تجهيز الحزم ومسارات التحديث، وحزمة تسجيل قبول فيزيائي من 19 اختبارًا
- السلوك في نقطة الدخول العامة الحالية: الاتصال والتعريف والقراءة متاحة؛ تغيير الإعدادات والربط والكتابة على Firmware مقفلة دائمًا. فتحها يتطلب نقطة دخول قبول منفصلة وتغييرًا مراجعًا صراحة، وليس إعداد بناء متاحًا حاليًا
- الحدود الحالية: لا Hardware Validation، ولا Stable public hardware writes، ولا ادعاء تحسين RF أو أداء
- نمط الأجهزة: Model-agnostic عبر Evidence/Capabilities وTarget Catalog قابل للحقن، دون hard-coded models
- الخط الأساسي للواجهة: Cairo ذاتي الاستضافة
- خط ExpressLRS المستقر المثبت للدراسة: `4.1.0` عند `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6`
- مرجع فرع التطوير وقت الفحص: `master` عند `73ce820ba51437f73f31686233b607c58e188e7b`

## ما الذي يميز المنتج؟

ExpressLRS يبقى مصدر التقنية اللاسلكية الرسمي. هذا المشروع يبني فوقه:

- واجهة عربية وRTL مصممة للمبتدئ، مع Advanced Mode للخبير.
- Workflows للربط والإعداد والتحديث بدل عرض خيارات تقنية مبعثرة.
- اختيار تلقائي لطريقة التحديث المناسبة من Catalog الجهاز؛ البنية تدعم
  Wi-Fi وUART وpassthrough وXMODEM وSTM32 DFU؛ أما Targets التي تعلن ST-Link
  فقط فتبقى غير مفعلة حتى يوجد مشغل ST-Link حقيقي، دون تحويل الواجهة إلى قائمة
  بروتوكولات.
- التحديث يتطلب Target مطابقًا وحزمة استعادة وطاقة مستقرة وهوائي TX عند
  الحاجة وتحققًا بعد إعادة الاتصال. وجود الكود لا يمثل Hardware Validation أو
  سماحًا عامًا بالكتابة.
- اكتشاف الجهاز والـTarget والـBand عندما توجد أدلة كافية، والتوقف عند الغموض.
- بوابات أمان تمنع Wrong Target ولا تعرض `SUCCESS` قبل Verification.
- تشخيص واستعادة وسجلات عمليات مفهومة.
- طبقات Core وDevice وWorkflow مستقلة عن React وعن المنصة.
- مسار أبحاث أداء لا يقبل أي تحسين إلا بعد Baseline وقياسات وRegression tests.

## قاعدة العمل

> Understand → Measure → Implement → Test → Verify → Ship.

لا يوجد Firmware محسن خاص بالمشروع ولا Hardware Validation بعد.

معاينة GitHub Pages تعرض الواجهة العربية/English ومسار تعريف CRSF وأداة تسجيل
القبول، وتبقي تغيير الإعدادات والربط والتفليش والاستعادة مقفلة في نقطة الدخول
العامة الحالية. اتصال CRSF للقراءة لا يعتمد على تنزيل الكتالوج. قد يمنع
المتصفح المستضاف قراءة عناوين أجهزة HTTP المحلية؛ نجاح أي مسار جهاز يبقى غير
معتمد حتى تكتمل مصفوفة المتصفح والعتاد. GitHub Pages لا يطبق ملف `_headers`
كرؤوس استجابة، لذلك تستخدم المعاينة CSP جزئيًا داخل HTML وتبقى بوابة الاستضافة
الموثوقة مفتوحة.

## Foundation الحالية

```text
apps/web                 واجهة عربية RTL بخط Cairo
packages/domain          الحقائق والأخطاء وحالات العمليات
packages/device          الأدلة، حل الهوية، وملكية Device Session
packages/compatibility   Target Catalog قابل للحقن وقرارات Fail-closed
packages/diagnostics     تقارير دعم ثابتة الفئات وخالية من قيم الجهاز
packages/workflows       Discovery وEasy Binding وUpdate State Machines وModule API
packages/platform-browser  موفر Local HTTP للقراءة فقط وحدود Browser المشتركة
packages/platform-mock   أجهزة/Providers Synthetic ومصفوفة فشل واستعادة
packages/i18n            العربية وEnglish fallback وربط الأخطاء المنظمة
apps/web/src/hardware    CRSF وWeb Serial والكتالوج والحزم وطرق التحديث والاستعادة
```

الموديلات ليست شروطًا داخل الواجهة أو الـCore. يضيف Adapter أدلة الجهاز،
ويطابقها Catalog رسميًا عند توفره، ثم يقرر Core مستوى الثقة والقدرات. يستطيع
المستخدم بدء تعريف CRSF للقراءة أولًا دون الكتالوج؛ لا تصبح مطابقة Target
حقيقة إلا بعد دليل مطابق، ولا يصبح قبول أمر Binding دليل نجاح رابط RF.

يبقى مسار Local HTTP منفصلًا ومحدودًا بثلاثة عناوين ExpressLRS محلية مثبتة،
ويستبعد الاستجابة الخام وUID وخيارات Wi-Fi وSSID وكلمة المرور قبل عبور البيانات
إلى Core. أما مسار Web Serial فيتعامل مع Parameters التي أعلنها الجهاز ضمن
حدود صارمة، ويمنع الحقول المخفية أو الحساسة من الكتابة. جميع نتائج العتاد ما
زالت `UNVALIDATED` حتى تسجل جلسة فعلية وتراجع أدلتها.

الـlockfile مثبت. بوابة التطوير المطلوبة هي:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm licenses:report
pnpm licenses:check
pnpm security:audit
```

تفاصيل التحقق والبوابات المتبقية موجودة في [حالة حزمة القبول الفيزيائي](docs/hardware/PHYSICAL_ACCEPTANCE_PACKAGE_STATUS.md)، و[تشغيل اختبار العتاد في المتصفح](docs/testing/milestone-2-hardware-browser-runbook.md)، و[خطة القبول الفيزيائي](docs/hardware/PHYSICAL_ACCEPTANCE_PLAN_AR.md).

## الوثائق الأساسية

- [PROJECT.md](PROJECT.md): هوية المشروع وحدوده.
- [MASTER_PLAN.md](MASTER_PLAN.md): العقد التنفيذي الملزم.
- [DECISIONS.md](DECISIONS.md): سجل القرارات التشغيلية.
- [PHASE_0_DISCOVERY_REPORT.md](PHASE_0_DISCOVERY_REPORT.md): التقرير التنفيذي الموحّد وقرار البوابة.
- [UPSTREAM.md](UPSTREAM.md): سياسة ومراجع upstream.
- [STATUS.md](STATUS.md): الحالة المختصرة الحالية.
- [CONTRIBUTING.md](CONTRIBUTING.md): قواعد المساهمة والاختبارات وسياسة الفروع.
- [docs/upstream/baseline.md](docs/upstream/baseline.md): الـSHAs المثبتة وأدلة الفحص.
- [docs/research/README.md](docs/research/README.md): مخرجات Milestone 0 المطلوبة.
- [docs/architecture/core-api.md](docs/architecture/core-api.md): حدود Core/Host التجريبية.
- [docs/architecture/milestone-2-read-only-device.md](docs/architecture/milestone-2-read-only-device.md): حدود أول اتصال حقيقي للقراءة فقط.
- [docs/architecture/mock-workflows.md](docs/architecture/mock-workflows.md): Binding/Update والتحقق والاستعادة في Mock.
- [docs/hardware/PHYSICAL_ACCEPTANCE_PACKAGE_STATUS.md](docs/hardware/PHYSICAL_ACCEPTANCE_PACKAGE_STATUS.md): حالة مسجل القبول وحدوده.
- [ADR-0011](docs/adr/ADR-0011-github-pages-preview.md): حدود نشر معاينة GitHub Pages وأمانها.
- [ADR-0012](docs/adr/ADR-0012-automatic-multi-method-update-selection.md): اختيار طريقة التحديث المتعددة تلقائيًا دون كتابة حقيقية.
- [ADR-0013](docs/adr/ADR-0013-synthetic-artifact-provenance-and-verification-plan.md): ربط Provenance وخطة التحقق بالتنفيذ التجريبي دون ادعاء أصالة أو عتاد.

## الترخيص

ترخيص كود هذا المستودع لم يُحسم بعد. لا يجوز نسخ أو توزيع كود upstream داخل المشروع قبل إغلاق دراسة حدود الترخيص. مكونات ExpressLRS الرسمية التي تحمل GPL تبقى خاضعة لترخيصها والتزاماتها، وWeb Flasher وTargets يحتاجان توضيح ترخيص صريح قبل نسخ موادهما.
