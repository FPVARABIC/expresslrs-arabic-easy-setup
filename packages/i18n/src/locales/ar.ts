import type { MessageKey } from "./en";

export const ar = {
  "app.name": "إعداد ExpressLRS بسهولة",
  "app.independent":
    "متوافق مع ExpressLRS — مشروع مجتمعي مستقل، غير تابع أو معتمد من ExpressLRS LLC",
  "navigation.skip": "انتقل إلى المحتوى",
  "language.arabic": "العربية",
  "language.english": "English",
  "language.switch": "تغيير اللغة",
  "mode.easy": "الوضع السهل",
  "mode.advanced": "الوضع المتقدم",
  "mode.advancedHint": "المحاكاة وقراءة الجهاز والتفاصيل التقنية",
  "real.progress.heading": "مراحل القراءة",
  "real.progress.preparing": "نجهّز طلبًا للقراءة فقط",
  "real.progress.discovering": "نحاول الوصول إلى عنوان الجهاز المختار",
  "real.progress.identifying": "نقرأ معلومات الهوية التي أبلغ عنها الجهاز",
  "real.progress.verifying": "نتحقق من الحقول الآمنة ونستبعد البيانات الحساسة",
  "real.progress.success": "اكتملت آخر قراءة",
  "real.progress.failed": "توقفت القراءة قبل أن تكتمل",
  "real.progress.cancelled": "أُلغيت القراءة",
  "real.support.copyAction": "نسخ تفاصيل الدعم الآمنة",
  "real.support.copying": "جارٍ نسخ تفاصيل الدعم الآمنة…",
  "real.support.copied": "نُسخت تفاصيل الدعم الآمنة",
  "real.support.copyFailed":
    "تعذر نسخ تفاصيل الدعم. تحقق من إذن الحافظة ثم حاول مرة أخرى.",
  "real.support.privacy":
    "لا تتضمن التفاصيل المنسوخة معرّف الربط (UID)، أو اسم شبكة Wi-Fi (SSID)، أو بيانات الدخول، أو كلمات المرور، أو الاستجابة الخام، أو أي معرّف ثابت للجهاز.",
  "real.reconnect.consistent":
    "بعد استعادة الاتصال، تطابقت قيم Target وإصدار Firmware ونوع TX/RX المبلّغ عنها مع أول قراءة ناجحة.",
  "real.reconnect.changed":
    "بعد استعادة الاتصال، اختلفت قيمة واحدة أو أكثر من Target وإصدار Firmware ونوع TX/RX المبلّغ عنها عن أول قراءة ناجحة. راجعها قبل المتابعة.",
  "real.reconnect.required":
    "أعد الجهاز إلى وضع Wi-Fi وتأكد من الاتصال بالشبكة الصحيحة، ثم أعد القراءة.",
  "error.DEVICE_NOT_FOUND": "تعذر العثور على الجهاز.",
  "error.DEVICE_BUSY": "توجد عملية أخرى تستخدم هذا الجهاز.",
  "error.PERMISSION_DENIED": "تم رفض إذن الوصول إلى الجهاز.",
  "error.CONNECTION_LOST":
    "تعذر الوصول إلى الجهاز، أو توقفت القراءة قبل أن تكتمل.",
  "error.IDENTITY_UNKNOWN": "تعذر تأكيد هوية الجهاز.",
  "error.IDENTITY_AMBIGUOUS":
    "تطابق أكثر من Target مع الأدلة المتاحة، لذلك توقفت العملية.",
  "error.TARGET_UNKNOWN": "تعذر تحديد Target الخاص بالجهاز.",
  "error.TARGET_MISMATCH": "هذا الملف أو الجهاز لا يطابق Target المتوقع.",
  "error.VERSION_INCOMPATIBLE":
    "إصدار Firmware هذا غير متوافق مع Target المؤكد.",
  "error.PROVIDER_UNSUPPORTED": "طريقة الاتصال المطلوبة غير مدعومة.",
  "error.ARTIFACT_INVALID": "لم يجتز ملف Firmware التحقق من السلامة.",
  "error.VERIFICATION_FAILED": "انتهت العملية، لكن تعذر التحقق من نتيجتها.",
  "error.INVALID_STATE_TRANSITION": "دخلت العملية في حالة داخلية غير صالحة.",
  "error.RECOVERY_REQUIRED": "يحتاج الجهاز إلى مسار استعادة قبل المتابعة.",
  "error.INTERNAL_ERROR": "حدث خطأ داخلي غير متوقع.",

  "easy.title": "إعداد ExpressLRS",
  "easy.intro":
    "اختر العملية التي تريدها. سيرشدك التطبيق خطوة بخطوة: توصيل الجهاز، ثم التعرف عليه، ثم فحص ما يدعمه، ثم التنفيذ، ثم التحقق من النتيجة.",
  "easy.roleLabel": "نوع الجهاز المتصل",
  "easy.roleTx": "جهاز إرسال (TX)",
  "easy.roleRx": "جهاز استقبال (RX)",
  "easy.connect": "تعرّف على جهازي",
  "easy.connecting": "جارٍ قراءة الجهاز…",
  "easy.fieldProduct": "الموديل",
  "easy.fieldFirmware": "إصدار Firmware",
  "easy.confidence": "درجة تأكيد الهوية",
  "easy.confidenceConfirmed": "مؤكدة من الجهاز نفسه",
  "easy.disconnect": "إغلاق الاتصال",
  "easy.noHardwareClaim":
    "لا شيء هنا دليل على أن جهازًا جرى ربطه أو إعداده أو تحديثه.",
  "easy.advancedCta": "افتح الوضع المتقدم",
  "easy.advancedHint":
    "منضدة تقنية: الكتالوج وTargets وتجهيز Firmware والتشخيص.",
  "easy.easyCta": "العودة إلى الوضع السهل",
  "easy.copyDetails": "انسخ التفاصيل التقنية",
  "easy.copied": "تم النسخ",
  "easy.copyFailed": "تعذر النسخ. حدّد النص يدويًا.",
  "easy.errorHeading": "تعذر التعرف على الجهاز",
  "easy.fail.CANCELLED": "ألغيت العملية قبل أن يجيب الجهاز.",
  "easy.fail.TIMED_OUT": "لم يجب الجهاز في الوقت المتاح.",
  "easy.fail.INVALID_PARAMETER_TABLE":
    "أجاب الجهاز ببيانات لا تستطيع هذه المعاينة الوثوق بها.",
  "easy.fail.CLEANUP_UNCONFIRMED":
    "تعذر إثبات إغلاق المنفذ السابق. أعد تحميل الصفحة قبل المحاولة مرة أخرى.",
  "easy.fail.CONNECT_FAILED": "تعذر فتح الجهاز.",
  "easy.fail.UNKNOWN": "تعذر التعرف على الجهاز، فلا يُدّعى عنه شيء.",
  "easy.op.binding": "ربط المرسل والمستقبل",
  "easy.op.bindingDescription":
    "أدخل الجهاز في وضع الربط ثم تأكّد من قيام الرابط في الطرف الآخر.",
  "easy.op.settings": "الإعدادات الأساسية",
  "easy.op.settingsDescription":
    "اقرأ القيم الحالية من الجهاز وغيّر واحدة منها بأمان.",
  "easy.op.firmware": "تحديث Firmware",
  "easy.op.firmwareDescription": "افحص الإصدار المثبّت وحدّثه إلى إصدار رسمي.",
  "easy.op.start": "ابدأ",
  "easy.op.back": "اختر عملية أخرى",
  "easy.step.connect": "وصّل الجهاز",
  "easy.step.identify": "تعرّف عليه",
  "easy.step.compatibility": "افحص ما يدعمه",
  "easy.step.execute": "نفّذ العملية",
  "easy.step.verify": "تحقّق من النتيجة",
  "easy.step.connectHint":
    "وصّل الجهاز عبر USB ثم اختر منفذه من نافذة المتصفح.",
  "easy.run.binding": "أدخل الجهاز في وضع الربط",
  "easy.run.settings": "طبّق التغيير",
  "easy.run.firmware": "ابدأ تحديث Firmware",
  "easy.run.busy": "جارٍ التنفيذ…",
  "easy.binding.sent":
    "قبل الجهاز أمر الربط. قرّب الطرف الآخر الآن وأكّد أدناه ما إذا قام الرابط فعلًا.",
  "easy.binding.confirmQuestion": "حالة الرابط في الطرف الآخر",
  "easy.binding.linked": "قام الرابط",
  "easy.binding.notLinked": "لم يقم الرابط بعد",
  "easy.settings.current": "القيمة الحالية على الجهاز",
  "easy.settings.choose": "الإعداد",
  "easy.settings.newValue": "القيمة الجديدة",
  "easy.settings.applied":
    "كُتب التغيير وأُعيدت قراءته من الجهاز بالقيمة نفسها.",
  "easy.settings.mismatch":
    "القيمة المقروءة رجعيًا لا تطابق المطلوبة، فلا يُعلن التغيير مطبَّقًا.",
  "easy.firmware.handoff":
    "جهازك معرّف وTarget معروف. الوضع المتقدم يحمل مسار Firmware كاملًا: الكتالوج الرسمي والتحقق من الحزمة وحزمة الاستعادة والكتابة والتحقق بعد إعادة الاتصال.",
  "easy.compat.noBindCommand":
    "لا يعلن هذا الجهاز أمر ربط عبر USB. اربطه من قائمة جهاز التحكم أو صفحة Wi-Fi الخاصة به ثم عد هنا للتحقق.",
  "easy.compat.noEssentialSettings":
    "لم يعلن هذا الجهاز إعدادات أساسية قابلة للكتابة عبر CRSF. الوضع المتقدم يعرض كل معامل أعلنه.",
  "easy.compat.needIdentity": "يجب تعريف الجهاز قبل تجهيز تحديث Firmware.",
  "easy.deny.NO_DEVICE_SESSION": "وصّل الجهاز أولًا.",
  "easy.deny.IDENTITY_UNCONFIRMED": "هوية الجهاز غير مؤكدة؛ أعد التعريف.",
  "easy.deny.PORT_CLEANUP_UNCONFIRMED":
    "إغلاق منفذ سابق غير مثبت؛ أعد تحميل الصفحة بعد الفصل بأمان.",
  "easy.deny.OPERATION_IN_PROGRESS": "هناك عملية جارية.",
  "easy.deny.RECOVERY_JOURNAL_UNREADABLE":
    "تعذّر قراءة سجل الاستعادة، فلا كتابة بلا طريق رجوع معروف.",
  "easy.deny.PENDING_RECOVERY_CHECKPOINT":
    "توجد عملية متوقفة تنتظر الاستعادة؛ أكملها أولًا.",
  "easy.deny.NO_PENDING_RECOVERY": "لا توجد عملية متوقفة لاستعادتها.",
  "easy.deny.TARGET_NOT_MATCHED": "اختر Target مطابقًا لهذا الجهاز.",
  "easy.deny.BAND_NOT_MATCHED": "النطاق لا يطابق هذا الجهاز.",
  "easy.deny.ARTIFACT_NOT_VERIFIED": "جهّز حزمة Firmware وتحقق منها أولًا.",
  "easy.deny.RECOVERY_NOT_AVAILABLE": "نزّل حزمة الاستعادة أولًا.",
  "easy.deny.BENCH_NOT_ACKNOWLEDGED":
    "أكّد ثبات الطاقة، وتركيب هوائي المرسل، قبل الكتابة.",
  "easy.deny.USER_CONFIRMATION_MISSING": "أكّد العملية قبل تنفيذها.",
  "easy.binding.observing":
    "قُبل أمر الربط. نراقب تلمترية الرابط من الجهاز — قرّب الطرف الآخر الآن.",
  "easy.binding.telemetry":
    "أبلغ الجهاز عن رابط RF حي (جودة الرابط {quality}%). هذا دليل آلي، لا مجرد إفادة.",
  "easy.binding.userConfirmed":
    "سُجِّل بتأكيدك أنت. لم يُبلغ الجهاز عن تلمترية رابط، فهذه مشاهدتك وليست دليلًا آليًا.",
  "easy.binding.commandOnly":
    "قُبل الأمر، لكن لم يُرصد رابط ولم يُبلَّغ عنه. لا يُسجَّل الربط ناجحًا.",
  "easy.binding.ready":
    "الطرف الآخر جاهز للربط، والطاقة والهوائيات في حالة آمنة",
  "easy.fw.bindPhrase": "عبارة الربط (اختيارية)",
  "easy.fw.bindPhraseHint":
    "اكتب العبارة نفسها في جهاز الإرسال وجهاز الاستقبال. أي اختلاف بينهما يعني أن الرابط لن يقوم.",
  "easy.fw.bindPhraseConfigured": "ستُضمَّن عبارة ربط داخل هذه الحزمة.",
  "easy.fw.bindPhraseUnverifiable":
    "الجهاز لا يعلن UID الخاص به عبر CRSF، لذلك تطابق العبارة يثبته قيام رابط حي، لا هذه الكتابة.",
  "easy.fw.bindPhrase.TOO_LONG":
    "العبارة أطول من 128 حرفًا، وهو ما لا تقبله عملية الاشتقاق.",
  "easy.fw.bindPhrase.BLANK":
    "العبارة مسافات فقط. اتركها فارغة لعدم ضبط عبارة، أو اكتب عبارة تستطيع كتابتها حرفيًا في الطرف الآخر.",
  "easy.fw.bindPhrase.CONTROL_CHARACTER":
    "العبارة تحتوي محرفًا خفيًا. أعد كتابتها نصًا عاديًا.",
  "easy.fw.loadCatalog": "جهّز مصدر التحديث الرسمي",
  "easy.fw.catalogReady":
    "تم تحميل {releases} إصدارًا قابلاً للبناء و{targets} Target رسميًا.",
  "easy.fw.release": "إصدار ExpressLRS",
  "easy.fw.target": "Target هذا الجهاز",
  "easy.fw.targetExact":
    "طوبق بـTarget رسمي واحد من الهوية التي أعلنها الجهاز.",
  "easy.fw.targetConfirm": "اكتب مفتاح Target حرفيًا لتأكيد أنه يخص هذا الجهاز",
  "easy.fw.region": "المنطقة التنظيمية",
  "easy.fw.method": "مسار التحديث",
  "easy.fw.build": "جهّز الحزمة الرسمية وتحقق منها",
  "easy.fw.prepared":
    "جُهّز {segments} قطاعًا مع SHA-256 لكل قطاع. نزّل حزمة الاستعادة قبل أي كتابة.",
  "easy.fw.downloadRecovery": "نزّل حزمة الاستعادة",
  "easy.fw.recoverySaved": "تحققت من حفظ حزمة الاستعادة على جهازي",
  "easy.fw.power": "الطاقة ثابتة ولن تنقطع أثناء الكتابة",
  "easy.fw.antenna": "هوائي جهاز الإرسال مركّب",
  "easy.fw.write": "اكتب Firmware إلى الجهاز",
  "easy.fw.writeBlocked":
    "تبقى الكتابة غير متاحة حتى تكتمل كل الشروط أعلاه، وكل شرط ناقص مذكور هناك.",
  "easy.fw.progress": "{stage}: {written} من {total} بايت",
  "easy.fw.cancel": "أوقف الخطوة الجارية",
  "easy.fw.pending":
    "توجد عملية تحديث متوقفة تنتظر الاستعادة عند مرحلة {stage}. اختر حزمة الاستعادة المطابقة لإكمالها.",
  "easy.fw.recoverFile": "اختر حزمة الاستعادة",
  "easy.fw.recoveryNote":
    "الاستعادة تفتح المنفذ من جديد وتكتب الحزمة المحفوظة قبل هذا التحديث، ثم تقرأ الهوية بعدها.",
  "easy.fw.verified": "عاد الجهاز وأعلن Target والإصدار المتوقعين بعد الإقلاع.",
} satisfies Partial<Record<MessageKey, string>>;
