# ExpressLRS Arabic / Easy Setup

مشروع مستقل يضيف تجربة عربية سهلة وآمنة حول ExpressLRS الرسمي، مع Core قابل لإعادة الاستخدام في Web أولًا، ثم Android، ثم منصة FPV أكبر مستقبلًا.

## الحالة الحالية

- المرحلة: `Milestone 1 — Foundation`
- الفرع المحلي: `research/upstream-baseline`
- السلوك المسموح حاليًا: Core/Workflow/Mock/RTL Web Foundation واختبارها محليًا
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

## Foundation الحالية

```text
apps/web                 واجهة عربية RTL بخط Cairo
packages/domain          الحقائق والأخطاء وحالات العمليات
packages/device          الأدلة، حل الهوية، وملكية Device Session
packages/compatibility   Target Catalog قابل للحقن وقرارات Fail-closed
packages/workflows       State Machine وRead-only Discovery
packages/platform-mock   أجهزة Synthetic متعددة وحالات الفشل
packages/i18n            العربية وEnglish fallback
```

الموديلات ليست شروطًا داخل الواجهة أو الـCore. يضيف Adapter أدلة الجهاز، ويطابقها Catalog مثبت الإصدار، ثم يقرر Core مستوى الثقة والقدرات. بيانات العرض الحالية Synthetic فقط ولا تعني دعم أجهزة تجارية بعينها.

بعد توليد `pnpm-lock.yaml` في بيئة تستطيع الوصول إلى npm، بوابة التطوير المطلوبة هي:

```bash
pnpm install --frozen-lockfile
pnpm check
```

تفاصيل التحقق الحالي والبوابات المتبقية موجودة في [STATUS.md](STATUS.md).

## الوثائق الأساسية

- [PROJECT.md](PROJECT.md): هوية المشروع وحدوده.
- [MASTER_PLAN.md](MASTER_PLAN.md): العقد التنفيذي الملزم.
- [DECISIONS.md](DECISIONS.md): سجل القرارات التشغيلية.
- [PHASE_0_DISCOVERY_REPORT.md](PHASE_0_DISCOVERY_REPORT.md): التقرير التنفيذي الموحّد وقرار البوابة.
- [UPSTREAM.md](UPSTREAM.md): سياسة ومراجع upstream.
- [STATUS.md](STATUS.md): الحالة المختصرة الحالية.
- [docs/upstream/baseline.md](docs/upstream/baseline.md): الـSHAs المثبتة وأدلة الفحص.
- [docs/research/README.md](docs/research/README.md): مخرجات Milestone 0 المطلوبة.

## الترخيص

ترخيص كود هذا المستودع لم يُحسم بعد. لا يجوز نسخ أو توزيع كود upstream داخل المشروع قبل إغلاق دراسة حدود الترخيص. مكونات ExpressLRS الرسمية التي تحمل GPL تبقى خاضعة لترخيصها والتزاماتها، وWeb Flasher وTargets يحتاجان توضيح ترخيص صريح قبل نسخ موادهما.
