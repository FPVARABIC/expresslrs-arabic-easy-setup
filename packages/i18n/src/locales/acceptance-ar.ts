import { acceptanceEn } from "./acceptance-en";

export const acceptanceAr = {
  // --- physical acceptance steps ------------------------------------------
  "acc.step.secure_browser.title": "المتصفح والسياق الآمن",
  "acc.step.secure_browser.instructions":
    "افتح النسخة المراجعة عبر HTTPS في Chrome أو Edge وتأكد من ظهور Web Serial.",
  "acc.step.secure_browser.evidence":
    "السياق آمن، Web Serial متاح، ورابط التطبيق وCandidate SHA مسجلان.",
  "acc.step.bench_baseline.title": "خط أساس منصة الاختبار",
  "acc.step.bench_baseline.instructions":
    "سجل نوع TX/RX والكابل ومصدر الطاقة والهوائي وحالة المراوح قبل أي كتابة.",
  "acc.step.bench_baseline.evidence":
    "اسم مختصر للمنصة، مصدر طاقة ثابت، هوائي TX مثبت، والمراوح منزوعة عند الحاجة.",
  "acc.step.tx_crsf_identity.title": "تعريف TX عبر CRSF",
  "acc.step.tx_crsf_identity.instructions":
    "اختر TX وافتح المنفذ المباشر وانتظر Device Info صحيحًا وCRC صالحًا.",
  "acc.step.tx_crsf_identity.evidence":
    "اسم المنتج، إصدار Firmware، إصدار Hardware، VID/PID إن توفرا، وعدد Parameters.",
  "acc.step.rx_crsf_identity.title": "تعريف RX عبر CRSF",
  "acc.step.rx_crsf_identity.instructions":
    "اختر RX وافتح المنفذ المباشر وانتظر Device Info صحيحًا وCRC صالحًا.",
  "acc.step.rx_crsf_identity.evidence":
    "اسم المنتج، إصدار Firmware، إصدار Hardware، VID/PID إن توفرا، وعدد Parameters.",
  "acc.step.wrong_port_rejected.title": "رفض المنفذ الخاطئ",
  "acc.step.wrong_port_rejected.instructions":
    "اختر عمدًا منفذ Joystick أو منفذًا لا يرسل CRSF وتأكد من عدم إعلان اتصال ناجح.",
  "acc.step.wrong_port_rejected.evidence":
    "فشل منظم بلا هوية جهاز وبلا بقاء المنفذ محجوزًا.",
  "acc.step.wrong_role_rejected.title": "رفض دور TX/RX الخاطئ",
  "acc.step.wrong_role_rejected.instructions":
    "اختر RX لجهاز TX أو العكس وتأكد من توقف الجلسة مغلقة.",
  "acc.step.wrong_role_rejected.evidence":
    "رسالة عدم تطابق الدور، عدم عرض هوية مقبولة، وإغلاق المنفذ.",
  "acc.step.reconnect_identity_stable.title":
    "ثبات الهوية بعد الفصل وإعادة الاتصال",
  "acc.step.reconnect_identity_stable.instructions":
    "افصل الجهاز ثم أعد توصيله واقرأ هويته مرة ثانية.",
  "acc.step.reconnect_identity_stable.evidence":
    "عودة الدور والمنتج وإصدار Hardware والهوية المتوقعة بلا تبديل Target.",
  "acc.step.settings_backup_created.title": "إنشاء نسخة إعدادات",
  "acc.step.settings_backup_created.instructions":
    "بعد تعريف الجهاز، أنشئ لقطة الإعدادات المرئية القابلة للاستعادة.",
  "acc.step.settings_backup_created.evidence":
    "وجود Backup مرتبط بهوية الجهاز ولا يحتوي الحقول المخفية أو الحساسة.",
  "acc.step.reversible_setting_write.title": "كتابة إعداد قابل للعكس",
  "acc.step.reversible_setting_write.instructions":
    "غيّر إعدادًا آمنًا واحدًا ضمن حدوده ثم اطلب القراءة الرجعية.",
  "acc.step.reversible_setting_write.evidence":
    "القيمة المقروءة بعد الكتابة تطابق القيمة المطلوبة حرفيًا.",
  "acc.step.settings_restored.title": "استعادة الإعداد الأصلي",
  "acc.step.settings_restored.instructions":
    "استعد لقطة الإعدادات وتحقق من كل قيمة بالقراءة الرجعية.",
  "acc.step.settings_restored.evidence":
    "عودة القيمة الأصلية وعدم وجود فشل أو Parameter ناقص.",
  "acc.step.tx_bind_command_ack.title": "إقرار أمر Bind على TX",
  "acc.step.tx_bind_command_ack.instructions":
    "نفذ Command Parameter الحقيقي للربط على TX وانتظر إقرار الجهاز.",
  "acc.step.tx_bind_command_ack.evidence":
    "إقرار أمر CRSF فقط؛ لا يسجل نجاح RF في هذه الخطوة.",
  "acc.step.rx_bind_command_sent.title": "إرسال أمر Bind إلى RX",
  "acc.step.rx_bind_command_sent.instructions":
    "ضع RX في حالة جاهزة وأرسل أمر الربط الحقيقي أو Legacy fallback الموثق.",
  "acc.step.rx_bind_command_sent.evidence":
    "تسجيل نوع الأمر واستجابة RX إن توفرت، دون افتراض نجاح الرابط.",
  "acc.step.rf_link_observed.title": "مشاهدة رابط RF من الطرفين",
  "acc.step.rf_link_observed.instructions":
    "تحقق من مؤشرات TX وRX ومن عودة Telemetry أو دليل الرابط المستقل.",
  "acc.step.rf_link_observed.evidence":
    "دليل منفصل من الطرفين؛ إقرار أمر Bind وحده غير كافٍ.",
  "acc.step.firmware_package_verified.title": "بناء Firmware وحزمة الاستعادة",
  "acc.step.firmware_package_verified.instructions":
    "اختر Release وTarget والمنطقة، ابن الحزمة، وتحقق من SHA-256 ثم نزّل Recovery.",
  "acc.step.firmware_package_verified.evidence":
    "Target وRelease وطريقة الرفع وأسماء القطاعات وعناوينها وبصماتها مسجلة.",
  "acc.step.bootloader_entry.title": "الدخول إلى Bootloader",
  "acc.step.bootloader_entry.instructions":
    "نفذ طريقة Bootloader المطابقة للـTarget وتأكد من تعرف الأداة على المنصة الصحيحة.",
  "acc.step.bootloader_entry.evidence":
    "اسم الشريحة أو Target أو واجهة DFU المطابقة قبل المسح.",
  "acc.step.normal_flash_verified.title": "تفليش طبيعي والتحقق من البايتات",
  "acc.step.normal_flash_verified.instructions":
    "نفذ أول Flash طبيعي بطاقة ثابتة ومن دون قطع متعمد.",
  "acc.step.normal_flash_verified.evidence":
    "اكتمال المسح والكتابة وRead-back أو تحقق الأداة من القطاعات.",
  "acc.step.post_flash_reconnect.title":
    "إعادة الإقلاع والتحقق من Target والإصدار",
  "acc.step.post_flash_reconnect.instructions":
    "أعد اختيار الجهاز بعد الإقلاع وتأكد من عودة نفس الهوية وRelease أو Commit المتوقع.",
  "acc.step.post_flash_reconnect.evidence":
    "Target verified، إصدار/Commit مطابق، والجلسة قابلة للاستخدام.",
  "acc.step.recovery_package_restore.title": "استعادة عادية بحزمة Recovery",
  "acc.step.recovery_package_restore.instructions":
    "على جهاز اختبار، نفذ استعادة الحزمة الموثقة ثم تحقق من العودة الكاملة.",
  "acc.step.recovery_package_restore.evidence":
    "بصمة الحزمة مطابقة، الكتابة ناجحة، والهوية والإصدار عادا كما هو متوقع.",
  "acc.step.interrupted_flash_recovery.title": "استعادة بعد انقطاع متعمد",
  "acc.step.interrupted_flash_recovery.instructions":
    "اختبار اختياري أخير على جهاز احتياطي فقط: اقطع العملية في مرحلة WRITING ثم استعدها.",
  "acc.step.interrupted_flash_recovery.evidence":
    "ظهور RECOVERY_REQUIRED، استئناف آمن، ثم عودة Target والإصدار المتوقعين.",

  // --- acceptance status labels and export ---------------------------------
  "acc.status.NOT_RUN": "لم يبدأ",
  "acc.status.PASS": "ناجح",
  "acc.status.FAIL": "فاشل",
  "acc.status.BLOCKED": "متعذر",
  "acc.status.SKIPPED": "متجاوز",
  "acc.md.unrecorded": "غير مسجل",
  "acc.md.operator": "المشغّل",
  "acc.md.bench": "المنصة",
  "acc.md.app": "التطبيق",
  "acc.md.browser": "المتصفح",
  "acc.md.completed": "مكتمل",
  "acc.md.passed": "ناجح",
  "acc.md.failed": "فاشل",
  "acc.md.blocked": "متعذر",
  "acc.md.skipped": "متجاوز",
  "acc.md.notRun": "لم يبدأ",
  "acc.md.evidenceSection": "الأدلة والملاحظات",
  "acc.md.result": "النتيجة",
  "acc.md.optional": "اختياري",
  "acc.md.destructive": "مدمر",
  "acc.md.yes": "نعم",
  "acc.md.no": "لا",
  "acc.md.evidence": "الدليل",
  "acc.md.notes": "ملاحظات",
  "acc.md.noEvidence": "لا يوجد دليل مسجل.",
  "acc.md.noNotes": "لا توجد ملاحظات.",
  "acc.md.lastSnapshot": "آخر لقطة حالة",
  "acc.md.generalNotes": "ملاحظات عامة",
  "acc.md.none": "لا توجد.",
  "acc.md.title": "جولة القبول الفيزيائي",
  "acc.md.summary": "الملخص",
  "acc.md.stepsTable": "الخطوات",
  "acc.md.colOrder": "#",
  "acc.md.colStep": "الخطوة",
  "acc.md.colRisk": "الخطورة",
  "acc.md.colStatus": "النتيجة",
  "acc.md.colObserved": "وقت الرصد",
  "acc.md.evidenceLimitTitle": "حد الدليل",
  "acc.md.evidenceLimit":
    "هذا التقرير يسجل ما شاهده المشغل. نجاح CI أو المحاكاة لا يحول أي بند إلى HARDWARE_OBSERVED دون تجربة جهاز فعلية.",

  // --- acceptance panel ----------------------------------------------------
  "accp.heading": "القبول الفيزيائي وتسجيل النتائج",
  "accp.subheading":
    "جميع الاختبارات متاحة مباشرة. الترتيب أدناه موصى به وليس قفلًا برمجيًا.",
  "accp.progressLabel": "نسبة اكتمال السجل",
  "accp.readinessHeading": "ما تحتاجه كل عملية على الجهاز الآن",
  "accp.readinessReady": "جاهزة",
  "accp.readinessBlocked": "بانتظار:",
  "accp.readinessUnknown": "غير مقيَّمة في هذا العرض.",
  "accp.recordingAlwaysOpen":
    "التسجيل والاستيراد والتصدير وتغيير النتائج متاحة دائمًا هنا. قائمة الجاهزية أعلاه تصف عمليات الجهاز فقط، ولا تقفل هذا المسجل أبدًا.",
  "accp.noPhysicalPassFromSoftware":
    "نتيجة برمجية لا تتحول أبدًا إلى نجاح مادي. سجّل ما شاهدته على المنصة فقط.",
  "accp.op.settingsWrite": "كتابة الإعدادات",
  "accp.op.settingsRestore": "استعادة الإعدادات",
  "accp.op.binding": "الربط",
  "accp.op.firmwareWrite": "كتابة Firmware",
  "accp.op.recovery": "الاستعادة",
  "accp.op.rxAsTx": "المستقبل كمرسل",
  "accp.op.airport": "AirPort",
  "accp.captureContext": "التقاط الحالة الحالية",
  "accp.exportJson": "تصدير JSON",
  "accp.exportMarkdown": "تصدير تقرير Markdown",
  "accp.importSession": "استيراد جلسة",
  "accp.newSession": "جلسة جديدة",
  "accp.session": "الجلسة",
  "accp.passed": "ناجح",
  "accp.failed": "فاشل",
  "accp.blocked": "متعذر",
  "accp.notRun": "لم يبدأ",
  "accp.operatorAlias": "اسم المشغل المختصر",
  "accp.benchLabel": "اسم منصة الاختبار",
  "accp.benchPlaceholder": "مثال: TX-1 / RX-1",
  "accp.candidateShaPlaceholder": "Commit SHA للنسخة المختبرة",
  "accp.overallNotes": "ملاحظات عامة",
  "accp.notesPlaceholder":
    "لا تكتب UID أو SSID أو كلمة مرور أو Binding phrase.",
  "accp.lastSnapshot": "آخر لقطة حالة محفوظة",
  "accp.stepsCount": "{count} اختبارات",
  "accp.expectedEvidence": "دليل القبول:",
  "accp.destructiveWarning":
    "هذا الاختبار يكتب على Flash. نفذه بعد نجاح الاختبارات الأقل خطورة، وعلى جهاز احتياطي في حالة الانقطاع المتعمد.",
  "accp.result": "النتيجة",
  "accp.resultOf": "نتيجة {step}",
  "accp.captureStepEvidence": "التقاط دليل هذه الخطوة",
  "accp.recordedEvidence": "الدليل المسجل",
  "accp.evidenceOf": "دليل {step}",
  "accp.operatorNotes": "ملاحظات المشغل",
  "accp.notesOf": "ملاحظات {step}",
  "accp.optional": "اختياري",
  "accp.required": "مطلوب",
  "accp.noTimestamp": "لا توجد ملاحظة زمنية",
  "accp.lastUpdated": "آخر تحديث: {at}",
  "accp.phase.PREFLIGHT": "تهيئة منصة الاختبار",
  "accp.phase.IDENTITY": "التعريف والاتصال",
  "accp.phase.SETTINGS": "الإعدادات القابلة للعكس",
  "accp.phase.BINDING": "الربط اللاسلكي",
  "accp.phase.FIRMWARE": "Bootloader والتفليش",
  "accp.phase.RECOVERY": "الاستعادة",
  "accp.risk.READ_ONLY": "قراءة فقط",
  "accp.risk.REVERSIBLE_WRITE": "كتابة قابلة للعكس",
  "accp.risk.RF": "رابط RF",
  "accp.risk.FIRMWARE_WRITE": "كتابة Firmware",
  "accp.risk.RECOVERY_DRILL": "اختبار استعادة",
  "accp.msg.freshRecord":
    "بدأ سجل جديد لأن Candidate SHA المحفوظ لا يطابق SHA هذه النسخة.",
  "accp.msg.ready":
    "سجل محلي جاهز. كل خطوة متاحة من البداية ولا توجد تبعية إجبارية بين الخطوات.",
  "accp.msg.contextCaptured":
    "تم التقاط الحالة الحالية من التطبيق دون حفظ كلمات مرور أو SSID أو Binding phrase.",
  "accp.msg.evidenceCaptured":
    "تم التقاط الدليل لـ{step}. النتيجة تحتاج مشاهدة المشغل.",
  "accp.msg.evidenceCapturedWithSuggestion":
    "تم التقاط دليل قابل للتحقق واقتراح {status} لـ{step}.",
  "accp.msg.newSession":
    "تم إنشاء جلسة قبول جديدة. الجلسة السابقة لم تعد في التخزين المحلي.",
  "accp.msg.jsonExported": "تم إنشاء ملف JSON منقح من الحقول الحساسة.",
  "accp.msg.markdownExported":
    "تم إنشاء تقرير Markdown قابل للمراجعة والإرفاق بالـPR.",
  "accp.msg.unboundExport":
    "هذه النسخة لا تحمل Candidate SHA دقيقًا، لذا يسجله التصدير على أنه UNSPECIFIED.",
  "accp.msg.importTooLarge": "ملف الاستيراد فارغ أو أكبر من 1 MiB.",
  "accp.msg.importInvalid":
    "ملف النتائج غير صالح أو لا يطابق مخطط القبول الفيزيائي.",
  "accp.msg.importShaMismatch":
    "رُفض الاستيراد لأن Candidate SHA في الملف لا يطابق SHA هذه النسخة.",
  "accp.msg.imported": "تم استيراد الجلسة والتحقق من بنيتها وحدودها.",
  "accp.msg.importUnreadable": "تعذر قراءة ملف النتائج.",
  "accp.msg.captureBlock": "لقطة {at}",
  "accp.candidateShaUnknown": "غير مرتبطة بنسخة محددة",
} satisfies Record<keyof typeof acceptanceEn, string>;
