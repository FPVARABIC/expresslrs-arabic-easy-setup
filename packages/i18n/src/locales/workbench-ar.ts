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
  "wb.catalog.progressIndex": "فهرس الإصدارات",
  "wb.catalog.progressTargets": "كتالوج Targets",
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
} satisfies Record<keyof typeof workbenchEn, string>;
