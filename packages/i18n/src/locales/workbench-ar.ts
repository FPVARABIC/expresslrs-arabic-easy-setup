import type { workbenchEn } from "./workbench-en";

/** The Arabic side of Advanced Mode. Keys are typed against the English set. */
export const workbenchAr = {
  "wb.deny.NO_DEVICE_SESSION":
    "وصّل الجهاز وعرّفه أولًا؛ لا يمكن تغيير جهاز غير متصل.",
  "wb.deny.IDENTITY_UNCONFIRMED":
    "هوية الجهاز غير مؤكدة؛ أعد التعريف عبر CRSF قبل أي تغيير.",
  "wb.deny.PORT_CLEANUP_UNCONFIRMED":
    "إغلاق منفذ سابق غير مثبت؛ أعد تحميل الصفحة بعد فصل الجهاز بأمان.",
  "wb.deny.OPERATION_IN_PROGRESS":
    "هناك عملية جارية؛ انتظر انتهاءها أو ألغِها.",
  "wb.deny.RECOVERY_JOURNAL_UNREADABLE":
    "تعذر قراءة سجل الاستعادة؛ لا تُسمح الكتابة بلا مسار استعادة معروف.",
  "wb.deny.PENDING_RECOVERY_CHECKPOINT":
    "توجد استعادة معلقة من عملية سابقة؛ أكملها أولًا.",
  "wb.deny.NO_PENDING_RECOVERY": "لا توجد عملية متوقفة تحتاج استعادة.",
  "wb.deny.TARGET_NOT_MATCHED":
    "اختر Target مطابقًا للجهاز المتصل قبل الكتابة.",
  "wb.deny.BAND_NOT_MATCHED": "النطاق لا يطابق الجهاز المتصل؛ صحّح الاختيار.",
  "wb.deny.ARTIFACT_NOT_VERIFIED": "جهّز حزمة Firmware وتحقق منها قبل الكتابة.",
  "wb.deny.RECOVERY_NOT_AVAILABLE":
    "نزّل حزمة الاستعادة أولًا حتى يمكن التراجع.",
  "wb.deny.BENCH_NOT_ACKNOWLEDGED":
    "أكّد ثبات الطاقة، وتركيب هوائي TX، قبل بدء الكتابة.",
  "wb.deny.USER_CONFIRMATION_MISSING": "أكّد العملية قبل تنفيذها.",

  "wb.method.uart": "USB مباشر / UART",
  "wb.method.betaflight": "عبر متحكم الطيران",
  "wb.method.edgetx": "عبر جهاز التحكم",
  "wb.method.passthru": "Passthrough جاهز",
  "wb.method.wifi": "Wi-Fi",
  "wb.method.stlink": "STM32 DFU",
  "wb.method.download": "تنزيل فقط",

  // --- receiver as transmitter (upstream `--rx-as-tx`) --------------------
  "workbench.options.rxAsTx": "تفليش هذا المستقبل بـ Firmware المرسل",
  "workbench.options.rxAsTx.off": "معطّل — يبقى مستقبلًا",
  "workbench.options.rxAsTx.internal": "داخلي (Full-duplex)",
  "workbench.options.rxAsTx.external": "خارجي (Half-duplex)",
  "workbench.options.airport": "AirPort — جسر تسلسلي شفاف (لا يغيّر دور RX/TX)",
  "workbench.rxAsTx.NO_TARGET_SELECTED":
    "اختر Target رسميًا أولًا؛ إمكانية تشغيل Firmware المرسل تعتمد على الجهاز نفسه.",
  "workbench.rxAsTx.TARGET_IS_TRANSMITTER":
    "{target} مرسل بالفعل، فلا يوجد دور لتغييره.",
  "workbench.rxAsTx.PLATFORM_UNSUPPORTED":
    "UNSUPPORTED_BY_TARGET: يعمل {target} على {platform}. ExpressLRS يبني Firmware «المستقبل كمرسل» لمستقبلات ESP32 وESP8285 فقط، لذا لا يقبله هذا الجهاز.",
  "workbench.rxAsTx.MODE_UNSUPPORTED_BY_PLATFORM":
    "UNSUPPORTED_BY_TARGET: يعمل {target} على {platform}، وهي تدعم وضع {modes} فقط. مستقبلات ESP8285 لا تملك UART ثانيًا، لذا الوضع الخارجي Half-duplex غير متاح.",
  "workbench.rxAsTx.NO_TX_ARTIFACT":
    "UNSUPPORTED_BY_TARGET: مدخل الكتالوج الرسمي لـ {target} لا يسمّي ملف مستقبل يمكن اشتقاق بناء مرسل منه، فلا يوجد Firmware مرسل له.",
  "workbench.rxAsTx.LAYOUT_HAS_NO_SERIAL_PINS":
    "UNSUPPORTED_BY_TARGET: مخطط العتاد الرسمي لـ {target} لا يعلن زوج serial_rx/serial_tx، فلا يجد Firmware المرسل منفذًا تسلسليًا يقوده.",

  "wb.status.idle":
    "يمكنك تعريف الجهاز مباشرة؛ حمّل الكتالوج فقط عند تجهيز Firmware رسمي.",
  "wb.status.unknownError": "توقفت العملية بسبب خطأ غير معروف",
  "wb.status.fileBounds": "الملف يجب أن يكون بين 1 بايت و{maximum}",
  "wb.status.recoveryJournalUnreadable":
    "تعذر التحقق من سجل الاستعادة؛ بقيت كل عمليات الكتابة مقفلة: {detail}",
  "wb.status.sessionCloseUnproven":
    "تعذر تأكيد إغلاق جلسة الجهاز؛ أُخفيت أي هوية وتوقفت إعادة الاتصال حتى إعادة تحميل الصفحة.{detail}",
  "wb.status.sessionChangedDuringOperation":
    "تغيرت جلسة الجهاز أو حالة تنظيف المنفذ أثناء العملية؛ تم تجاهل النتيجة المتأخرة.",
  "wb.status.disconnected": "انقطع اتصال الجهاز. أعد اختياره يدويًا للمتابعة.",
  "wb.status.cannotOpenNewSession":
    "لا يمكن فتح جلسة أجهزة جديدة لأن إغلاق المنفذ السابق غير مثبت؛ أعد تحميل الصفحة بعد فصل الجهاز بأمان.",
  "wb.status.portCloseFailed": "تعذر إغلاق المنفذ بأمان: {detail}",
  "wb.status.authorizationStale":
    "تغيّرت جلسة الجهاز أو هويته بعد التصريح؛ أعد التعريف ثم حاول مجددًا.",
  "wb.lock.needIdentity":
    "وصّل الجهاز وعرّفه أولًا؛ أوامر تغيير الجهاز تحتاج هوية مؤكدة.",
  "wb.lock.journalLoading": "انتظر اكتمال فحص سجل الاستعادة قبل تغيير الجهاز.",
  "wb.lock.journalUnreadable":
    "تعذر التحقق من سجل الاستعادة؛ كل أوامر تغيير الجهاز مرفوضة بأمان.",
  "wb.lock.portCleanupUnproven":
    "إغلاق منفذ جهاز سابق غير مثبت؛ أعد تحميل الصفحة بعد فصل الجهاز بأمان.",
  "wb.lock.closePending": "انتظر حتى يثبت إغلاق جلسة الجهاز السابقة.",
  "wb.lock.pendingRecovery":
    "توجد استعادة معلقة؛ أكملها قبل إرسال أي أمر يغيّر الجهاز.",

  "wb.catalog.loading": "جارٍ تحميل فهرس الإصدارات وكتالوج Targets الرسميين…",
  "wb.catalog.progressIndex": "فهرس الإصدارات: {received}{total}",
  "wb.catalog.progressTargets": "كتالوج Targets: {received}{total}",
  "wb.catalog.progress": "{stage}: {received}{total}",
  "wb.catalog.loaded":
    "تم تحميل {releases} إصدارًا قابلاً للبناء و{targets} Target رسميًا.",
  "wb.catalog.loadedExact":
    "تم تحميل الكتالوج ومطابقة {product} بـTarget رسمي واحد.",
  "wb.catalog.loadedNoMatch":
    "تم تحميل الكتالوج مع بقاء هوية CRSF مثبتة. مطابقة Target: {confidence}.",
  "wb.catalog.failed": "تعذر تحميل المصدر الرسمي: {detail}",

  "wb.connect.prompt":
    "اختر منفذ وحدة ExpressLRS المباشر؛ جارٍ إرسال CRSF Device Ping…",
  "wb.connect.incomplete": "لم يكتمل التعرف: {detail}",
  "wb.connect.exactMatch":
    "تم إثبات CRSF ومطابقة {product} بـTarget رسمي واحد.",
  "wb.connect.noCatalog":
    "تم إثبات CRSF وهوية {product}. يمكنك تحميل الكتالوج لاحقًا لمطابقة Target وتجهيز التحديث.",
  "wb.connect.noMatch":
    "تم إثبات CRSF وهوية الجهاز. مطابقة Target: {confidence}؛ اختر Target الرسمي وأكّد مفتاحه قبل التفليش.",
  "wb.connect.stopped": "توقفت جلسة التعرف: {detail}",

  "wb.settings.chooseFirst": "اختر إعدادًا معلنًا من الجهاز قبل الكتابة.",
  "wb.settings.invalidValue": "أدخل قيمة صحيحة قبل حفظ الإعداد.",
  "wb.settings.writing": "جارٍ كتابة {name} ثم إعادة قراءته…",
  "wb.settings.applied":
    "تم حفظ {name} وأُعيدت قراءته من الجهاز بالقيمة نفسها.",
  "wb.settings.mismatch":
    "لم تطابق القراءة الرجعية القيمة المطلوبة لـ{name}، فلا يُعلن الإعداد مطبَّقًا.",
  "wb.settings.failed": "تعذر حفظ الإعداد: {detail}",
  "wb.settings.restoring": "جارٍ استعادة لقطة الإعدادات والتحقق من كل قيمة…",
  "wb.settings.restored": "اكتملت استعادة {count} قيمة مع قراءة رجعية.",
  "wb.settings.restoreFailed": "توقفت استعادة الإعدادات: {detail}",

  "wb.bind.needIdentity": "وصّل الجهاز وعرّفه قبل إرسال أمر الربط.",
  "wb.bind.needAcknowledgement":
    "أكّد جاهزية الطرف الآخر والطاقة والهوائيات قبل إرسال أمر الربط.",
  "wb.bind.sending": "جارٍ إرسال أمر الربط الحقيقي الذي يعلنه الجهاز عبر CRSF…",
  "wb.bind.telemetry":
    "أبلغ الجهاز عن رابط RF حي (جودة الرابط {quality}%). هذا دليل آلي.",
  "wb.bind.commandOnly":
    "اكتمل أمر الربط، لكن لم تُرصد تلمترية رابط، فلا يُسجَّل الربط ناجحًا: {information}",
  "wb.bind.stopped": "توقف الربط: {detail}",
  "wb.bind.evidenceLevel": "مستوى دليل الربط: {level}",
  "wb.fw.needRegion": "اختر المنطقة التنظيمية صراحة قبل بناء Firmware.",
  "wb.fw.preparing": "جارٍ تنزيل الحزمة الرسمية وتجهيز Firmware لهذا Target…",
  "wb.fw.optionsChanged":
    "تغيرت الخيارات أثناء البناء؛ تم تجاهل الحزمة القديمة.",
  "wb.fw.prepared":
    "تم تجهيز {segments} قطاعًا والتحقق من SHA-256. نزّل حزمة الاستعادة قبل أي كتابة.",
  "wb.fw.preparedWithPhrase":
    "تم تجهيز {segments} قطاعًا والتحقق من SHA-256، مع عبارة ربط مضمّنة. نزّل حزمة الاستعادة قبل أي كتابة.",
  "wb.fw.prepareFailed": "تعذر تجهيز Firmware: {detail}",
  "wb.fw.downloadStarted": "تم بدء تنزيل {file}.",
  "wb.fw.recoveryDownloadStarted":
    "بدأ المتصفح طلب تنزيل حزمة الاستعادة، لكن التطبيق لا يستطيع إثبات حفظها. بعد التحقق من وجود الملف، أكّد ذلك يدويًا.",
  "wb.fw.luaDownloading":
    "جارٍ تنزيل ملف Lua الرسمي المتوافق مع إصدار ExpressLRS…",
  "wb.fw.luaFailed": "تعذر تنزيل ملف Lua: {detail}",

  "wb.reconnect.prompt": "أعد اختيار منفذ الجهاز بعد الإقلاع",
  "wb.reconnect.promptStatus":
    "أعد اختيار منفذ الجهاز بعد الإقلاع لإثبات الهوية والإصدار.",
  "wb.reconnect.failed": "تعذرت إعادة قراءة الجهاز: {detail}",
  "wb.reconnect.isolateFailed":
    "تعذر عزل جلسة إعادة الاتصال بعد فشل تنظيف سابق",
  "wb.reconnect.afterUnprovenClose":
    "اكتملت إعادة قراءة الجهاز بعد رصد منفذ سابق غير مثبت الإغلاق.",
  "wb.reconnect.readingIdentity": "قراءة هوية الجهاز بعد الإقلاع",
  "wb.reconnect.closeMismatchedFailed":
    "تعذر تأكيد إغلاق جلسة إعادة الاتصال غير المطابقة",
  "wb.reconnect.targetMismatch":
    "عاد جهاز، لكن أدلة Target لا تطابق العملية المخططة ({reason}).",
  "wb.reconnect.confirmingTarget": "تأكيد مطابقة Target المقروء",
  "wb.reconnect.closeVersionMismatchFailed":
    "تعذر تأكيد إغلاق جلسة الإصدار غير المطابق",
  "wb.reconnect.versionMismatch":
    "عاد الجهاز، لكن الإصدار/Commit لا يطابق {expected}.",
  "wb.reconnect.confirmingVersion": "تأكيد الإصدار/Commit المقروء",
  "wb.reconnect.closePreviousFailed":
    "تعذر تأكيد إغلاق جلسة CRSF السابقة بعد إعادة الاتصال",
  "wb.reconnect.closeFallbackFailed":
    "تعذر تأكيد إغلاق جلسة إعادة الاتصال الاحتياطية",
  "wb.reconnect.previousCloseUnproven":
    "تعذر إثبات إغلاق جلسة CRSF السابقة؛ أُوقفت إعادة الاتصال بأمان.",
  "wb.reconnect.closeAfterGateChange":
    "تعذر تأكيد إغلاق جلسة إعادة الاتصال بعد تغير بوابة التنظيف",
  "wb.reconnect.gateChangedDuring":
    "تغيرت جلسة الجهاز أو بوابة تنظيف المنفذ أثناء إعادة الاتصال؛ عُزلت الجلسة الجديدة.",
  "wb.reconnect.gateChangedBefore":
    "تغيرت جلسة الجهاز أو بوابة تنظيف المنفذ قبل اعتماد إعادة الاتصال.",
  "wb.reconnect.complete":
    "أُثبتت الهوية وTarget والإصدار، وأُغلق سجل الاستعادة",

  "wb.transport.cleanupUnproven":
    "إغلاق منفذ جهاز سابق غير مثبت؛ أُوقف فتح أي منفذ كتابة جديد.",
  "wb.transport.crsfClosed": "جلسة CRSF المباشرة مغلقة.",
  "wb.transport.gateChangedDuringIdentity":
    "تغيرت حالة تنظيف منفذ الجهاز أثناء التحقق من الهوية؛ أُوقفت الكتابة.",
  "wb.transport.roleMismatch": "نوع الجهاز تغير أو لا يطابق Target المختار.",
  "wb.transport.liveIdentityDrifted":
    "هوية الجهاز الحية لم تعد تطابق Target الذي حصل على إعفاء التأكيد اليدوي.",
  "wb.transport.bootloaderTargetMismatch":
    "Bootloader أبلغ Target مختلفًا: {target}",
  "wb.transport.noBootloaderCommand":
    "الجهاز لا يعلن أمر Bootloader صالحًا؛ أُوقفت الكتابة بأمان.",
  "wb.transport.detachFailed":
    "فشل تحرير منفذ CRSF للتفليش، لذلك لا يمكن إثبات إغلاقه: {detail}",
  "wb.transport.closeAfterCancel":
    "تعذر تأكيد إغلاق المنفذ الذي اختير بعد إلغاء عملية التفليش",
  "wb.transport.gateChangedDuringPort":
    "تغيرت حالة تنظيف منفذ الجهاز أثناء اختيار المنفذ؛ أُوقفت الكتابة.",

  "wb.flash.journalLoading": "انتظر اكتمال فحص سجل الاستعادة قبل أي كتابة.",
  "wb.flash.journalUnreadable":
    "تعذر التحقق من سجل الاستعادة؛ كل عمليات الكتابة مرفوضة بأمان.",
  "wb.flash.needPackage": "جهّز حزمة Firmware واختر Target قبل الكتابة.",
  "wb.flash.gatesIncomplete":
    "لم تكتمل بوابات Target والاستعادة والطاقة والهوائي.",
  "wb.flash.downloadOnly":
    "تم بدء تنزيل {file}. لم تُكتب أي بيانات على الجهاز.",
  "wb.flash.wifiHandoff":
    "تم تنزيل ملف OTA وفتح 10.0.0.1. اختر الملف المنزّل داخل صفحة الجهاز.",
  "wb.flash.gateChangedBeforePort":
    "تغيرت حالة تنظيف منفذ الجهاز؛ أُوقفت الكتابة قبل فتح منفذ جديد.",
  "wb.flash.platformUnsupported": "منصة Target غير مدعومة داخل التطبيق.",
  "wb.flash.dfuPlatformMismatch": "STM32 DFU لا يطابق منصة Target المختار.",
  "wb.flash.stm32MissingFirmware": "حزمة STM32 لا تحتوي firmware.bin.",
  "wb.flash.stm32CleanupUnproven":
    "اكتملت كتابة STM32 لكن تعذر إثبات تحرير واجهة USB وإغلاقها",
  "wb.flash.stm32CloseUnproven":
    "تعذر تأكيد إغلاق منفذ STM32 بعد الكتابة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
  "wb.flash.espCleanupUnproven":
    "اكتملت كتابة ESP لكن تعذر إثبات إغلاق منفذها التسلسلي",
  "wb.flash.espCloseUnproven":
    "تعذر تأكيد إغلاق منفذ ESP بعد الكتابة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
  "wb.flash.complete": "اكتمل التفليش وعاد الجهاز بالإصدار/Commit المتوقع.",
  "wb.flash.writeCloseUnproven":
    "تعذر إثبات إغلاق منفذ الكتابة بعد توقف التفليش",
  "wb.flash.stopped": "توقف التفليش وتحتاج العملية إلى الاستعادة: {detail}",
  "wb.flash.reloadFirst": "أعد تحميل الصفحة قبل فتح أي منفذ آخر.",

  "wb.recovery.journalLoading":
    "انتظر اكتمال فحص سجل الاستعادة قبل اختيار الحزمة.",
  "wb.recovery.journalUnreadable":
    "لا يمكن تشغيل الاستعادة دون سجل استعادة موثوق ومقروء.",
  "wb.recovery.needTarget": "اختر Target المطابق قبل تشغيل الاستعادة.",
  "wb.recovery.needDirectPath":
    "الاستعادة تتطلب مسار كتابة مباشرًا: UART أو Passthrough أو STM32 DFU.",
  "wb.recovery.needTargetKey":
    "أكّد مفتاح Target قبل تشغيل الاستعادة؛ منفذ الاستعادة اختيار جديد ولا يرث هوية CRSF السابقة.",
  "wb.recovery.needPower": "أكّد ثبات الطاقة قبل تشغيل الاستعادة.",
  "wb.recovery.needAntenna":
    "أكّد تثبيت هوائي جهاز الإرسال قبل تشغيل الاستعادة.",
  "wb.recovery.validating": "جارٍ فحص حزمة الاستعادة وSHA-256 لكل قطاع…",
  "wb.recovery.packageMismatch":
    "الحزمة المختارة لا تطابق بصمة جلسة الاستعادة المعلقة.",
  "wb.recovery.gateChangedBeforePort":
    "تغيرت حالة تنظيف منفذ الجهاز؛ أُوقفت الاستعادة قبل فتح منفذ جديد.",
  "wb.recovery.missingFirmware": "حزمة الاستعادة لا تحتوي firmware.bin.",
  "wb.recovery.stm32CleanupUnproven":
    "اكتملت استعادة STM32 لكن تعذر إثبات تحرير واجهة USB وإغلاقها",
  "wb.recovery.stm32CloseUnproven":
    "تعذر تأكيد إغلاق منفذ STM32 بعد الاستعادة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
  "wb.recovery.closeAfterCancel":
    "تعذر تأكيد إغلاق المنفذ الذي اختير بعد إلغاء الاستعادة",
  "wb.recovery.gateChangedDuringPort":
    "تغيرت حالة تنظيف منفذ الجهاز أثناء اختيار منفذ الاستعادة؛ أُوقفت الكتابة.",
  "wb.recovery.espCleanupUnproven":
    "اكتملت استعادة ESP لكن تعذر إثبات إغلاق منفذها التسلسلي",
  "wb.recovery.espCloseUnproven":
    "تعذر تأكيد إغلاق منفذ ESP بعد الاستعادة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
  "wb.recovery.platformUnsupported": "منصة الاستعادة غير مدعومة.",
  "wb.recovery.complete":
    "اكتملت الاستعادة وعاد الجهاز بالإصدار/Commit المتوقع.",
  "wb.recovery.writeCloseUnproven":
    "تعذر إثبات إغلاق منفذ الكتابة بعد توقف الاستعادة",
  "wb.recovery.incomplete":
    "اكتملت كتابة الاستعادة لكن تعذّر إثبات عودة الجهاز، فبقيت العملية غير مكتملة: {detail}",
  "wb.recovery.stopped": "توقفت الاستعادة: {detail}",
  "wb.recovery.savedConfirmed":
    "سُجل تأكيدك اليدوي بأن حزمة الاستعادة محفوظة؛ احتفظ بها حتى اكتمال التحقق بعد الإقلاع.",

  // --- per-operation readiness --------------------------------------------
  "wb.need.identity": "وصّل الجهاز ودع التطبيق يقرأ هويته أولًا.",
  "wb.need.identityForUart":
    "الكتابة المباشرة عبر UART تحتاج هوية جهاز حيّة؛ وصّل الجهاز أولًا.",
  "wb.need.recoveryJournal":
    "تعذّرت قراءة سجل الاستعادة. أعد تحميل الصفحة ليتم التحقق منه.",
  "wb.need.targetPack":
    "الهدف {target} أحدث من حزمة الأهداف المعتمدة {pack} (ExpressLRS/targets {targetsSha})، وتخطيط عتاده {layout} غير موجود فيها. التحزيم يقرأ بايتات التخطيط من الحزمة المجمّدة لا من المرآة الحيّة، حتى تستعيد حزمة الاستعادة الصورة نفسها التي حفظتها. الهدف يبقى قابلًا للاختيار، ويحتاج الأمر إلى حزمة معتمدة جديدة للكتابة إليه.",
  "wb.need.clearCheckpoint":
    "تركت عملية سابقة نقطة استعادة مفتوحة. أكمل تلك الاستعادة أو امسحها أولًا.",
  "wb.need.portCleanup":
    "لم يثبت إغلاق المنفذ السابق. افصل الجهاز بأمان وأعد تحميل الصفحة.",
  "wb.need.idle": "هناك عملية جارية. انتظر انتهاءها أو ألغِها.",
  "wb.need.target": "اختر Target الرسمي لهذا الجهاز أولًا.",
  "wb.need.writableSetting": "اختر إعدادًا قابلًا للكتابة من القائمة أولًا.",
  "wb.need.settingsBackup":
    "أنشئ نسخة احتياطية للإعدادات أولًا حتى يوجد ما تستعيده.",
  "wb.need.bindingAcknowledgement":
    "أكّد فهمك أن الربط يغيّر الرابط، ثم أعد المحاولة.",
  "wb.need.preparedPackage": "ابنِ حزمة Firmware أولًا.",
  "wb.need.recoveryDownload":
    "نزّل أرشيف الاستعادة أولًا حتى يمكن إرجاع الجهاز.",
  "wb.need.powerAcknowledgement":
    "أكّد أن الجهاز على طاقة ثابتة لن تنقطع أثناء الكتابة.",
  "wb.need.antennaAcknowledgement": "أكّد تركيب هوائي المرسل قبل أن يبث.",
  "wb.need.targetConfirmation":
    "اكتب اسم Target للتأكيد، لأن هوية الجهاز لا تحدده بدقة.",
  "wb.need.recoveryPackage":
    "اختر حزمة الاستعادة المراد كتابتها، أو استأنف نقطة الاستعادة المفتوحة.",
  "wb.need.durableRecovery":
    "احفظ حزمة الاستعادة في مكان دائم ودعها تُتحقَّق أولًا. النسخة داخل التطبيق تُمحى إذا أُزيل التطبيق، وهي اللحظة نفسها التي تحتاجها فيها.",
  "wb.need.importedIdentity":
    "راجع هوية الجهاز المستخرجة من الملف وأكّدها بجانب هذا الزر. حزمة محفوظة من جهاز آخر بنفس الموديل تنجح في كل الفحوص التلقائية.",
  "wb.need.durableRecoveryStale":
    "النسخة المتحقَّقة تتبع حزمة مختلفة. احفظ هذه الحزمة في مكان دائم من جديد.",

  // --- تصدير واستيراد الاستعادة الدائمة ----------------------------------
  "wb.durable.exporting": "جارٍ حفظ حزمة الاستعادة والتحقق منها…",
  "wb.durable.verified":
    "تم التحقق من حزمة الاستعادة على مكان دائم: {location} · SHA-256 {digest}",
  "wb.durable.importing": "جارٍ قراءة حزمة الاستعادة…",
  "wb.durable.imported":
    "تم استيراد حزمة الاستعادة والتحقق منها من {location}. يمكن تشغيل الاستعادة دون أي بيانات سابقة للتطبيق.",
  "wb.durable.NO_DURABLE_TARGET":
    "لا توفّر هذه المنصة مكانًا يستطيع التطبيق الكتابة فيه ثم إعادة قراءته، لذا لا يمكن إثبات وجود نسخة استعادة دائمة. تبقى كتابة Firmware محجوبة، وكل شيء آخر متاح.",
  "wb.durable.CANCELLED": "تم إلغاء حفظ حزمة الاستعادة.",
  "wb.durable.WRITE_FAILED": "لم يمكن كتابة حزمة الاستعادة في المكان المختار.",
  "wb.durable.INSUFFICIENT_STORAGE":
    "لا توجد مساحة كافية في المكان المختار لحزمة الاستعادة.",
  "wb.durable.REOPEN_FAILED":
    "كُتبت حزمة الاستعادة لكن لم يمكن إعادة فتحها، لذا بقاؤها غير مُثبت.",
  "wb.durable.TRUNCATED": "حزمة الاستعادة المحفوظة أقصر من التي كُتبت.",
  "wb.durable.HASH_MISMATCH":
    "حزمة الاستعادة المحفوظة لا تطابق البايتات التي كُتبت.",
  "wb.durable.PACKAGE_INVALID":
    "هذا الملف ليس حزمة استعادة يستطيع هذا الإصدار الاستعادة منها.",
  "wb.durable.picking": "اختر ملف الاستعادة المحفوظ…",
  "wb.durable.picked":
    "هذا الملف محفوظ من {product} بتاريخ {created}. أدخل عبارة مرور الاستعادة لفتحه.",
  "wb.durable.needPicked": "اختر ملف استعادة محفوظًا أولًا.",
  "wb.durable.AUTHENTICATION_FAILED":
    "عبارة مرور الاستعادة خطأ، أو أن الملف تغيّر بعد حفظه. لم يُقرأ منه أي شيء.",
  "wb.durable.NOT_A_RECOVERY_FILE":
    "هذا الملف ليس أحد ملفات الاستعادة المشفّرة الخاصة بهذا التطبيق.",
  "wb.durable.PASSPHRASE_UNUSABLE":
    "أدخل عبارة مرور للاستعادة من ٨ محارف على الأقل. لا تُحفظ أبدًا، فاكتبها في مكان آمن: بدونها لا يمكن فتح الملف المحفوظ مرة أخرى.",

  // --- Advanced Mode interface --------------------------------------------
  "wb.ui.kicker": "ELRS السهل · Hardware Lab",
  "wb.ui.title": "إعداد وتحديث ExpressLRS",
  "wb.ui.subtitle":
    "مصدر رسمي، تعريف CRSF، إعدادات حقيقية، استعادة إلزامية، ونجاح مشروط بعودة الجهاز المتوقع.",
  "wb.ui.statusLabel": "الحالة",
  "wb.ui.cancelOperation": "إلغاء العملية",
  "wb.ui.pendingRecovery": "استعادة معلّقة ·",
  "wb.ui.recoveryPassphrase": "عبارة مرور الاستعادة",
  "wb.ui.recoveryPassphraseHint":
    "الملف المحفوظ مشفّر بهذه العبارة. لا تُحفظ ولا تُرسل إلى أي مكان — اكتبها، فلا يمكن استرجاعها ولا يمكن فتح الملف بدونها.",
  "wb.ui.recoveryPassphraseWhy":
    "السبب: حزمة الاستعادة تحتوي على Firmware المُهيَّأ، وتلك الصورة تحمل اسم شبكة الواي فاي وكلمة سرها، ومعرّف الربط (UID) المشتق من عبارة الربط. وتُكتب في مكان تستطيع تطبيقات أخرى على الهاتف قراءته.",
  "wb.ui.pickRecoveryFile": "اختر ملف استعادة محفوظًا",
  "wb.ui.unlockRecoveryFile": "افتح ملف الاستعادة",
  "wb.ui.importedIdentityHeading": "المُستخرَج من الملف",
  "wb.ui.importedIdentityConfirm":
    "هذا هو الجهاز الموجود أمامي، وأريد استعادته إلى هذه الصورة",
  "wb.ui.confirmTargetForRecovery": "تأكيد Target للاستعادة",
  "wb.ui.typeExactly": "اكتب حرفيًا:",
  "wb.ui.powerStableRecovery": "ثبات الطاقة أثناء الاستعادة",
  "wb.ui.antennaFittedRecovery": "هوائي جهاز الإرسال مثبت أثناء الاستعادة",
  "wb.ui.chooseRecoveryPackage": "اختيار حزمة الاستعادة",
  "wb.ui.journalChecking":
    "جارٍ فحص سجل الاستعادة؛ عمليات الكتابة مقفلة مؤقتًا.",
  "wb.ui.journalUnreadable":
    "تعذر التحقق من سجل الاستعادة؛ عمليات التفليش والاستعادة مقفلة بأمان.",
  "wb.ui.catalogHeading": "الإصدار وTarget",
  "wb.ui.catalogSubtitle":
    "الإصدارات وTargets وطرق التحديث تأتي من مصادر ExpressLRS الرسمية.",
  "wb.ui.release": "الإصدار",
  "wb.ui.chooseRelease": "اختر إصدارًا",
  "wb.ui.vendor": "الشركة",
  "wb.ui.bandFamily": "النطاق / العائلة",
  "wb.ui.regulatoryRegion": "المنطقة التنظيمية",
  "wb.ui.chooseRegion": "اختر المنطقة",
  "wb.ui.updateMethod": "طريقة التحديث",
  "wb.ui.platform": "المنصة",
  "wb.ui.officialTargetMethods": "طرق Target الرسمية",
  "wb.ui.deviceHeading": "تعريف الجهاز وإعداداته",
  "wb.ui.deviceSubtitle":
    "لا تُعرض هوية قبل Device Info صحيح وCRC صالح، ولا يتطلب ذلك تحميل الكتالوج.",
  "wb.ui.identifyOverCrsf": "تعريف الجهاز عبر CRSF",
  "wb.ui.closeSession": "إغلاق الجلسة",
  "wb.ui.usePortNote":
    "استخدم منفذ وحدة ELRS المباشر. منفذ Joystick أو منفذ الراديو العام لا يحقق بوابة CRSF.",
  "wb.ui.device": "الجهاز",
  "wb.ui.targetMatch": "مطابقة Target",
  "wb.ui.awaitingCatalog": "بانتظار الكتالوج",
  "wb.ui.targetAutoMatched": "Target المختار مطابق تلقائيًا لهوية CRSF.",
  "wb.ui.identityPinnedLoadLater":
    "هوية CRSF مثبتة. حمّل الكتالوج لاحقًا فقط لمطابقة Target وتجهيز Firmware.",
  "wb.ui.identityPinnedNeedsManual":
    "CRSF مثبت، لكن Target يحتاج اختيارًا وتأكيدًا يدويًا قبل التفليش. الإعدادات والربط يعتمدان على المعاملات التي أعلنها الجهاز نفسه.",
  "wb.ui.connectToReadSettings":
    "وصّل الجهاز وعرّفه لقراءة إعداداته الحقيقية؛ كل كتابة تُقرأ رجعيًا بعدها للتحقق من أنها ثبتت فعلًا.",
  "wb.ui.setting": "الإعداد",
  "wb.ui.value": "القيمة",
  "wb.ui.saveWithReadBack": "حفظ مع قراءة رجعية",
  "wb.ui.restoreSnapshot": "استعادة اللقطة",
  "wb.ui.runRealBinding": "تشغيل الربط الحقيقي",
  "wb.ui.bindingAcknowledgement":
    "الطرف الآخر جاهز للربط، والطاقة والهوائيات في حالة آمنة",
  "wb.ui.bindEvidenceLevel": "مستوى دليل الربط:",
  "wb.ui.optionsHeading": "خيارات Firmware",
  "wb.ui.optionsSubtitle":
    "العبارة وكلمة Wi-Fi تبقيان في الذاكرة حتى بناء الحزمة.",
  "wb.ui.bindPhrase": "عبارة الربط",
  "wb.ui.bindPhraseNote":
    "اكتب العبارة نفسها في جهاز الإرسال وجهاز الاستقبال. أي اختلاف بينهما يعني أن الرابط لن يقوم. الجهاز لا يعلن UID عبر CRSF، لذلك تطابق العبارة يثبته قيام رابط حي لا هذه الكتابة.",
  "wb.ui.bindPhraseInvalid":
    "عبارة الربط غير صالحة: تجاوز الطول، أو مسافات فقط، أو محرف خفي.",
  "wb.ui.wifiSsid": "اسم شبكة Wi-Fi",
  "wb.ui.wifiPassword": "كلمة مرور Wi-Fi",
  "wb.ui.wifiAutoOn": "تشغيل Wi-Fi تلقائيًا بعد (ثانية)",
  "wb.ui.uartInverted": "UART مقلوب",
  "wb.ui.unlockHigherPower": "فتح مستويات الطاقة الأعلى",
  "wb.ui.receiverInvertTx": "عكس خرج TX للمستقبل",
  "wb.ui.lockOnFirstConnection": "قفل أول اتصال",
  "wb.ui.packageHeading": "بناء الحزمة والتفليش",
  "wb.ui.packageSubtitle": "كل قطاع موثق بـSHA-256 وحزمة الاستعادة إلزامية.",
  "wb.ui.buildOfficialFirmware": "بناء Firmware الرسمي",
  "wb.ui.noPackageYet": "لم تُبنَ حزمة بعد.",
  "wb.ui.downloadFirmware": "تنزيل Firmware / OTA",
  "wb.ui.downloadRecovery": "تنزيل حزمة الاستعادة",
  "wb.ui.exportDurableRecovery": "احفظ حزمة الاستعادة في مكان دائم",
  "wb.ui.importDurableRecovery": "استورد حزمة استعادة محفوظة",
  "wb.ui.durableRecoveryLocation": "النسخة المتحقَّقة",
  "wb.ui.durableRecoveryPending": "لا توجد نسخة دائمة متحقَّقة بعد",
  "wb.ui.downloadLua": "تنزيل ملف Lua",
  "wb.ui.recoveryKeptConfirmed":
    "أكد المستخدم أن حزمة الاستعادة محفوظة خارج التطبيق.",
  "wb.ui.recoveryKeptCheckbox":
    "أؤكد أن ملف حزمة الاستعادة حُفظ ويمكنني الوصول إليه دون هذا التطبيق",
  "wb.ui.recoveryFirstNote":
    "الكتابة مقفلة حتى بدء التنزيل ثم تأكيدك اليدوي أن حزمة الاستعادة حُفظت.",
  "wb.ui.confirmTarget": "تأكيد Target",
  "wb.ui.powerStableFlash": "ثبات الطاقة أثناء التفليش",
  "wb.ui.antennaFitted": "هوائي جهاز الإرسال مثبت",
  "wb.ui.sourceOfficial": "المصدر: ExpressLRS الرسمي",
  "wb.ui.hardwareObservedNote":
    "لا يظهر HARDWARE_OBSERVED إلا بعد جلسة جهاز فعلية.",
  "wb.ui.noCrsfSession": "لا توجد جلسة CRSF",
  "wb.ui.crsfConnected": "CRSF متصل",
  "wb.ui.loadCatalog": "تحميل الكتالوج الرسمي",
  "wb.ui.loading": "جارٍ التحميل…",
  "wb.ui.deviceType": "نوع الجهاز",
  "wb.ui.deviceTx": "جهاز إرسال TX",
  "wb.ui.deviceRx": "جهاز استقبال RX",
  "wb.ui.experimentalSuffix": " · تجريبي",
  "wb.ui.downloadOpenWifi": "تنزيل وفتح صفحة Wi-Fi",
  "wb.ui.downloadPackage": "تنزيل الحزمة",
  "wb.ui.startStm32Dfu": "بدء STM32 DFU",
  "wb.ui.startRealFlash": "بدء التفليش الحقيقي",

  "wb.ui.recoveryPickSameTarget":
    "اختر نفس Target وطريقة الاستعادة ثم حزمة الاستعادة المطابقة.",
  "wb.ui.flashNeeds": "التفليش ينتظر:",
} satisfies Record<keyof typeof workbenchEn, string>;
