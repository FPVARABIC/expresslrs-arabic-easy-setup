# ExpressLRS Arabic / Easy Setup

مشروع مستقل يضيف تجربة عربية سهلة وآمنة حول ExpressLRS الرسمي، مع Core قابل لإعادة الاستخدام في Web أولًا، ثم Android، ثم منصة FPV أكبر مستقبلًا.

## الحالة الحالية

- المرحلة: `Milestone 2A — Read-only real-device candidate`
- معاينة GitHub Pages: `https://fpvarabic.github.io/expresslrs-arabic-easy-setup/`؛ معاينة عامة وليست Release أو دليل Hardware
- الفرع المحلي: `feat/read-only-device-foundation`
- السلوك المسموح حاليًا: Foundation وMock، إضافة إلى قراءة Wi-Fi حقيقية تجريبية ومحدودة يبدأها المستخدم عبر `GET /config` فقط
- السلوك المحظور حاليًا: تعديل upstream، أو Flash أجهزة، أو ادعاء دعم Hardware/تحسين أداء
- نمط الأجهزة: Model-agnostic عبر Evidence/Capabilities وTarget Catalog قابل للحقن، دون hard-coded models
- الخط الأساسي للواجهة: Cairo ذاتي الاستضافة
- خط ExpressLRS المستقر المثبت للدراسة: `4.1.0` عند `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6`
- مرجع فرع التطوير وقت الفحص: `master` عند `73ce820ba51437f73f31686233b607c58e188e7b`

## ما الذي يميز المنتج؟

ExpressLRS يبقى مصدر التقنية اللاسلكية الرسمي. هذا المشروع يبني فوقه:

- واجهة عربية وRTL مصممة للمبتدئ، مع Advanced Mode للخبير.
- Workflows للربط والإعداد والتحديث بدل عرض خيارات تقنية مبعثرة.
- اكتشاف الجهاز والـTarget والـBand عندما توجد أدلة كافية، والتوقف عند الغموض.
- بوابات أمان تمنع Wrong Target ولا تعرض `SUCCESS` قبل Verification.
- تشخيص واستعادة وسجلات عمليات مفهومة.
- طبقات Core وDevice وWorkflow مستقلة عن React وعن المنصة.
- مسار أبحاث أداء لا يقبل أي تحسين إلا بعد Baseline وقياسات وRegression tests.

## قاعدة العمل

> Understand → Measure → Implement → Test → Verify → Ship.

لا توجد نسخة مستخدم أو Firmware خاص بالمشروع بعد. لا يوجد Hardware Validation بعد.

معاينة GitHub Pages تعرض الواجهة العربية/English ومختبر Mock، وتبقي الكتابة
كلها معطلة. قد يمنع المتصفح المستضاف قراءة عناوين أجهزة HTTP المحلية؛ نجاح
هذا المسار غير معتمد إلى أن تكتمل مصفوفة المتصفح والعتاد. GitHub Pages لا
يطبّق ملف `_headers` كرؤوس استجابة، لذلك تستخدم المعاينة CSP جزئيًا داخل HTML
وتبقى بوابة الاستضافة الموثوقة مفتوحة.

## Foundation الحالية

```text
apps/web                 واجهة عربية RTL بخط Cairo
packages/domain          الحقائق والأخطاء وحالات العمليات
packages/device          الأدلة، حل الهوية، وملكية Device Session
packages/compatibility   Target Catalog قابل للحقن وقرارات Fail-closed
packages/diagnostics     تقارير دعم ثابتة الفئات وخالية من قيم الجهاز
packages/workflows       Discovery وEasy Binding وUpdate State Machines وModule API
packages/platform-browser  موفر Local HTTP للقراءة فقط دون أي write API
packages/platform-mock   أجهزة/Providers Synthetic ومصفوفة فشل واستعادة
packages/i18n            العربية وEnglish fallback وربط الأخطاء المنظمة
```

الموديلات ليست شروطًا داخل الواجهة أو الـCore. يضيف Adapter أدلة الجهاز، ويطابقها Catalog مثبت الإصدار، ثم يقرر Core مستوى الثقة والقدرات. توجد الآن قراءة حقيقية تجريبية منفصلة عن مختبر Mock؛ حقائق `/config` ذاتية الإبلاغ و`UNVALIDATED`، ولا تدخل مسارات Binding/Update التجريبية ولا تؤكد Target أو دعم جهاز تجاري بعينه.

المسار الحقيقي الحالي لا يفحص الشبكة تلقائيًا ولا يقرأ إلا من ثلاثة عناوين ExpressLRS محلية مثبتة. ويستبعد الاستجابة الخام وUID وخيارات Wi-Fi وSSID وكلمة المرور قبل عبور البيانات إلى Core. ويعرض تقدّمًا ولقطات قراءة يدوية، ويمكنه نسخ تقرير دعم ثابت الفئات بلا قيم الجهاز. لا توجد كتابة أو إعادة تشغيل أو Binding أو Firmware update في هذا المسار.

الـlockfile مثبت. بوابة التطوير المطلوبة هي:

```bash
pnpm install --frozen-lockfile
pnpm check
```

تفاصيل التحقق والبوابات المتبقية موجودة في [STATUS.md](STATUS.md)، وسجلا القبول في [Milestone 1](docs/testing/milestone-1-acceptance.md) و[مرشح Milestone 2A للقراءة فقط](docs/testing/milestone-2-read-only-acceptance.md).

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
- [ADR-0011](docs/adr/ADR-0011-github-pages-preview.md): حدود نشر معاينة GitHub Pages وأمانها.

## الترخيص

ترخيص كود هذا المستودع لم يُحسم بعد. لا يجوز نسخ أو توزيع كود upstream داخل المشروع قبل إغلاق دراسة حدود الترخيص. مكونات ExpressLRS الرسمية التي تحمل GPL تبقى خاضعة لترخيصها والتزاماتها، وWeb Flasher وTargets يحتاجان توضيح ترخيص صريح قبل نسخ موادهما.
