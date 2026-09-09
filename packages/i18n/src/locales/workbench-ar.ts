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

  "workbench.options.rxAsTx": "تشغيل هذا المستقبل كمرسل (AirPort)",
  "workbench.rxAsTx.NO_TARGET_SELECTED":
    "اختر Target رسميًا أولًا؛ إمكانية تشغيله كمرسل تتبع الجهاز نفسه.",
  "workbench.rxAsTx.TARGET_IS_TRANSMITTER":
    "{target} جهاز إرسال، فلا يوجد مستقبل لتحويله.",
  "workbench.rxAsTx.PLATFORM_HAS_NO_AIRPORT_FIELD":
    "UNSUPPORTED_BY_TARGET: يعمل {target} على منصة {platform}، وكتلة إعداداته المحزومة تحمل ثلاث رايات للمستقبل بلا حقل AirPort، فلا يمكن كتابة الخيار إليه.",
  "workbench.rxAsTx.PLATFORM_UNKNOWN":
    "UNSUPPORTED_BY_TARGET: هذا التطبيق لا يستطيع إعداد منصة {platform} التي يعلنها {target}.",
  "workbench.rxAsTx.RELEASE_TOO_OLD":
    "UNSUPPORTED_BY_TARGET: إصدار ExpressLRS المختار أقدم من AirPort. اختر 3.0.0 أو أحدث.",

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
} satisfies Record<keyof typeof workbenchEn, string>;
