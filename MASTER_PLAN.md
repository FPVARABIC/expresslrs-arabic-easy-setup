# Master Plan — Normative Project Contract

## الاعتماد

اعتمد مالك المشروع في 2026-08-20 الخطة التفصيلية ذات البنود `1–449` مع الخاتمة التنفيذية، وطلب بدء `Milestone 0 — Discovery` فقط. جميع تلك البنود ملزمة ولا تُلغى بهذا التلخيص. إذا بدا أن هذا الملف المختصر يضيق شرطًا ورد في الخطة المعتمدة، يُطبّق الشرط الأكثر أمانًا والأكثر صرامة إلى أن يُسجل قرار جديد في ADR.

هذا الملف يحفظ العقد التنفيذي المنظم داخل المستودع؛ لا يحول كل بند طويل الأجل إلى Feature فورية.

## توجيه المالك اللاحق — 2026-08-20

- لا تُربط Foundation بموديلات Hardware نملكها مسبقًا؛ يجب أن تكون Model-agnostic وقادرة على قراءة Evidence/Capabilities لموديلات مختلفة عبر Adapters وTarget Catalog قابل للحقن.
- عدم توفر أجهزة الآن لا يمنع Milestone 1 Mock/Foundation، لكنه لا يمنح أي `HARDWARE_TESTED` أو Device-support claim ولا يسمح Hardware writes.
- الواجهة العربية تستخدم خط **Cairo** بصورة ذاتية الاستضافة قدر الإمكان، مع fallbacks سليمة.

هذا التوجيه يسمح ببدء M1 Foundation فقط مع Synthetic Fixtures، ويؤجل Hardware/browser verification إلى Milestone الأجهزة قبل أي Write أو Release.

## الرؤية

بناء منتج مستقل حول ExpressLRS الرسمي:

`Official upstream + Integration/Core layer + Arabic UX + Tested firmware improvements`

المنتج يبدأ Web App عربية سهلة، ينتقل إلى Android بعد Spike، ويبقى قابلًا للدمج داخل منصة FPV أكبر دون Copy/Paste أو Rewrite.

## تجربة المستخدم المستهدفة

`Open → Connect → Detect → Identify → Choose task → Bind/Setup/Update → Verify → Success`

- لا نسأل عن Target أو Band أو خيار يمكن تحديده بأمان.
- لا نخمن عند نقص الدليل.
- Easy Mode يخفي التعقيد، وAdvanced Mode يحافظ على القوة التقنية.
- الخطأ يشرح ما حدث، السبب المحتمل، الخطوة التالية، والتفاصيل التقنية عند الطلب.

## بوابات الأمان

قبل أي Firmware write:

`Identify → Confirm target → Compatibility → Validate artifact → Confirm intent → Write → Reconnect → Verify`

- لا `SUCCESS` قبل Verification.
- الغموض ينتج `UNKNOWN_STATE` أو `RECOVERY_REQUIRED`.
- لا وعد بـRollback أو Offline flashing قبل إثبات القدرة الفعلية.
- كل عملية حساسة لها State Machine وOperation Log محلي منقح للخصوصية.

## هندسة الأداء

`Official baseline → Measurement infrastructure → Hypothesis → Isolated experiment → Repeatable benchmark → Regression analysis → Hardware validation → Controlled flight validation → Keep/Reject`

- لا Claims دون بيانات.
- 2.4 GHz وSub-GHz يُدرسان منفصلين حيث تختلف المسارات.
- Product/Firmware line موحدة للمستخدم لا تعني implementation داخليًا واحدًا لكل Radio أو Band.
- أي Patch يجب أن يكون identifiable وdocumented وtestable وremovable وrebaseable قدر الإمكان.

## العلاقة مع upstream

- نسجل release/tag وSHA وتاريخ الفحص وpatch set والملفات والاختبارات.
- كل تحديث upstream يمر عبر Diff وIntegration وBuild/Test وRegression وHardware gates عند الحاجة.
- إذا حل upstream المشكلة، يُحال Patch الخاص بنا إلى retirement.
- تقليل fork delta هدف دائم.

## المعمارية المستهدفة

1. Official ExpressLRS upstream
2. Device/Core services
3. ExpressLRS integration adapter
4. Workflow engine
5. Arabic-first Web application
6. Android platform adapter بعد Spike
7. Future module contract / shared device integration

العقود المتوقعة تشمل Device وFirmware وBinding وUpdate وDiagnostics وPlatform adapters، لكن الأسماء النهائية تُحسم بعد Discovery.

## مراحل التنفيذ المعتمدة

| Milestone | النطاق | البوابة |
| --- | --- | --- |
| M0 | Discovery read-only | مراجعة تقارير Phase 0 وقبولها |
| M1 | Foundation/Core/Web shell/RTL/CI/Mock workflows | Foundation stable؛ لا Hardware writes |
| M2 | Real device read-only | Connect/identify/reconnect موثوق بلا تخمين |
| M3 | Easy Binding | End-to-end verification وrecovery |
| M4 | Safe Firmware Update | Wrong-target prevention + artifact provenance + verification |
| M5 | Deterministic diagnostics | Evidence + confidence + privacy + tests |
| M6 | Web Beta | Arabic UX + real users/devices + supported matrix |
| M7 | Performance laboratory | Official baseline + harness + hardware matrix |
| M8 | Optimized firmware | Reproducible evidence + hardware/flight gates |
| M9 | Android | Real-device Spike and shared Core |
| M10 | Integration ready | Stable module/API boundaries |

## Milestone 0 الملزم الآن

M0 Read-only. يجب تثبيت المصادر الرسمية الحالية وإنتاج أدلة حول:

- Firmware architecture وTX/RX/shared paths.
- Binding mechanisms/source trace/friction/opportunities/verification.
- Build/configuration injection/artifact provenance.
- Target metadata/resolution/confidence.
- Flashing providers, success evidence, interruption and recovery.
- Configurator وWeb Flasher وdevice Web UI وإمكانات إعادة الاستخدام.
- Browser/WebSerial/WebUSB/PWA/mobile constraints.
- Android risks وNative bridge unknowns.
- RF code map لـ2.4 GHz وSub-GHz دون تغيير RF code.
- Licensing/security/upstream integration strategy.
- Performance measurement plan وUNTESTED hypothesis backlog.

لا يبدأ M1 حتى Phase 0 Exit Review.

## بوابة خروج Milestone 0

يجب أن تجيب الأدلة عن:

1. ما الذي نعيد استخدامه وما الذي نبنيه؟
2. كيف تعمل طرق Binding الحالية وكيف نتحقق منها؟
3. كيف يعمل Build وFlash وما حالات الفشل؟
4. كيف نحدد Target وما درجة الثقة المطلوبة؟
5. ما الذي يستطيع Web فعله وما الذي يحتاج Native؟
6. كيف نبقى قريبين من upstream ونحترم التراخيص؟
7. كيف نفصل Core عن UI ونحافظ على integration boundary؟
8. كيف سنقيس أي تحسين أداء دون Claims زائفة؟

أي سؤال Safety-critical غير محسوم يمنع الخروج ويفتح Spike أو Research task.

## سياسة التنفيذ وGit

- `main` يمثل Stable integration state.
- العمل المرحلي يكون على feature/research/experiment branches.
- Discovery لا يعدل upstream.
- Performance experiments لا تدخل Production تلقائيًا.
- كل Commit محدود، قابل للمراجعة والاختبار، ولا يخلط Feature مع refactor غير ضروري.
- كل PR مهم يوثق الهدف والتغييرات والاختبارات والمخاطر وما لم يُختبر ومستوى Hardware validation وتأثير upstream.
- لا Merge لأن الكود Compiles فقط.
- لا scope drift؛ الأفكار الجديدة تسجل `PROPOSED`.

## تعريف v1.0

v1.0 يعني Product workflows آمنة وموثقة ومدعومة على Hardware matrix محددة. لا يشترط ادعاء تحسين المدى. أي Performance optimization غير مثبتة تبقى Research-only.
