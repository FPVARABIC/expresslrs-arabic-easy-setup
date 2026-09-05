# Project Master Plan

## ExpressLRS Arabic / Easy Setup

### Web App → Android → Future FPV Platform Integration

هذه الوثيقة، بجميع البنود `1–449` والخاتمة التنفيذية، هي عقد المشروع المعتمد. تحدد الرؤية والقيود والمبادئ والمراحل والبوابات؛ ولا تعني أن كل بند Feature يجب تنفيذه فورًا.

# 1. تعريف المشروع

ننشئ مشروعًا مستقلًا مبنيًا على **ExpressLRS الرسمي مفتوح المصدر**، لتحويل تجربته إلى تجربة أبسط بكثير، عربية أولًا، وقابلة للاندماج لاحقًا داخل منصة FPV أكبر. المشروع ليس مجرد ترجمة.

المسار A — تجربة المستخدم:

- واجهة عربية حديثة.
- تبسيط إعداد ExpressLRS وربط TX/RX وتحديث Firmware.
- اكتشاف الجهاز قدر الإمكان وتقليل القرارات التقنية ومنع الأخطاء الشائعة.
- Advanced Mode للمستخدم الخبير.

المسار B — ExpressLRS Engineering:

- دراسة Firmware الرسمي وتحديد فرص التحسين البرمجية.
- قياس Baseline الأصلي.
- بحث Link stability وRange-related behavior وResponsiveness وPacket reliability وLink recovery وTelemetry efficiency وResource efficiency.
- لا يُعد أي تعديل تحسينًا حتى تثبته الاختبارات.

# 2. الرؤية النهائية

لا نريد Fork عربيًا منفصلًا يصعب تحديثه. نريد:

`Official ExpressLRS Upstream → Our Integration Layer → Our UX Layer → Our Tested Firmware Improvements`

عند إصدار upstream جديد: نكتشفه، نراجع التغييرات، ندمجه في Integration، نشغل الاختبارات، نتحقق من Patches، نحل التعارضات، نعيد Benchmark للتغييرات الحساسة، ثم نصدر نسختنا.

# 3. قاعدة مهمة جدًا

لا نكتب بديلًا لـExpressLRS من الصفر. ندرس أولًا Firmware وWeb UI/Web Flasher وConfigurator وTargets والوثائق الرسمية وآليات build/flash/update وbinding وWi-Fi/Web configuration وdevice targets ومسارات 2.4 GHz و900 MHz/Sub-GHz، ثم نحدد ما يعاد استخدامه وما يحتاج طبقة جديدة.

# 4. المستودع

يُنشأ Repository جديد مستقل، لا داخل مشروع FPV موجود. يبقى Integration-ready لتطبيق إعادة البرمجة والمنصة الأكبر مستقبلًا:

`Standalone today, embeddable tomorrow.`

لا ينبغي أن يتطلب الدمج Copy/Paste أو Rewrite.

# 5. Upstream Strategy

يُسجل ExpressLRS الرسمي كـUpstream واضح. نوثق repository وcommit SHA وrelease/tag وتاريخ المزامنة وPatches والملفات المعدلة وسبب كل تعديل واختباراته، في `UPSTREAM_BASELINE.md` أو نظام مكافئ.

# 6. Licensing

مراجعة GPLv3 وتراخيص المكونات Gate قبل التوزيع. نحافظ على attribution والمصدر الأصلي وإشعارات الترخيص، نحدد الملفات المشتقة، نوفر المصدر حين تلزم الرخصة، ونفحص تراخيص Dependencies الجديدة.

# 7. المعمارية المستهدفة

لا نبني Monolith. الطبقات:

1. **Upstream ExpressLRS:** المصدر الرسمي؛ لا نخلط UX داخله بلا ضرورة.
2. **Device/Core Services:** discovery، identification، target/version/metadata، compatibility، configuration، binding، build، flash/update، backup حيث يمكن، validation، errors، recovery؛ دون اعتماد على React.
3. **ExpressLRS Integration Adapter:** واجهة مثل `discoverDevice()` و`identifyDevice()` و`getFirmwareVersion()` و`getTarget()` و`getConfiguration()` و`prepareBinding()` و`buildFirmware()` و`flashFirmware()` و`verifyFirmware()` و`checkUpdate()`؛ الأسماء النهائية بعد الدراسة.
4. **Workflow Engine:** يدير Workflows بدل أزرار تقنية؛ مثل Connect New Receiver من Discovery حتى Verification وConnection Test.
5. **Web Application:** Arabic-first، RTL، English fallback، responsive، desktop/mobile، وPWA إن كانت مناسبة.
6. **Android:** لا implementation منفصل كامل؛ نقرر PWA/Wrapper/Native bridge/Hybrid بعد Spike لقدرات USB/WebSerial/WebUSB/Bluetooth/Wi-Fi.
7. **Future Platform Integration:** Public/Core API مستقرة نسبيًا ليستدعي التطبيق الأكبر ELRS Module.

# 8. تجربة المستخدم

لا تبدأ بشاشة خيارات تقنية. تتمحور Home حول: **ربط جهاز جديد، تحديث جهاز، إعداد جهاز، فحص الاتصال، إصلاح مشكلة، الوضع المتقدم**.

# 9. Device Dashboard

بعد اكتشاف الجهاز نعرض ما تؤيده الأدلة: TX/RX، Manufacturer، Target، Firmware، Frequency band، Connection state، Update availability، Binding state إن أمكن تحديده موثوقًا، أهم الإعدادات وDiagnostics. لا نعرض معلومة غير مؤكدة كحقيقة.

# 10. Easy Binding

نجرد طرق Binding الرسمية ثم نبني Workflow موحدًا قدر الإمكان:

1. يكتشف الجهاز.
2. يتعرف على نوعه.
3. يحدد TX/RX.
4. يحدد band.
5. يقرأ Firmware/target حيثما أمكن.
6. يتحقق من compatibility.
7. يحدد أفضل Binding method متاحة.
8. يطلب فقط ما لا يمكن اكتشافه.
9. يؤتمت الخطوات الممكنة.
10. يتحقق من النتيجة.
11. يعطي نجاحًا حقيقيًا لا افتراضًا.

# 11. Zero-Confusion Principle

لا نسأل المستخدم عن اختيار يستطيع البرنامج تحديده بأمان. إذا لم توجد أدلة كافية لا نخمن Target؛ نخبره أننا لم نتمكن من تحديد الجهاز بأمان ونطلب تدخله. **سهولة الاستخدام لا تعني التخمين.**

# 12. Beginner / Advanced Modes

Easy Mode لأغلب المستخدمين وبأقل خيارات ممكنة. Advanced Mode يعرض خيارات ExpressLRS المتقدمة المدعومة. لا نحذف القوة؛ نخفي التعقيد عندما لا يلزم.

# 13. Firmware Update

التجربة: `Connect → Detect → Check → Prepare → Update → Verify`. لا Flash دون ثقة كافية في Target.

# 14. Update Safety

قبل Firmware operation: identify، target، compatibility، source، version، artifact validation، confirmation، execution، verification.

الحالات: `Not started`، `Preparing`، `Flashing`، `Rebooting`، `Verifying`، `Success`، `Failed`، `Recovery required`. لا `Success` قبل Verification.

# 15. ExpressLRS Upstream Updates

نصمم Automation مستقبلية ترصد الإصدار، تجلب metadata، تقارن، تنتج change report، تحدد المساحات المتقاطعة مع Patches، وتشغل compatibility وfirmware builds وUI/integration وperformance regression tests. لا Auto-release دون Gates.

# 16. Performance Engineering

مسار مستقل عن UX. لا نغير RF code عشوائيًا؛ نبني Baseline أولًا.

# 17. Performance Baseline

نقيس upstream الرسمي دون تعديلات، بحسب المتاح: packet delivery/loss، latency، jitter، recovery time، telemetry، CPU/memory/timing، link-quality behavior، degraded/interference conditions، packet rates، 2.4 GHz وSub-GHz. تحفظ النتائج.

# 18. الهدف البرمجي

نبحث بلا ادعاءات مسبقة عن Range-related robustness، Stability، Responsiveness، Recovery، Packet reliability، Telemetry efficiency وResource efficiency. المقصود تحسين الاستفادة البرمجية القابلة للقياس، لا تغيير قوانين الفيزياء.

# 19. One Optimized Firmware Principle

الهدف المفضل Firmware line واحدة محسنة، لا Range/Speed/Stability firmwares بلا داعٍ. يدخل التحسين إذا أفاد دون Regression. عند Trade-off حقيقي نبحث عن خوارزمية أفضل أو adaptive behavior أو نوثقه؛ لا ندمج تعديلات متعارضة لمجرد جمع الميزات.

# 20. Evidence Rule

كل Performance Patch يوثق: **Hypothesis، Change، Expected Effect، Test، Baseline، Result، Regression، Decision: Keep / Modify / Reject.**

# 21. لا Performance Claims بدون بيانات

لا نقول "مدى أقوى 30%" أو "أكثر استقرارًا" دون اختبار مناسب. التعديل الذي لا تثبت فائدته يُرفض ولو بدا نظريًا أفضل.

# 22. 2.4 GHz وSub-GHz

يدرس النطاقان منفصلين عند الحاجة. نحدد shared code وband-specific code وradio driver behavior وtiming differences وregulatory/configuration constraints وtarget differences، ونختبر كل نطاق مناسب.

# 23. Simulation / Bench Testing

قبل Flight: Unit، Protocol، Integration، deterministic scenarios، degradation/fault scenarios وrepeatable benchmarks لكشف Regression مبكرًا.

# 24. Hardware Validation

نحتاج لاحقًا Matrix تشمل TX وRX و2.4 GHz وSub-GHz حين يدخل وأكثر من Target عندما يمكن. نفصل دائمًا **Software tested** عن **Hardware validated**.

# 25. Flight Testing

ليس أول اختبار: `Code Test → Build Test → Bench Test → RF/Controlled Test → Hardware Validation → Controlled Flight Test`.

# 26. العربية

Arabic-first لا ترجمة آلية. ننشئ Terminology Dictionary لمصطلحات TX، RX، Binding، Packet Rate، Telemetry، Firmware، Target، Link Quality، Failsafe، ونقرر متى نترجم ومتى نبقي الإنجليزي مع شرح، مثل **جودة الرابط (Link Quality)**.

# 27. Error Messages

بدل `Error 0x...` نعرض: **تعذر الاتصال بالمستقبل**، السبب المحتمل، ما يمكن فعله الآن، ثم التفاصيل التقنية للخبير.

# 28. Diagnostics

يدعم لاحقًا Device/Firmware compatibility/Binding/Connection/Version mismatch/Target mismatch/Update/Configuration checks. لا يغير الجهاز تلقائيًا دون Workflow وموافقة عند الحساسية.

# 29. Security

نفحص firmware source integrity، update artifacts، user firmware، browser/USB permissions، Wi-Fi/device communication، local storage، secrets وdependency supply chain. لا نخزن حساسًا بلا حاجة.

# 30. Privacy

Local-first قدر الإمكان. لا نرسل معلومات الجهاز لخادم بلا حاجة ووضوح. نوثق أي App telemetry مستقبلية.

# 31. Offline Capability

ندرس Offline للconfiguration وknown targets وcached metadata/artifacts حيث تسمح الرخصة والتصميم وdiagnostics. لا نعد بـOffline flashing قبل إثبات القدرة.

# 32. Android Strategy

بعد Web MVP نجري Technical Spike لقدرات browser وUSB/serial وWi-Fi وnative bridge وpermissions وflashing، ثم نقرر PWA أو Wrapper أو Capacitor أو Native bridge أو Hybrid بالأدلة لا بالتفضيل.

# 33. Future FPV Super-App Integration

يقدم التطبيق الأكبر Modules مثل ExpressLRS وFlight Controller programming وDiagnostics وFirmware وConfiguration. لا يعرف ELRS Core تفاصيل UI للمنصة الأم.

# 34. API Boundary

نطور Contracts مثل `DeviceService` و`FirmwareService` و`BindingService` و`UpdateService` و`DiagnosticsService` و`ExpressLrsAdapter` ليستدعي Web أو Android أو Super-App المنطق نفسه.

# 35. Repository Structure

الاتجاه المقترح—ويعدل بعد Phase 0 إذا ظهر أفضل—هو `apps/web` و`apps/android` و`packages/core|device|workflows|expresslrs-adapter|ui|i18n` و`firmware/upstream|patches|experiments` و`tests/unit|integration|hardware|performance` و`benchmarks` و`docs/architecture|research|upstream|ux|firmware|testing|licensing`.

# 36. Git Strategy

لا نعمل مباشرة على `main`؛ هو stable integration state. المراحل في Feature branches مثل `research/upstream-baseline` و`feat/web-foundation` و`feat/device-discovery` و`feat/easy-binding` و`feat/update-workflow` و`research/rf-baseline` و`experiment/link-recovery-*`. Performance experiments لا تدخل production تلقائيًا.

# 37. Commit Discipline

كل Commit محدود الهدف، قابل للمراجعة والاختبار، موثق بوضوح، لا يخلط Refactor كبيرًا مع Feature بلا ضرورة، لا يحمل تغييرات عشوائية، ولا يغير Firmware behavior دون اختبار. أمثلة:

`feat(binding): add device identification stage`

`fix(update): reject mismatched firmware target`

`test(link): add recovery-time baseline scenario`

`docs(upstream): record ExpressLRS baseline`

# 38. Pull Request Policy

كل مرحلة مهمة تدخل PR يوثق الهدف، ماذا ولماذا تغير، المكونات، الاختبارات والنتائج، المخاطر، غير المختبر، Hardware Validation، أثر upstream، screenshots للـUI وbenchmark comparison للأداء. لا Merge لمجرد Compile.

# 39. CI/CD

يبدأ CI مبكرًا ويتدرج عبر Formatting، Linting، Type Checking، Unit/Integration Tests، Web build، Firmware build tests، License، Dependency/Security، Upstream compatibility وPerformance regression. Hardware tests منفصلة عند الحاجة.

# 40. Quality Gates

للFeature: `Code → Static Checks → Unit Tests → Integration Tests → Build → Review → Acceptance → Merge`.

ولFirmware الحساس: `Code → Firmware Build → Protocol Tests → Bench Tests → Baseline Comparison → Regression Analysis → Hardware Validation → Acceptance`.

# 41. حالات الاختبار

لا نختبر Happy Path فقط. Easy Binding يشمل TX/RX صحيحين، التوافق، version mismatch، target unknown، disconnect، flash failure، no return after reboot، denied USB، dropped Wi-Fi، invalid artifact، page close، retry، interruption، unsupported device. المنتج يعرف كيف يفشل ويتعافى.

# 42. State Machine

Workflows الحساسة State Machines واضحة:

`IDLE → DISCOVERING → IDENTIFYING → CHECKING_COMPATIBILITY → PREPARING → WAITING_FOR_CONFIRMATION → EXECUTING → REBOOTING → VERIFYING → SUCCESS`

والفشل: `FAILED`، `RECOVERY_REQUIRED`، `CANCELLED`، `UNKNOWN_STATE`.

# 43. Audit / Operation Log

كل عملية حساسة تنتج سجلًا محليًا واضحًا: detection، identity، version، compatibility، start، artifact verification، flash، reboot، verification؛ دون معلومات حساسة غير لازمة.

# 44. Backup / Recovery

ندرس ما يمكن حفظه واقعيًا: `Read → Snapshot → Change → Verify` ثم Recovery Workflow عند الفشل. لا نفترض Rollback كاملًا؛ نوثق القدرات الحقيقية.

# 45. Firmware Provenance

كل Firmware ينتجه التطبيق يحمل metadata: App version، upstream version/SHA، Patch Set version، Target، Build options، timestamp، لتمكين التشخيص وإعادة البناء.

# 46. Reproducible Builds

نثبت toolchain وdependencies وupstream SHA وbuild configuration وtarget definition وpatch set قدر الإمكان؛ لا نعتمد على جهاز مطور بعينه.

# 47. Target Database

طبقة منظمة مشتقة قدر الإمكان من ExpressLRS الرسمي، تشمل manufacturer/model/target identifier/device type/band/MCU/radio chipset/update methods/limitations/upstream status. لا نبني قاعدة يدوية منفصلة تصبح قديمة.

# 48. Device Detection Confidence

للاكتشاف Confidence: `CONFIRMED`، `HIGH_CONFIDENCE`، `AMBIGUOUS`، `UNKNOWN`. Firmware operations الحساسة تتطلب المستوى المناسب؛ لا Auto-flash عند Ambiguous.

# 49. Compatibility Engine

محرك مركزي يوفر مثل `isTargetCompatible()` و`isFirmwareCompatible()` و`isUpdateMethodSupported()` و`isBindingMethodSupported()` و`isVersionTransitionSupported()`. UI لا تقرر compatibility.

# 50. Easy Setup Wizard

`Connect → Detect → Analyze → Recommend → Confirm → Apply → Verify` بدل عشرات الإعدادات.

# 51. Smart Defaults

نستخدم defaults الرسمية والآمنة. كل Default خاص يوثق `Upstream default، Our default، Reason، Evidence، Risk`. لا نغيره لمجرد الاعتقاد.

# 52. Automatic Recommendations

التوصيات المستقبلية مبنية على بيانات، قابلة للشرح والتراجع حيث يمكن، ولا تدعي Range بلا إثبات.

# 53. الهدف من "One Click"

يعني قرارًا بسيطًا للمستخدم مع تحقق داخلي كامل، لا تنفيذًا خطرًا. زر **ربط المستقبل** قد يخفي عشر خطوات آمنة.

# 54. First-Time User Experience

`مرحبًا → ما الذي تريد فعله؟ → ربط جهاز / تحديث جهاز / إعداد جهاز / فحص مشكلة`. لا نبدأ بـSettings.

# 55. Expert Experience

Advanced Mode يعرض target وfirmware metadata وbinding configuration وpacket/telemetry settings وdevice info وlogs وdiagnostics والعمليات المتقدمة المدعومة.

# 56. Preventing User Errors

يحظر Wrong Target وUnsupported operation، ويتوقف عند Device disappeared أو Unknown state؛ لا يستمر كأن شيئًا لم يحدث.

# 57. Human-Readable Safety

بدل `Target mismatch` نعرض: **هذا الملف لا يطابق جهازك. لن نقوم بالتحديث لأن ذلك قد يؤدي إلى توقف الجهاز عن العمل.** وفي Advanced Details: `Detected target: ... Firmware target: ...`.

# 58. Performance Research Branch

تعديلات Link/RF تبدأ على `research/*` أو `experiment/*`، مثل `experiment/link-recovery-v1` و`experiment/telemetry-scheduling-v1` و`experiment/packet-loss-behavior-v1`، لا Production.

# 59. RF Code Mapping

قبل Firmware changes نرسم radio drivers، TX/RX schedulers، packet generation/parsing، hopping، synchronization، link stats، telemetry scheduling، packet rates، dynamic behavior، reconnection، timeouts، power logic، و2.4/Sub-GHz paths، ونربط كل منطقة باختباراتها.

# 60. No Blind RF Refactoring

لا نعيد كتابة RF لتحسين شكل الكود. Behavior preservation أولًا؛ refactor الحساس يحتاج tests تثبت ثبات السلوك إذا لم يكن تغييره مقصودًا.

# 61. Performance Experiment Registry

لكل تجربة سجل مثل `EXP-001` يحتوي Title، Baseline، Hypothesis، Patch، Test environment، Result، Regression، وDecision: `REJECTED / ACCEPTED / NEEDS_MORE_DATA`.

# 62. Baseline Lock

المقارنة تشمل دائمًا `Official Upstream Baseline`، لا Modified A مقابل Modified B فقط.

# 63. Benchmark Repeatability

نسجل hardware، firmware، band، packet rate، conditions، attenuation/distance، interference، TX/RX config، runs والraw results.

# 64. Statistical Caution

Run واحدة لا تثبت Performance؛ نحتاج عدة Runs وظروف قابلة للمقارنة.

# 65. Regression Budget

لا يكفي تحسين Metric واحدة. تحسن recovery مع تدهور latency الكبير ليس بالضرورة تحسينًا؛ نقيم Patches عبر عدة Metrics.

# 66. Adaptive Optimization

عند Trade-offs ندرس adaptive behavior مثل `Good link → normal` و`Degrading → adaptation` و`Severely degraded → recovery`، ولا ننفذه قبل إثبات الحاجة وقابلية الاختبار.

# 67. Range Goal

المدى هندسيًا: تحسين كل عامل برمجي قابل للقياس يحافظ على رابط صالح وموثوق في ظروف أصعب دون Regression غير مقبول. لا نستخدم RSSI وحده؛ ننظر إلى usable link وpacket delivery وlatency وrecovery وlink quality وcontrol continuity وtelemetry impact.

# 68. Stability Goal

الاستقرار: drops أقل، behavior متوقع، synchronization جيد، recovery موثوق، بلا oscillation/switching سيئ أو انهيار غير ضروري تحت degradation.

# 69. Responsiveness Goal

ليست أعلى Packet Rate فقط؛ نقيس end-to-end حيث يمكن وندرس scheduling وprocessing وbuffering وtelemetry competition وrecovery.

# 70. Telemetry Research

ندرس أثر Telemetry على airtime وcontrol packets وlatency وreliability وrecovery، ونختبر أي فرصة حقيقية.

# 71. Resource Profiling

ندرس RAM وflash وCPU/time budget وallocations وcritical timing وISR behavior وqueues/buffers، مع أولوية UX/Link على optimization غير المؤثر.

# 72. Firmware Patch Layer

لا تصبح نسختنا كتلة تعديلات. كل Patch identifiable وdocumented وtestable وremovable وrebaseable قدر الإمكان.

# 73. Upstream Contribution

نبحث تقديم التحسين العام الحقيقي إلى upstream لتقليل Fork وتسهيل الصيانة وإفادة المجتمع وتقليل التعارضات.

# 74. Upstream Sync Procedure

`Fetch → Read Release Notes → Diff → Identify affected areas → Merge/Rebase into integration → Resolve conflicts → Build matrix → Unit/Integration → Patch tests → Performance regression → Hardware validation where necessary → Release candidate`.

# 75. Upstream Watch

Automation مستقبلية ترصد releases وsecurity fixes وtarget/breaking/architecture changes، لكنها لا تدمج RF تلقائيًا إلى Production.

# 76. Web App Phase 1

MVP الأول: Arabic RTL foundation، English fallback، Home، device connection/detection/info، basic setup، Easy Binding prototype، firmware/version info، update prototype، logs وerrors.

# 77. MVP Success Criteria

ينجح عندما يكمل غير الخبير Workflow أساسيًا دون دليل طويل: `Open → Connect → Identify → Bind/Setup → Guide/perform → Verify → Success`.

# 78. MVP ليس Performance Fork

لا نؤخر العربية حتى ينتهي RF research. المساران متوازيان: `Track A Product/UX/Binding/Update` و`Track B Firmware/RF/Performance Research`.

# 79. Phase 0 — Discovery

ندرس Firmware structure/build/targets/TX-RX/radio/configuration/binding/Wi-Fi/update/Web UI/telemetry/link management، وConfigurator architecture/build/target/flash/device interaction/reuse، وWeb Flasher/browser APIs، وTarget metadata/hardware mapping.

# 80. Phase 0 Deliverables

قبل Production App ننتج:

- `docs/research/expresslrs-architecture.md`
- `docs/research/binding.md`
- `docs/research/flashing.md`
- `docs/research/device-detection.md`
- `docs/research/web-capabilities.md`
- `docs/research/android-risks.md`
- `docs/research/rf-code-map.md`
- `docs/research/upstream-strategy.md`
- `docs/research/licensing.md`
- Architecture Decision Records للقرارات المهمة.

# 81. Phase 0 Exit Gate

لا تنفيذ كبيرًا قبل الإجابة بدقة عن Binding وFlash وقدرات/قيود Browser وTarget detection و2.4/Sub-GHz وإعادة الاستخدام وما لا ينسخ ومزامنة upstream والترخيص ودمج Core مستقبلًا.

# 82. Phase 1 — Repository Foundation

بعد الدراسة: structure، README، license/attribution، contribution rules، architecture، ADRs، CI، formatting/linting/tests، branch policy وdependency policy، ثم Freeze للبنية الأساسية.

# 83. Phase 2 — Web Foundation

نبني app shell، routing، RTL، localization، design system، state management، workflow UI framework، error/logging وdevice abstraction، دون Flash حقيقي إن لم يجهز Adapter.

# 84. Phase 3 — Device Discovery

`Connect → Detect → Identify → Display`. القبول: لا يدعي التطبيق معرفة جهاز لم يحدده.

# 85. Phase 4 — Easy Binding

أول Feature رئيسية. نبني Workflow حقيقيًا بناءً على الطرق الرسمية المثبتة في Phase 0. يجب أن يستطيع Beginner فهمه.

# 86. Easy Binding Acceptance Criteria

لا تكتمل الميزة بمجرد زر Binding. يجب إثبات `Connect → Detect → Identify → Validate → Prepare Binding → Execute → Reconnect → Verify → Success`، ولا تظهر `SUCCESS` إلا بعد Verification مناسب.

# 87. Binding Methods Inventory

نجرد جميع الطرق التي يدعمها إصدار ExpressLRS المستخدم. لكل طريقة نوثق TX/RX requirements، Firmware requirements، Binding Phrase/UID behavior، Wi-Fi، physical interaction، limitations، automation وVerification.

# 88. Binding Strategy Engine

UI لا تختار الطريقة. المنطق المركزي يحول `Device Information + Firmware Information + Capabilities + Current State` إلى `AUTOMATIC` أو `GUIDED` أو `MANUAL_STEP_REQUIRED` أو `UNSUPPORTED` أو `AMBIGUOUS`.

# 89. Minimum User Input

إذا عرف التطبيق الجهاز وTarget وBand وFirmware والطريقة المناسبة، فلا يسأل المستخدم عنها مجددًا.

# 90. Binding Identity

ندرس Binding Phrase/UID رسميًا. لا ترسل الهوية إلى Cloud، ولا تسجل في Logs، ولا تعرض علنًا أو تدخل crash reports بلا حاجة.

# 91. Binding Failure Recovery

نحدد مرحلة الفشل مثل `DEVICE_LOST`، `IDENTIFICATION_FAILED`، `INCOMPATIBLE`، `PREPARATION_FAILED`، `FLASH_FAILED`، `REBOOT_TIMEOUT`، `VERIFICATION_FAILED` ونقدم Recovery مناسبًا.

# 92. Binding Retry

Retry ليس إعادة عمياء. يحدد Engine ما اكتمل وما يعاد استخدامه وما يعاد التحقق منه وهل تغيرت حالة الجهاز.

# 93. Binding Verification

ندرس أفضل دليل تقني لتأكيد الربط؛ لا نعتمد فقط على نجاح command، بل Evidence من الجهاز/الرابط حيث تسمح القدرات.

# 94. Binding UX Testing

نختبر مع مستخدم جديد، معرفة بسيطة، وخبير FPV. السؤال: هل يكمل المبتدئ دون Target names وتفاصيل غير لازمة؟

# 95. Easy Binding Definition of Done

Workflow يعمل، Errors مفهومة، unsupported devices handled، recovery وverification موجودان، العربية مكتملة، English fallback، tests وdocumentation موجودة.

# 96. Firmware Management Phase

بعد Binding: `Firmware Catalog` و`Firmware Resolver` و`Target Resolver` و`Build Service` و`Artifact Validator` و`Flash Service` و`Verification Service` و`Recovery Service`.

# 97. Firmware Source of Truth

لا binaries مجهولة. كل Firmware مرتبط بـUpstream Version/SHA، Our Patch Version، Target، Build Configuration وArtifact Hash.

# 98. Firmware Catalog

Abstraction يعرض installed/available upstream/our supported version وtarget وrelease status وcompatibility. أحدث إصدار ليس دائمًا الاختيار دون Compatibility Check.

# 99. Target Resolution

قبل Build أو Flash: `Detect → Identify → Resolve Target → Cross-check`. إذا غير مؤكد: `STOP`؛ لا Auto-flash.

# 100. Firmware Build Service

Build logic خارج UI، ويحدد source/target/configuration/patch set، ينفذ build، يجمع metadata ويvalidates output.

# 101. Build Reproducibility

كل Build مهم يحدد `Source SHA، Toolchain، Dependencies، Target، Options، Patch Set`.

# 102. Artifact Integrity

نحسب Hash بعد Build ونتحقق قبل Flash أن الملف هو المتوقع.

# 103. Flash Method Abstraction

واجهة `FlashProvider` خلف Browser وWi-Fi وSerial وNative Android وأي Provider رسمي آخر حسب الدراسة.

# 104. Flash Capability Detection

يحدد التطبيق `CAN_FLASH` أو `GUIDED_FLASH` أو `EXTERNAL_TOOL_REQUIRED` أو `UNSUPPORTED`، ولا يعرض زرًا نظريًا.

# 105. Pre-Flash Gate

لا كتابة قبل: identity confirmed، target confirmed، artifact validated، compatibility confirmed، device state appropriate، permissions available وuser intent confirmed.

# 106. Flash Progress

يعكس `Preparing، Transferring، Writing، Finalizing، Rebooting، Verifying`. لا نسبة وهمية حين لا يوفر API تقدمًا حقيقيًا.

# 107. Interrupted Flash

ندرس cable disconnect وbrowser close وphone sleep وWi-Fi drop وunexpected reboot، ونصنف كل حالة `SAFE_TO_RETRY` أو `RECOVERY_REQUIRED` أو `UNKNOWN`.

# 108. Post-Flash Verification

بعد Flash: reconnect، identify، read version، verify target/config حيث يمكن؛ ثم فقط `SUCCESS`.

# 109. Firmware Rollback

لا نعد بـRollback إلا إذا أثبتت التقنية أنه آمن. وإلا نشرح Recovery الحقيقي.

# 110. Firmware Management Definition of Done

Wrong-target prevention، provenance، reproducibility قدر الإمكان، controlled flashing، verification، recovery docs، واختبارات الفشل.

# 111. Diagnostics Phase

يتحول التطبيق لاحقًا من Configurator إلى Assistant؛ Diagnostics Evidence-based.

# 112. Diagnostic Snapshot

نجمع فقط المتاح والمناسب: Device identity، Target، Firmware version، Band، Capabilities، Relevant config، Connection state وlink info.

# 113. Diagnostic Rules Engine

`Facts → Rules → Findings → Recommendations` بدل شروط UI عشوائية.

# 114. Finding Confidence

كل Finding: `CONFIRMED` أو `LIKELY` أو `POSSIBLE` أو `UNKNOWN`. لا نجزم دون دليل.

# 115. Diagnostic Categories

Binding، firmware/target mismatch، update/connection/configuration/telemetry، link observations وunsupported hardware.

# 116. Recommendations

كل توصية تحتوي `Finding، Evidence، Recommended action، Risk، Can app fix automatically?`.

# 117. Auto-Fix Policy

لا Auto-Fix لكل شيء. التغييرات الحساسة تحتاج preview وexplanation وconfirmation وverification.

# 118. Diagnostic Logs

يستطيع المستخدم تصدير Diagnostic Report منقحًا لدعم GitHub/community troubleshooting.

# 119. Privacy Scrubber

قبل Export تزال أو تخفى البيانات غير اللازمة للمشاركة.

# 120. Human Diagnostic Report

بدل Dump: `Device Status، Problems found، Evidence، Recommended actions، Technical details`.

# 121. Machine Diagnostic Report

نوفر JSON schema داخليًا للدمج المستقبلي.

# 122. Diagnostic Reproducibility

كل Finding مهم مرتبط بالRule والFacts اللذين أنتجاه.

# 123. No Magic AI Requirement

Core diagnostics deterministic قدر الإمكان. AI قد يشرح لاحقًا، ولا يقرر Firmware operations الحساسة بلا قواعد.

# 124. Diagnostics Testing

Fixtures لأجهزة وحالات مختلفة؛ Facts نفسها تعطي Findings نفسها.

# 125. Diagnostics Definition of Done

Deterministic core، evidence، confidence، privacy، safe recommendations، export وautomated tests.

# 126. Performance Research Infrastructure

يبدأ المسار الحقيقي بأدوات القياس، لا بتعديل Radio code.

# 127. Official Baseline

نختار release/commit محددًا ونسجل `UPSTREAM_VERSION، UPSTREAM_SHA، BUILD_TOOLCHAIN، TARGET، TEST_CONFIG`.

# 128. Baseline Builds

Builds غير معدلة للأجهزة المستهدفة؛ لا Patch خاص بنا.

# 129. Measurement Harness

يجمع قدر الإمكان packet/link statistics، latency measures، reconnect timing، telemetry، errors وtimestamps.

# 130. Raw Data First

لا نخزن `PASS` فقط؛ نحفظ Raw measurements متى كان عمليًا.

# 131. Benchmark Schema

كل Run يحمل `Test ID، Firmware SHA، Patch Set، TX/RX hardware، Band، Packet/Telemetry config، Environment، Start time، Duration، Raw measurements، Summary`.

# 132. Controlled Conditions

Baseline وCandidate يستخدمان نفس hardware وantenna وfirmware options وenvironment/procedure قدر الإمكان.

# 133. Repeat Runs

نكرر الاختبارات الحساسة ونحدد عدد Runs بعد معرفة variance.

# 134. Performance Dashboard

لاحقًا يعرض `Baseline vs Candidate` للpacket loss وrecovery وlatency وstability وtelemetry impact.

# 135. Regression Thresholds

بعد بيانات كافية نحدد thresholds؛ Candidate الذي يتجاوز Regression المسموح يفشل Gate.

# 136. Experiment Isolation

كل تجربة تغير عاملًا محددًا قدر الإمكان؛ لا نغير خمس خوارزميات ثم نخمن السبب.

# 137. Experiment Lifecycle

`Idea → Hypothesis → Baseline → Patch → Build → Test → Analyze → Keep / Reject`.

# 138. Rejected Experiments Matter

تبقى التجارب المرفوضة موثقة كي لا تتكرر بلا علم.

# 139. Performance Patch Admission

لا يدخل Patch Candidate firmware حتى تنجح tests، تكون الفائدة reproducible، يفحص regression، يراجع الكود ويختبر hardware حيث يلزم.

# 140. Combined Patch Testing

بعد قبول Patches منفردة نختبرها معًا؛ A+B قد يختلف عن كل منهما.

# 141. Performance Build Identity

Firmware التجريبي موسوم `EXPERIMENTAL` بوضوح.

# 142. Experimental Distribution

لا يوضع Experimental RF firmware في Easy Update path للمستخدم العادي.

# 143. Research Documentation

كل دراسة مهمة في `/docs/research/performance/`.

# 144. Performance Data Preservation

تحفظ Raw benchmark data المهمة للمراجعة المستقبلية.

# 145. Research Gate

لا ندعي Range/Stability improvement قبل بنية قياس مناسبة.

# 146. 2.4 GHz Research

مسار مخصص يبدأ Mapping للكود الفعلي في هذا band.

# 147. 2.4 GHz Code Map

نوثق driver، initialization، frequency/hopping، timing، TX/RX scheduling، packet handling، sync، telemetry، link stats وrecovery.

# 148. 2.4 GHz Baseline Matrix

نبدأ Hardware محدودًا ولا نحاول كل السوق.

# 149. 2.4 GHz Packet Behavior

نقيس السلوك عبر configurations المدعومة المختارة للدراسة.

# 150. 2.4 GHz Degradation Testing

نستخدم Controlled degradation قدر الإمكان بدل الابتعاد حتى الانقطاع فقط.

# 151. Interference Testing

أي اختبار interference قانوني وcontrolled وrepeatable ولا يسبب تشويشًا ضارًا.

# 152. Synchronization Research

بعد فهم التنفيذ ندرس sync acquisition/retention/loss/reacquisition. كل تغيير يحتاج timing tests قوية.

# 153. Hopping Research

لا نغير Frequency hopping قبل فهم التنفيذ والقيود التنظيمية وبناء tests وHypothesis واضحة.

# 154. Scheduler Research

ندرس scheduling بين control data وtelemetry وprotocol overhead والعمليات ذات الصلة.

# 155. Link Recovery Research

نقيس الزمن من degradation/loss إلى استعادة رابط صالح.

# 156. Recovery Candidate Algorithms

كل خوارزمية جديدة Experiment منفصل.

# 157. Packet Reliability Research

ندرس موضع loss وتعامل النظام؛ لا نفترض أن retries أفضل لأنها قد تضر latency.

# 158. Latency Preservation

كل Range/Stability improvement يمر latency regression tests.

# 159. Telemetry Preservation

نقيس أثر control changes على telemetry والعكس.

# 160. CPU Timing Preservation

الخوارزمية الأعقد لا تكسر timing constraints.

# 161. Memory Preservation

نتحقق من RAM/flash impact على Targets المناسبة.

# 162. Cross-Target Validation

نجاح Target واحد لا يجعل Patch عامًا؛ نختبر Targets أخرى.

# 163. 2.4 GHz Candidate Build

نقارن `2.4 Candidate` بـ`Official Baseline` بعد قبول مجموعة التحسينات.

# 164. Controlled Validation

Candidate يمر `Bench → Controlled RF → Hardware → Controlled Flight`.

# 165. 2.4 GHz Promotion Gate

لا Stable دون تكرار النتائج وغياب Regression غير مقبول.

# 166. Sub-GHz Research

مسار مستقل للنطاقات المدعومة رسميًا، ولا نسميها كلها "900 MHz" إذا كانت upstream أدق.

# 167. Regulatory Awareness

نحافظ على region/frequency/power behavior المتوافق مع upstream والقانون؛ لا Range mode يتجاوز القيود.

# 168. Sub-GHz Code Map

نوثق driver، hopping، timing، scheduling، telemetry، recovery وband-specific behavior.

# 169. Shared vs Band-Specific

نصنف `Shared Link Logic، Band-Specific Logic، Radio-Specific Logic، Target-Specific Logic`.

# 170. Shared Patch Testing

Patch في Shared Logic يختبر على 2.4 وSub-GHz المناسب.

# 171. Sub-GHz Baseline

ننشئ Baseline منفصلًا.

# 172. Sub-GHz Hardware Matrix

نبدأ بعدد محدود موثق من TX/RX.

# 173. Sub-GHz Recovery

نقيس recovery مستقلاً.

# 174. Sub-GHz Packet Reliability

نقيس reliability في بيئة مناسبة.

# 175. Sub-GHz Latency

أي Range-related improvement يمر latency regression.

# 176. Sub-GHz Telemetry

نقيس أثر telemetry منفصلًا.

# 177. Band-Specific Optimization

التحسين المفيد لـSub-GHz فقط قد يكون implementation داخليًا Band-specific مع Product line واحدة.

# 178. Unified User Experience

لا يختار المستخدم Our 2.4 Algorithm أو Our 900 Algorithm؛ Target يحدد التنفيذ.

# 179. Shared Firmware Philosophy

Firmware واحدة تعني Product line موحدة، لا أن كل hardware ينفذ نفس تعليمات RF.

# 180. Unified Optimization Architecture

الهدف `One Product + One UX + One Release Strategy + Hardware-aware Implementation`. يمكن داخليًا Shared وBand/Radio/Target-specific optimizations دون إدارة يدوية من المستخدم.

# 181. Automatic Optimization Selection

الاختيار المثبت يعتمد `Target + Radio + Band + Capabilities + Firmware Version` لا تخمين المستخدم.

# 182. No Fake Universal Optimization

تحسين 2.4 الذي يضر Sub-GHz لا يفرض عليه؛ المنتج موحد والتنفيذ مناسب للنطاق.

# 183. Optimization Capability Table

ننشر Matrix تربط كل Optimization بـ2.4 وSub-GHz وShared وحالة `YES/NO/TESTING` مولدة من Evidence حقيقية.

# 184. Optimization Versioning

كل مجموعة لها Version داخلي مثل `Optimization Pack: OP-1` مع `Upstream: ExpressLRS X.Y.Z`.

# 185. Optimization Rollback

إذا ظهر Regression بعد Release نستطيع تحديد Patch قدر الإمكان وتعطيله أو الرجوع إلى النسخة المستقرة.

# 186. Link Stability Program

برنامج مستقل للمحافظة برمجيًا على رابط صالح ومستقر في الظروف المتدهورة قدر الإمكان.

# 187. Stability Metrics

Packet continuity، loss distribution/bursts، LQ variation، recovery frequency/duration، sync loss، reconnects وlatency variance.

# 188. Stability Is More Than Average

متوسط loss لا يكفي؛ 2% في Bursts طويلة أسوأ من توزيعه. ندرس Distribution.

# 189. Burst Loss Analysis

نقيس `Single packet loss، Short burst، Medium burst، Long burst، Recovery after burst`.

# 190. Link State Model

ندرس `HEALTHY، DEGRADING، CRITICAL، LOST، RECOVERING`، ولا نضيفه قبل إثبات فائدته وتوافقه مع upstream.

# 191. Link Prediction Research

ندرس Signals التي تكشف degradation مبكرًا، بأولوية deterministic algorithms البسيطة؛ لا ML لمجرد الإمكان.

# 192. Stability Candidate Evaluation

كل Candidate مقابل Official Baseline تحت الاختبارات نفسها.

# 193. Stability Regression Check

لا نقبل Stability improvement إذا أضر latency أو telemetry أو CPU timing أو memory أو compatibility أو recovery بصورة غير مقبولة.

# 194. Link Recovery Program

نقلل `Loss → Usable Link Restored` حيث توجد فرصة برمجية.

# 195. Recovery Metrics

`Loss detection time، Recovery initiation time، Reacquisition time، Usable-link restoration time، Control continuity after recovery`.

# 196. False Recovery Prevention

لا يدخل Recovery بسبب fluctuations طبيعية؛ ندرس hysteresis وthresholds وtiming وstate transitions حسب التنفيذ.

# 197. Recovery Stress Tests

Brief/repeated degradation، extended loss، intermittent link وreconnect loops.

# 198. Recovery + Telemetry

نتأكد أن telemetry لا تسبب behavior سيئًا أثناء recovery.

# 199. Recovery + Packet Rate

نختبر Recovery عبر Packet configurations ذات الصلة.

# 200. Recovery Promotion Gate

لا Stable قبل Hardware validation.

# 201. Latency Program

نحافظ على أقل latency عمليًا ضمن أهداف Stability/Range، ولا نقول "أسرع استجابة" دون measurement.

# 202. Latency Measurement

نحدد start/end؛ لا نخلط protocol timing وRF timing وprocessing latency وend-to-end latency.

# 203. Jitter

نقيس variance؛ Jitter مهم كمتوسط Latency.

# 204. Latency Regression Budget

بعد Baseline نحدد Budget؛ أي Candidate يتجاوزه يحتاج Review.

# 205. Combined Link Objective

نوازن بالأدلة `Range robustness، Stability، Latency، Recovery، Packet reliability، Telemetry، Resource usage`، لا نعظم Metric واحدة.

# 206. Hardware Validation Program

بعد Bench/Simulation الناجح تبدأ Hardware validation المنظمة.

# 207. Hardware Registry

كل جهاز اختبار يسجل `Device ID، Manufacturer، Model، Target، Band، Radio chipset، Hardware revision، Antenna config، Notes` دون نشر serial numbers.

# 208. Reference Hardware

نختار مجموعة صغيرة لـRegression المتكرر.

# 209. Hardware Diversity

نوسع لاحقًا عبر manufacturers وtargets وradios وTX modules وRX families.

# 210. Test Equipment

نحدد قبل الشراء ما يحتاجه Test Plan: attenuation، measurement/logging، controlled power، USB/serial، reference TX/RX.

# 211. Controlled RF Testing

نفضل بيئة repeatable على Flight distance وحده.

# 212. Attenuation Testing

يستخدم إن كان مناسبًا وبإشراف فاهم RF لمنع تلف الأجهزة.

# 213. Over-the-Air Testing

OTA مهم لكشف behavior لا يظهر wired/attenuated.

# 214. Environment Recording

نسجل الظروف المهمة في الاختبارات الخارجية قدر الإمكان.

# 215. Flight Test Gate

لا Flight قبل passing builds/bench/hardware، وغياب critical regression، ومعرفة recovery procedure.

# 216. Controlled Flight Testing

يبدأ آمنًا وتدريجيًا، لا بمسافات قصوى.

# 217. Flight Test Profiles

Profiles مثل `FT-01 Normal`، `FT-02 Controlled degradation`، `FT-03 Recovery`، `FT-04 Telemetry load`، `FT-05 Range progression`.

# 218. Flight Data

نربط `Firmware Build + Configuration + Flight + Logs + Results` حيث يمكن.

# 219. Flight Safety Stop Conditions

تحدد مسبقًا: unexpected failsafe، unstable link، repeated unexplained loss، firmware anomalies.

# 220. Hardware Validation Definition of Done

لا نقول Hardware validated دون identified hardware، procedure، results، build identity، repeatability مقبولة وlimitations موثقة.

# 221. Android Program

يبدأ بعد Web MVP المستقر؛ الهدف ليس Rewrite.

# 222. Android Technical Spike

قبل Framework نختبر USB، Serial، Wi-Fi، discovery، firmware transfer، file access، permissions، background/sleep/reconnect.

# 223. Android Architecture Decision

نختار بعد Spike بين Web/PWA، Hybrid wrapper، Web+Native Bridge، أو Native shell+shared core.

# 224. Shared Core Requirement

لا يعاد منطق compatibility، workflows، metadata، diagnostics، validation، translations أو business rules.

# 225. Platform Adapter

الاختلافات خلف `PlatformAdapter` مثل `BrowserAdapter` و`AndroidAdapter`.

# 226. Android USB

Spike حقيقي على أجهزة Android؛ لا Emulator فقط.

# 227. Android Permissions

كل Permission عند الحاجة مع شرح، ولا طلب لغير الضروري.

# 228. Android Device Disconnect

نتعامل مع cable removal، permission revoked، background، lock وdevice reboot.

# 229. Android Flash Safety

يمر بنفس Web Gates دون تقليل الأمان.

# 230. Android UI

نفس Design System قدر الإمكان وArabic RTL منذ البداية.

# 231. Responsive First

Web يعمل جيدًا على الهاتف قبل Android package.

# 232. Android Offline

ندرس ما يعمل Offline فعليًا.

# 233. Android Release Testing

نختبر أكثر من Android version وmanufacturer وUSB implementation بحسب الموارد.

# 234. Android Crash Recovery

بعد إغلاق حساس، يحدد التطبيق حالة الجهاز عند العودة ولا يفترض نجاحًا أو فشلًا.

# 235. Android Definition of Done

ليس مجرد WebView؛ نثبت device interaction، workflows، permissions، failure handling، capabilities المستهدفة، RTL وreal-device tests.

# 236. PWA Program

ندرس PWA لتحسين Web/mobile experience.

# 237. Installability

إن ناسبت: manifest، icons، install، standalone mode وupdate behavior.

# 238. Service Worker Safety

لا يسمح Cache قديم بـFirmware metadata أو logic غير متوافق.

# 239. Application Version

يعرض التطبيق Version بوضوح.

# 240. Cache Versioning

كل cached resource حساس له versioning مناسب.

# 241. Firmware Cache

أي Firmware محلي مربوط بـ`Version، Target، Hash، Source`.

# 242. Offline Mode

توضح الواجهة `ONLINE` أو `OFFLINE` أو `LIMITED OFFLINE`.

# 243. Offline Firmware Availability

لا نعد Offline Update إذا Artifact المطلوب غير موجود محليًا.

# 244. Offline Diagnostics

تعمل القواعد المحلية Offline إذا توافرت البيانات.

# 245. Offline Documentation

يمكن Cache تعليمات Recovery المهمة إن كان عمليًا.

# 246. Network Failure

لا نستخدم Artifact جزئيًا بعد انقطاع download.

# 247. Resume Downloads

ندعمه فقط إذا استحق التعقيد.

# 248. Update Manifest Integrity

نتحقق من Manifest المستخدم لاختيار Firmware وفق التصميم الأمني.

# 249. PWA Update UX

لا يقطع App update Workflow حساسًا في المنتصف.

# 250. Offline/PWA Definition of Done

Offline behavior predictable وvisible وtested وsafe.

# 251. Security Program

Security جزء من Architecture لا مراجعة أخيرة.

# 252. Threat Model

نحدد Assets: firmware، identity، configuration، build pipeline، update metadata، app code وuser data؛ ثم Threats.

# 253. Firmware Supply Chain

نعرف `Where source came from، What commit، What patches، Who/what built it، What artifact، What hash`.

# 254. Dependency Policy

كل Dependency تراجع من حيث necessity، maintenance، license، security history وbundle impact.

# 255. Dependency Pinning

نستخدم lockfiles/version control المناسبة.

# 256. Automated Security Scanning

يضيف CI الأدوات المناسبة بعد اختيار Stack.

# 257. Secrets Policy

لا Secrets في repository ولا frontend API keys إذا كانت Secrets فعلًا.

# 258. Browser Security

نراجع XSS، CSP، unsafe HTML، file handling، firmware upload وUSB/serial permission flows.

# 259. Firmware File Upload

قبل manual Flash: `Parse → Validate → Identify → Compatibility Check → Warning → Confirmation`.

# 260. Malformed Artifact Handling

ترفض الملفات غير الصالحة Fail-closed.

# 261. Local Storage

كل key له purpose وschema وversion وretention؛ لا نخزن بلا سبب.

# 262. Diagnostic Privacy

Logs لا تجمع Binding identity أو identifiers بلا حاجة.

# 263. Analytics

ليست requirement؛ إن أضيفت فهي minimal وprivacy-aware وdocumented ولا تحتوي secrets/identifiers الحساسة.

# 264. Security Release Gate

Critical security issue يمنع Release.

# 265. Security Documentation

ننشئ `SECURITY.md` وسياسة vulnerability reporting عند فتح المشروع.

# 266. Upstream Synchronization Program

المشروع يتوقع تطور ExpressLRS منذ اليوم الأول.

# 267. Upstream Remote

يوثق repository الرسمي بوضوح.

# 268. Upstream Baseline Record

كل Release لنا يسجل `Our Version، ExpressLRS Version، ExpressLRS SHA، Patch Set`.

# 269. Upstream Change Classification

نصنف التغييرات `UI، Build، Target، Protocol، Radio، Binding، Telemetry، Security، Other`.

# 270. High-Risk Upstream Changes

Protocol/RF/timing/radio/binding/targets تحتاج Review إضافية.

# 271. Patch Conflict

لا نحل conflict ميكانيكيًا فقط؛ نسأل هل ما زال Patch لازمًا أم حل upstream المشكلة.

# 272. Patch Retirement

إذا دمج upstream مكافئًا أو أفضل نحذف Patch؛ تقليل fork delta دائم.

# 273. Upstream Regression Baseline

بعد كل update ننشئ Baseline جديدًا قبل مقارنة تحسيناتنا.

# 274. Old Baseline Preservation

نحفظ التاريخ لكن لا نحكم على upstream جديد بBaseline قديم.

# 275. Upstream Release Candidate

لا نحدث المستخدم فور ظهور upstream Release؛ يمر Integration Pipeline.

# 276. Compatibility Matrix

نحافظ على Matrix `Our App، Our Firmware، ExpressLRS Upstream، Supported Targets، Status`.

# 277. Upstream Automation

يمكنها detect release وopen tracking issue وgenerate diff summary وtrigger builds/tests؛ Merge controlled.

# 278. Emergency Upstream Fix

Security/Critical fix له Fast Track دون تجاوز Target/Build verification.

# 279. Staying Close to Upstream

مقياس الصحة هو حجم الاختلاف الضروري؛ الأقل دون التضحية بالأهداف أفضل.

# 280. Upstream Program Definition of Done

نستطيع أخذ Release جديد دون إعادة بناء المشروع يدويًا من الصفر.

# 281. Future Super-App Integration

المشروع مستقل الآن ويصبح Module مستقبلًا.

# 282. Integration Boundary

Web UI ليست مصدر المنطق الوحيد؛ Core Services قابلة للاستدعاء.

# 283. Module Contract

`ExpressLrsModule` قد يقدم `discover()` و`identify()` و`bind()` و`configure()` و`update()` و`diagnose()`؛ التفاصيل بعد Architecture الفعلية.

# 284. Host Application

يستطيع التطبيق الأكبر تشغيل Module واستقبال progress/errors وعرض UI ومشاركة device abstraction حين يكون منطقيًا.

# 285. Shared Device Layer

إذا تعامل التطبيق الآخر مع USB/Serial/Wi-Fi أو FPV، لا يملك كل Module اتصالًا متصارعًا. نخطط لـ`Shared Device Layer → Device Session → Capability Detection → ExpressLRS / Flight Controller / Future Modules`. لا يلزم تنفيذ المنصة الآن، لكن ELRS لا يمنعها.

# 286. Device Ownership

يتضح مالك الاتصال. لا يفتح مكونان Session متعارضة؛ نحتاج `Device Session، Owner، Capabilities، State، Lock، Release`.

# 287. Module Isolation

خطأ ELRS لا يسقط المنصة. لكل Module boundaries وerror model وstate وlogs وcapabilities.

# 288. Shared Contracts

نشارك فقط العقود المستحقة مثل `DeviceDescriptor` و`Connection` و`OperationProgress` و`OperationResult` و`DiagnosticFinding` و`Capability`؛ لا abstractions عامة مبكرة.

# 289. No Premature Super-App

لا نبني Super-App الآن؛ نبني ELRS مستقلًا مع Integration Boundary.

# 290. Integration Proof

لاحقًا Prototype صغير يثبت استدعاء Core خارج Web UI.

# 291. UI Independence

Core لا يعتمد على React أو DOM أو Arabic strings أو navigation أو dialogs؛ يعيد States/Results وUI تعرضها.

# 292. Localization Independence

Business logic لا يستخدم النص العربي Identifier. الصحيح `status === BOUND` ثم Localization، لا `status === "تم الربط"`.

# 293. Platform Independence

كل Functionality لا تحتاج Browser API تبقى Platform-independent قدر الإمكان.

# 294. Integration Versioning

عند استقرار Core نعطي Contracts versioning كي لا يكسر تطوير ELRS التطبيق الأكبر بلا إنذار.

# 295. Super-App Integration Definition of Done

Core منفصل، adapters واضحة، UI لا تملك المنطق، APIs موثقة، workflows قابلة للاستدعاء، errors/progress structured، واختبارات مستقلة عن UI قدر الإمكان.

# 296. Release Engineering

المراحل `Development → Experimental → Alpha → Beta → Release Candidate → Stable`. ليس كل Commit إصدارًا.

# 297. Versioning

Versioning واضح مثل `0.1.0` حتى `1.0.0`؛ Firmware integration metadata منفصلة عن App version.

# 298. Version Identity

يعرف الدعم `App Version، Core Version، ExpressLRS Upstream Version، Patch Set Version، Firmware Version` حيث يلزم.

# 299. Experimental Channel

Performance experiments في Channel منفصل وباختيار واضح.

# 300. Stable Channel

يحتوي validated workflows وsupported targets وtested firmware وaccepted optimization patches فقط.

# 301. Release Candidate

RC يمر automated tests، build matrix، browsers، devices، Android عند توفره، localization، security، firmware validation وregression.

# 302. Release Notes

كل Release: `New، Improved، Fixed، Known limitations، Supported device/target changes، Upstream ExpressLRS base`.

# 303. Breaking Changes

كل breaking configuration/API/stored-data change له Migration strategy.

# 304. Database/Storage Migration

أي Local DB/structured storage Schema له Version.

# 305. Rollout Strategy

يمكن staged rollout مستقبلًا خصوصًا للتحديثات الحساسة.

# 306. Emergency Rollback

نستطيع إزالة Release سيئ من update path ومنع تنزيله جديدًا.

# 307. Known Bad Builds

نحفظ قائمة Builds التي يمنع استخدامها عند Regression خطير.

# 308. Firmware Revocation Metadata

يحذر التطبيق من Firmware معيب؛ لا يحذفه عن بعد من أجهزة المستخدم.

# 309. Release Artifact Preservation

تحفظ Stable artifacts المهمة مع metadata/hashes.

# 310. Release Definition of Done

لا Stable حتى CI/tests green، critical bugs صفر، security gate، target review، release notes، identified artifacts وknown rollback path.

# 311. Beta Program

قبل 1.0 نحتاج Beta حقيقية مع مستخدمي FPV.

# 312. Beta Cohorts

Beginners وIntermediate وExperts وأكثر من Hardware family.

# 313. Beta Goal

نسأل هل نجح الربط، أين توقفوا، ماذا لم يفهموا، الأخطاء، صحة detection، وضوح recovery وملاءمة مصطلحات FPV العربية؛ لا التصميم فقط.

# 314. Beta Safety

لا نظهر hardware/firmware paths غير المختبرة كStable.

# 315. Feedback Classification

`BUG، UX، TRANSLATION، DEVICE_SUPPORT، FIRMWARE، PERFORMANCE، DOCUMENTATION، FEATURE_REQUEST`.

# 316. Beta Telemetry

لا نشترط Analytics؛ يبدأ feedback يدويًا. أي telemetry مستقبلية وفق Privacy policy.

# 317. Crash Reporting

إن أضيف، ينقح sensitive/device data.

# 318. Reproduction Information

Bug report آمن قد يتضمن app/upstream version، target، workflow، stage وerror code.

# 319. Beta Exit Criteria

Core workflows مستقرة، crash rate مقبول، critical bugs مغلقة، binding success مناسب للمصفوفة، update موثوق، ومشاكل UX الأساسية محلولة.

# 320. Release Candidate User Testing

RC تختبره مجموعة أصغر قبل Stable.

# 321. Documentation Program

سهولة المنتج لا تلغي الوثائق؛ نحتاج طبقتين للمستخدم إضافة إلى وثائق المطور.

# 322. Beginner Documentation

قصيرة وبصرية للربط والتحديث والمشاكل وRecovery.

# 323. Expert Documentation

Architecture، provenance، supported targets، advanced settings، diagnostic codes وperformance methodology.

# 324. Developer Documentation

`Repository، Architecture، Build، Tests، Core APIs، Platform Adapters، Workflow Engine، Firmware Integration، Upstream Sync، Benchmarking، Release Process`.

# 325. Architecture Decision Records

كل قرار كبير ADR مثل Repository Architecture، Upstream Strategy، Web Platform، Device Communication، Android وFirmware Patch Strategy.

# 326. ADR Rule

ADR يشرح `Context، Decision، Alternatives، Consequences`؛ لا يعاد كتابة التاريخ، بل ADR جديد superseding السابق.

# 327. Support Matrix Documentation

جدول `Device، Target، Band، Binding، Update، Diagnostics، Optimized Firmware، Validation Level`.

# 328. Validation Labels

نستخدم `CODE_REVIEWED، BUILD_TESTED، BENCH_TESTED، HARDWARE_TESTED، FLIGHT_TESTED، STABLE` بدقة.

# 329. Known Limitations

صفحة واضحة؛ الشفافية أفضل من الإخفاء.

# 330. Recovery Documentation

تعليمات Recovery متاحة حتى إذا فشل التطبيق نفسه.

# 331. Support Codes

Errors المهمة Codes مستقرة نسبيًا مثل `ELRS-DEVICE-001` و`ELRS-BIND-002` و`ELRS-FLASH-003` مع شرح.

# 332. Logs for Support

يستطيع المستخدم نسخ/تصدير تقرير بدل صورة خطأ فقط.

# 333. Documentation Versioning

وثيقة الإصدار لا تعطي تعليمات مضللة لإصدار آخر.

# 334. Arabic Terminology Guide

Glossary رسمي مثل: `Transmitter (TX) — المرسل`، `Receiver (RX) — المستقبل`، `Binding — الربط`، `Firmware — البرنامج الثابت / Firmware`، `Target — Target / تعريف الجهاز`، `Telemetry — القياس عن بعد / Telemetry`، `Link Quality — جودة الرابط`، `Packet Rate — معدل الحزم`، ويحسن مع مستخدمي FPV العرب.

# 335. Translation Quality Gate

لا Release مع strings غير مترجمة في Easy Mode، RTL broken، مصطلحات متناقضة أو placeholders مكسورة.

# 336. English Fallback

النص الإنجليزي الصحيح يظهر عند غياب الترجمة، لا فراغ أو تخمين.

# 337. Accessibility

Keyboard navigation، contrast، focus states، screen sizes، labels وerror clarity.

# 338. Responsive Testing

Desktop وtablet-like widths وmobile.

# 339. Browser Support Matrix

بعد Spikes نحدد رسميًا Browsers المدعومة، خصوصًا اختلاف Hardware APIs.

# 340. Unsupported Browser UX

نشرح أن المتصفح لا يدعم الاتصال ونقدم الخيار المدعوم بدل الفشل الصامت.

# 341. Maintenance Program

بعد 1.0 يبدأ العمل الحقيقي للصيانة.

# 342. Maintenance Categories

`Upstream updates، Security، Device targets، Browser changes، Android changes، Bug fixes، Performance research، UX improvements`.

# 343. Dependency Updates

لا Auto-merge أعمى؛ تمر CI والمراجعة.

# 344. Upstream ExpressLRS Tracking

كل Release upstream ينتج Tracking task.

# 345. Device Support Expansion

إضافة جهاز تمر `Identify → Target mapping → Build → Binding test → Update test → Recovery test → Validation → Documentation`.

# 346. Performance Regression Monitoring

أي RF-sensitive change يعيد الاختبارات المناسبة.

# 347. Benchmark History

نحفظ النتائج عبر الإصدارات لرؤية الاتجاه.

# 348. Technical Debt Register

كل عنصر: `ID، Description، Impact، Risk، Priority، Owner/Status` بدل TODO مجهول.

# 349. Deprecated Features

`Deprecate → Warn → Migrate → Remove`؛ لا حذف مفاجئ مؤثر.

# 350. Long-Term Fork Health

إذا نما الفرق عن upstream أكثر من اللازم نراجع Architecture.

# 351. v1.0 Product Definition

لا يعني كل فكرة؛ يعني أن الوظائف الأساسية المعلنة Production-ready.

# 352. v1.0 Core Scope

Arabic-first responsive Web App، reliable connection للطرق المدعومة، identification، Easy Setup/Binding، firmware management وsafe update، compatibility/verification، basic diagnostics، recovery guidance، working upstream strategy وdocumented hardware matrix.

# 353. v1.0 Performance Scope

لا نشترط "تحسين مدى" إذا لم يثبت. لا نؤخر منتجًا ممتازًا لادعاء غير مثبت.

# 354. Performance Features Admission to v1.0

Optimization المثبتة قد تدخل بعد Gates؛ وإلا تبقى Research.

# 355. Android and v1.0

Android قد يكون ضمن 1.0 أو Milestone لاحقة حسب Spike والوقت، لكن Architecture Android-ready.

# 356. v1.0 Safety Requirements

لا Critical path يسمح wrong-target flash أو unverifiable success أو silent mismatch أو unhandled interruption أو unsafe artifact.

# 357. v1.0 Quality Requirements

CI stable، core/integration tests، supported hardware validation، release process، docs، security وlicensing review.

# 358. v1.0 UX Requirement

مبتدئ FPV ينفذ الأساسي دون فهم ExpressLRS Build system.

# 359. v1.0 Expert Requirement

لا يمنع الخبير من التفاصيل المهمة.

# 360. v1.0 Upstream Requirement

نثبت الانتقال المنظم بين upstream releases.

# 361. v1.0 Integration Requirement

Core لا يمنع دمجه مستقبلًا مع تطبيق FPV الآخر.

# 362. v1.0 Release Gate

لا 1.0 قبل sign-off داخلي على `Product، Engineering، Firmware، Hardware، Security، Licensing، Documentation، Release` حيث ينطبق.

# 363. Post-v1 Roadmap

Android، hardware، diagnostics، automated recovery، performance، super-app، languages وdeeper device intelligence.

# 364. No Feature Explosion

كل Feature تجيب: هل تجعل ExpressLRS أسهل أو أكثر أمانًا أو موثوقية أو أفضل بإثبات؟

# 365. Priority Model

`Safety → Correctness → Reliability → Ease of use → Maintainability → Measured performance → Additional features`.

# 366. Work Execution Policy

Milestone-by-Milestone: `Research → Plan → Implement → Test → Review → Fix → Retest → Document → Acceptance`.

# 367. No Unapproved Scope Drift

Feature مكتشفة تسجل `PROPOSED` مع السبب والفائدة والتكلفة والمخاطر، ولا تضاف تلقائيًا.

# 368. No Guessing Rule

عند جهل حقيقة تقنية نعود إلى source وofficial docs وupstream history/issues/PRs عند الحاجة والtests، ثم نوثق المصدر.

# 369. Source-of-Truth Hierarchy

`Current ExpressLRS Source → Official Documentation → Official PR/Issue/Release → Our Reproducible Tests → Secondary Sources`. لا نعتمد منشور مجتمع كحقيقة إن أمكن إثباتها رسميًا.

# 370. No Source Modification During Discovery

Phase 0 Read-only؛ لا نعدل ExpressLRS أثناء فهم Architecture.

# 371. Research Evidence

كل نتيجة مهمة تحمل source path، symbol/module، upstream SHA/version، interpretation، confidence وopen questions.

# 372. Phase 0 Repository Baseline

بعد إنشاء Repository نسجل أولًا `PROJECT.md، MASTER_PLAN.md، UPSTREAM.md، docs/research/، docs/adr/` ثم نقرر Integration mechanism؛ لا ننسخ upstream كله مباشرة.

# 373. Repository Naming

يحدد الاسم قبل التنفيذ؛ لا package identifiers مؤقتة يصعب تغييرها.

# 374. Repository Creation Gate

التنفيذ في Repository جديد مستقل، لا مستودع FPV حالي. يكون `Standalone Product + Upstream-aware + Integration-ready`، ولا يدخل كود تطبيق إعادة البرمجة الآخر الآن.

# 375. Repository Initial State

نثبت `main → Initial project foundation → Protected development workflow` ونحفظ نقطة البداية النظيفة.

# 376. First Files

المقترح `README.md، PROJECT.md، MASTER_PLAN.md، UPSTREAM.md، SECURITY.md، docs/research|architecture|adr|testing`، لكن لا ملفات فارغة؛ ينشأ الملف عند وجود محتوى حقيقي.

# 377. MASTER_PLAN as Project Contract

الخطة الكاملة **البنود 1–نهاية الوثيقة** تدخل Repository كمرجع أساسي. ليست كل البنود Features فورية؛ تحدد الرؤية والقيود والمبادئ والمراحل وSafety/Research Gates وLong-term architecture.

# 378. Project Status File

ملف يجيب `Current Phase، Current Milestone، Current Branch، Upstream Baseline، Completed، In Progress، Blocked، Next`.

# 379. Decision Log

إضافة إلى ADRs، سجل للقرارات التشغيلية يمنع إعادة النقاش دون سياقه.

# 380. Phase 0 Starts Read-Only

أول عمل تقني دراسة ExpressLRS دون تعديل. ممنوع أولًا RF patches وBinding rewrites وProtocol/Firmware behavior changes وlarge refactors.

# 381. Pin Current Upstream

نسجل `Official Repository، Default Branch، Current Stable Release، Stable Release SHA، Current Development HEAD، Date inspected، License`؛ لا كلمة latest المتغيرة.

# 382. Upstream Snapshot Record

`docs/upstream/baseline.md` يحمل الحالة الدقيقة؛ كل دراسة تشير إلى SHA.

# 383. Official Repository Inventory

نجرد directories، firmware، build، targets، libraries، scripts، Web UI، tests، CI، configuration وdocs، مع مسؤولية كل منطقة لا Tree فقط.

# 384. Related Official Repositories Inventory

ندرس Configurator وWeb Flasher وTargets وDocs. لكل Repository: `Purpose، Relationship، Reusable concepts/code إن سمحت الرخصة، What we do NOT need`.

# 385. ExpressLRS Architecture Map

ننتج خريطة من الحقيقة مثل `User configuration → Build/configuration system → Firmware → TX/RX logic → Protocol/link → Radio abstraction/driver → Hardware`.

# 386. TX Code Map

نحدد initialization، configuration، communication، packet production، scheduling، telemetry، radio operations، binding، Wi-Fi/update وstate transitions للTX.

# 387. RX Code Map

نحدد initialization، synchronization، receive path، telemetry، binding، configuration، update، recovery وradio interaction للRX.

# 388. Shared Code Map

نحدد المشترك فعليًا وما يخص TX أو RX قبل Performance changes.

# 389. Radio Implementation Map

لكل Radio مهم: `Radio family، Supported bands، Driver path، Abstraction path، Timing code، Configuration`.

# 390. Frequency Band Map

نوثق تمثيل 2.4 وSub-GHz والregions رسميًا، ولا نخترع nomenclature مخالفة لـupstream.

# 391. Binding Source Trace

نتتبع كيف تنشأ Binding identity وأين تخزن وكيف تدخل Build وتستخدم في TX/RX، الطرق المدعومة، runtime مقابل rebuild، قدرات Web UI وVerification.

# 392. Binding Sequence Diagram

ننتج Diagram من المصدر مثل `User → Configurator/App → TX → Binding mechanism → RX → Verification`، ويعتمد النهائي على التنفيذ الحقيقي.

# 393. Binding Friction Inventory

نسجل فقط Friction المثبتة: technical knowledge، target selection، rebuild، Wi-Fi، physical action، unclear errors، no verification، version confusion.

# 394. Easy Binding Opportunity Map

لكل Friction: `Can automate? Can detect? Can infer safely? Can guide? Cannot remove? Risk?`.

# 395. No Fake One-Click

الخطوة Physical الضرورية لا تخفى؛ نشرحها للمستخدم ثم نكمل تلقائيًا. لا ندعي تحكمًا غير ممكن.

# 396. Firmware Build Trace

نتتبع `Source → Target → User configuration → Build flags → Toolchain → Firmware artifact`.

# 397. Configuration Injection Map

نحدد دخول Binding Phrase وregulatory/device/target options وfuture smart setup إلى Firmware.

# 398. Target Resolution Trace

نحدد definitions، selection، metadata، self-identification، حالات عدم الإمكان وسلوك Configurator الحالي.

# 399. Flashing Trace

لكل طريقة رسمية: `Entry point، Protocol، Required state/permissions، Artifact format، Success indication، Failure behavior، Recovery`.

# 400. Web Capability Study

نختبر عمليًا Serial وUSB وWi-Fi/device web UI وfile download/upload وpermissions وbrowser restrictions؛ لا نفترض.

# 401. Browser Matrix Spike

Matrix `Capability | Browser A | Browser B | Browser C` للوظائف الحساسة؛ لا دعم بلا اختبار.

# 402. Mobile Browser Spike

نختبر المتطلبات على Mobile حيث لها معنى لتوجيه Android.

# 403. Configurator Architecture Study

لا ننسخه تلقائيًا. ندرس responsibilities، reusable logic، desktop-specific pieces، ما يحول Core، وcoupling الذي نتجنبه.

# 404. Web Flasher Architecture Study

ندرس browser-device communication، firmware/target handling، flash flow وlimitations.

# 405. Existing Web UI Study

ندرس ما يستخدم مباشرة أو يدمج أو يحتاج UX فوقه وما لا يستطيع Browser التحكم فيه.

# 406. Reuse Matrix

`Component، Upstream location، Reuse directly، Wrap، Adapt، Rewrite، Do not use، Reason` لمنع إعادة البناء بلا داعٍ.

# 407. License Boundary Study

لكل reused code نوثق source وlicense وmodification/distribution obligations؛ GitHub لا يعني حرية الدمج بأي شكل.

# 408. Phase 0 Security Reconnaissance

ندرس firmware trust، endpoints/artifacts، browser-device boundary، local config وbinding data مبكرًا.

# 409. Phase 0 Android Risk Study

نسجل `USB، Serial، Web APIs، Native bridge، Backgrounding، Permissions، Firmware transfer، Reconnect`.

# 410. Phase 0 Integration Risk Study

نحدد Constraints للاندماج مع تطبيق إعادة البرمجة دون بناء المنصة الأخرى.

# 411. Phase 0 RF Map

Read-only map للpacket path وtiming وhopping وsync وtelemetry وlink stats وrecovery وradio drivers وband differences.

# 412. Performance Hypothesis Backlog

الأفكار فقط `HYP-001` مع Observation، Potential opportunity، Code location، Required measurement، Risk، `Status: UNTESTED`؛ ليست Claims.

# 413. Phase 0 Questions Register

كل مجهول `OPEN` أو `ANSWERED` أو `BLOCKED`؛ لا تخمين.

# 414. Phase 0 Deliverable — Architecture Report

يشرح ExpressLRS للأجزاء المتعلقة بأهدافنا، لا Documentation عامة.

# 415. Phase 0 Deliverable — Binding Report

Current mechanisms، source trace، user friction، automation opportunities، risks وproposed Easy Binding architecture.

# 416. Phase 0 Deliverable — Flashing Report

Supported paths، browser capabilities، target safety، recovery وproposed adapter model.

# 417. Phase 0 Deliverable — Web Architecture Recommendation

يوصي Stack/Architecture بعد الأدلة ويوثق الأسباب.

# 418. Phase 0 Deliverable — Android Recommendation

ليس implementation؛ `Likely architecture، Unknowns، Required spike، Reuse strategy، Native requirements`.

# 419. Phase 0 Deliverable — RF Research Plan

يحدد ما يمكن قياسه وhardware/harness المطلوبين وأول Metrics/Hypotheses المعقولة.

# 420. Phase 0 Deliverable — Upstream Strategy

يقارن `Fork، Submodule، Vendoring، Patch queue، Build-time fetch، Hybrid` ثم يختار بالأدلة.

# 421. Phase 0 Deliverable — Repository Architecture

تثبت Structure بعد فهم upstream؛ المبادئ ملزمة وأسماء المجلدات قابلة للتغيير إذا ظهر تصميم أفضل.

# 422. Phase 0 Deliverable — ADR Set

تدخل القرارات الكبرى المحسومة في ADRs.

# 423. Phase 0 Exit Review

تراجع كل Deliverables قبل Product implementation كبير.

# 424. Phase 0 Exit Questions

لا خروج حتى نجيب:

1. ما الذي سنعيد استخدامه من ExpressLRS؟
2. ما الذي سنبنيه نحن؟
3. كيف سيعمل Easy Binding؟
4. كيف سنتعامل مع Flash؟
5. كيف سنحدد Target؟
6. ما الذي يستطيع Web فعله؟
7. ما الذي يحتاج Native؟
8. كيف سنزامن upstream؟
9. كيف نحافظ على الترخيص؟
10. كيف نفصل Core عن UI؟
11. كيف ندمج المشروع مستقبلًا؟
12. كيف سنقيس أي Performance improvement؟

# 425. Phase 0 No-Go

أي Safety-critical مجهول يفتح Spike/Research؛ لا نتجاوزه.

# 426. Phase 1 Starts Only After Gate

Foundation implementation يبدأ بعد قبول Phase 0.

# 427. Phase 1 — Project Foundation

`Repository Architecture، Tooling، CI، Core contracts، Web shell، Localization foundation، Testing foundation`.

# 428. Phase 1 No Hardware Writes

في Foundation نبدأ Read-only/Mock قدر الإمكان؛ لا Flash حقيقي.

# 429. Core Domain Model

Types مثل `Device، DeviceIdentity، Target، FirmwareVersion، Capability، ConnectionState، Operation، OperationProgress، OperationError` وفق Phase 0.

# 430. Structured Errors

Core لا يستخدم "Something went wrong" كـAPI؛ يعيد مثل `DEVICE_NOT_FOUND، TARGET_UNKNOWN، TARGET_MISMATCH، CONNECTION_LOST، UNSUPPORTED` ثم UI تترجم.

# 431. Operation Model

كل عملية حساسة تحمل `Operation ID، Type، State، Progress، Result، Error، Timestamps`.

# 432. Mock Device Layer

يمثل TX وRX وsupported/unknown target وdisconnect وfailure وreboot وversion mismatch.

# 433. Replay Testing

ندرس Replay layer لجلسات غير حساسة إذا أمكن لتكرار bugs.

# 434. Web Shell

Layout، routing، RTL، localization، responsive foundation، error boundaries وapplication state.

# 435. Design Language

بسيط، تقني غير مخيف، مناسب FPV، Arabic-first وmobile-ready، دون معلومات غير لازمة.

# 436. Easy Mode Home

`ربط جهاز جديد، تحديث الجهاز، إعداد الجهاز، تشخيص مشكلة` أولًا.

# 437. Advanced Mode Entry

واضح لكنه ليس Default للمبتدئ.

# 438. Device Connection Prototype

يبدأ Mock ثم Adapter حقيقي.

# 439. Phase 1 Tests

على الأقل Core unit tests، workflow state tests، localization tests المهمة، UI smoke tests وCI build.

# 440. Phase 1 Exit Gate

لا Hardware workflows إذا Foundation غير مستقرة.

# 441. Phase 2 — Read-Only Real Device

أول اتصال حقيقي Read-only قدر الإمكان: `Connect → Identify → Read → Display`.

# 442. First Hardware Rule

لا Flash في أول Hardware milestone؛ نثبت Device abstraction أولًا.

# 443. Device Identity Evidence

كل field معروض يأتي من Evidence معروفة.

# 444. Unknown Device Handling

لا Crash ولا تخمين؛ نعرض: **الجهاز متصل، لكن لم نتمكن من تحديد Target بأمان.**

# 445. Connection Loss Testing

نفصل الكابل في كل مرحلة Read-only ونراقب behavior.

# 446. Phase 2 Acceptance

على Reference Hardware: connect، detect، identify، disconnect handling، reconnect وaccurate information.

# 447. Phase 3 — Easy Binding Prototype

يبدأ بعد ثبات Read-only path.

# 448. Binding Simulation First

نختبر Workflow كاملًا على Mock قبل الكتابة لجهاز.

# 449. Binding Preview

قبل التغيير يرى المستخدم باختصار: `الجهاز، العملية، ما الذي سيتغير`.

# الخاتمة التنفيذية للـMaster Plan

جميع البنود **1–449** السابقة هي المرجع التفصيلي للمشروع. لا نضيف بنودًا أخرى إلا إذا ظهر قرار هندسي جديد أثناء التنفيذ.

## ما سنبنيه

منتج مستقل مبني حول ExpressLRS الرسمي، يبدأ **Web App عربية سهلة جدًا**، ثم Android، ويصبح Module داخل تطبيق FPV الأكبر.

`افتح التطبيق → وصّل الجهاز → التطبيق يتعرف عليه → اختر ربط / إعداد / تحديث → التطبيق يتولى التعقيد → تحقق من النتيجة → تم`

مع Advanced Mode للخبراء.

## المسار الأول — المنتج

`دراسة ExpressLRS → Web Foundation → Device Detection → Easy Setup → Easy Binding → Safe Firmware Update → Diagnostics → Web Beta → Android → Future Super-App Integration`

Easy Binding وSafe Update أهم ميزتين. لا نطلب Target أو Band أو غيرهما إذا حددناهما بأمان، ولا نخمن إذا لم نستطع.

## المسار الثاني — تحسين ExpressLRS

`Official ExpressLRS → Code Mapping → Baseline → Measurement Infrastructure → Hypothesis → Experimental Patch → Benchmark → Regression Testing → Hardware Validation → Controlled Flight Validation → Accept / Reject`

الأهداف: أقصى Range قابل للتحسين برمجيًا، Stability وPacket reliability وRecovery أفضل، Latency أفضل أو محفوظة، Telemetry وResource use أكثر كفاءة حيث تثبت الفرصة.

الهدف Product/Firmware line واحدة قدر الإمكان، مع implementation داخلي مناسب لـ2.4 GHz وSub-GHz. أي تحسين لا تثبته القياسات **لا يدخل Stable**.

## العلاقة مع ExpressLRS

نبقى قريبين من upstream:

`New Upstream → Diff → Integration → Our Patches → Build → Tests → Performance Regression → Hardware Validation عند الحاجة → Our Release`

إذا حل upstream شيئًا نعدله، نحذف Patch الخاص بنا.

## الأمان

لا Firmware write قبل:

`Identify → Target Confirm → Compatibility → Artifact Validation → User Intent → Write → Reconnect → Verify`

لا `SUCCESS` قبل Verification. الحالة غير المعروفة تبقى `UNKNOWN/RECOVERY REQUIRED`.

## Android

لا Rewrite. بعد Web MVP نجري Spike حقيقيًا لـUSB/Serial/Wi-Fi/permissions/flashing، ثم نختار PWA أو Hybrid/Native Bridge بالاختبار. Core وWorkflows وCompatibility وDiagnostics مشتركة قدر الإمكان.

## الدمج المستقبلي

`ExpressLRS Core → Device / Workflow / Firmware APIs → Web App الآن / Android لاحقًا / FPV Super-App مستقبلًا`

وليس `React UI = كل البرنامج`.

## ترتيب العمل الذي يبدأ الآن

### Milestone 0 — Discovery

لا تعديل Firmware. نراجع أحدث المصادر الرسمية ونخرج Architecture/Binding/Build/Flashing/Targets/Web/Detection/RF/Upstream/Licensing/Android/Measurement results.

### Milestone 1 — Foundation

Architecture، Core contracts، Web shell، العربية/RTL، CI، tests، Mock Device Layer وWorkflow Engine.

### Milestone 2 — Device

اتصال حقيقي Read-only: `Connect → Detect → Identify → Display → Disconnect/Reconnect`.

### Milestone 3 — Easy Binding

Binding مبسط مع compatibility وverification وrecovery.

### Milestone 4 — Firmware Update

Build/resolve/flash/update يمنع Wrong Target ويتحقق بعد الكتابة.

### Milestone 5 — Diagnostics

فحص الجهاز وFirmware وBinding وcompatibility والمشاكل بتوصيات Evidence-based.

### Milestone 6 — Web Beta

واجهة عربية للوظائف الأساسية، مع مستخدمين وأجهزة حقيقية.

### Milestone 7 — Performance Laboratory

Baseline رسمي وBenchmark harness وhardware matrix؛ بعدها فقط Range/Stability/Recovery/Reliability/Latency/Telemetry و2.4/Sub-GHz experiments، وكل تجربة Keep أو Reject بالأرقام.

### Milestone 8 — Optimized Firmware

فقط التحسينات المثبتة تدخل Candidate، ثم Hardware/Flight validation قبل Stable.

### Milestone 9 — Android

إعادة استخدام Core والواجهة حيث يمكن مع Platform Adapter.

### Milestone 10 — Integration Ready

تثبيت API boundaries التي تسمح بإدخال ExpressLRS Module في تطبيق FPV الأكبر.

## تعليمات Work لأول جلسة

**ابدأ الآن بـMilestone 0 فقط.**

1. ثبّت النسخة/Commit الحالية من ExpressLRS التي ستدرس.
2. افحص repositories الرسمية ذات الصلة.
3. لا تعدل upstream.
4. أنشئ Architecture/Binding/Build/Flashing/Target maps.
5. حدد ما يعاد استخدامه بدل إعادة بنائه.
6. حدد أفضل Web Architecture.
7. حدد upstream sync strategy.
8. ارسم RF code map لـ2.4 وSub-GHz دون تعديل RF code.
9. أنشئ Performance Hypothesis Backlog دون تنفيذ.
10. اخرج بتقرير Phase 0 ومقترح Milestone 1.
11. لا تبدأ Milestone 1 قبل مراجعة Phase 0.
12. لا Push/Merge/Release أو تعديل مستودعات أخرى خارج Repository المشروع دون سياسة GitHub المتفق عليها.

القاعدة:

**Understand → Measure → Implement → Test → Verify → Ship.**

ولـFirmware:

**لا نسمي شيئًا تحسينًا لأن الكود يبدو أفضل؛ نسميه تحسينًا عندما يثبت القياس أنه أفضل ولا يسبب Regression غير مقبول.**

# END OF MASTER PLAN

**جميع البنود 1–449 + هذه الخاتمة تشكل الخطة الكاملة للمشروع.**

**لا توجد تكملة مطلوبة قبل بدء العمل.**

الخطوة التالية ليست كتابة خطة أخرى: **إنشاء Repository المشروع ثم بدء Milestone 0 — Discovery.**
