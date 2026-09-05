export const PHYSICAL_ACCEPTANCE_SCHEMA_VERSION = 1 as const;

export type PhysicalAcceptanceStepStatus =
  "NOT_RUN" | "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";

export type PhysicalAcceptanceRisk =
  "READ_ONLY" | "REVERSIBLE_WRITE" | "RF" | "FIRMWARE_WRITE" | "RECOVERY_DRILL";

export type PhysicalAcceptancePhase =
  "PREFLIGHT" | "IDENTITY" | "SETTINGS" | "BINDING" | "FIRMWARE" | "RECOVERY";

export type PhysicalAcceptanceStepId =
  | "secure_browser"
  | "bench_baseline"
  | "tx_crsf_identity"
  | "rx_crsf_identity"
  | "wrong_port_rejected"
  | "wrong_role_rejected"
  | "reconnect_identity_stable"
  | "settings_backup_created"
  | "reversible_setting_write"
  | "settings_restored"
  | "tx_bind_command_ack"
  | "rx_bind_command_sent"
  | "rf_link_observed"
  | "firmware_package_verified"
  | "bootloader_entry"
  | "normal_flash_verified"
  | "post_flash_reconnect"
  | "recovery_package_restore"
  | "interrupted_flash_recovery";

export interface PhysicalAcceptanceStepDefinition {
  readonly id: PhysicalAcceptanceStepId;
  readonly order: number;
  readonly phase: PhysicalAcceptancePhase;
  readonly title: string;
  readonly instructions: string;
  readonly expectedEvidence: string;
  readonly risk: PhysicalAcceptanceRisk;
  readonly optional: boolean;
  readonly destructive: boolean;
}

export interface PhysicalAcceptanceStepResult {
  readonly status: PhysicalAcceptanceStepStatus;
  readonly observedAt: string | null;
  readonly evidence: string;
  readonly notes: string;
}

export interface PhysicalAcceptanceContextSnapshot {
  readonly capturedAt: string;
  readonly secureContext: boolean;
  readonly webSerialSupported: boolean;
  readonly connectionState: "DISCONNECTED" | "CRSF_CONNECTED";
  readonly selectedRole: "tx" | "rx";
  readonly observedRole: "tx" | "rx" | null;
  readonly productName: string | null;
  readonly firmwareVersion: string | null;
  readonly hardwareVersion: number | null;
  readonly parameterCount: number | null;
  readonly usbVendorId: number | null;
  readonly usbProductId: number | null;
  readonly targetId: string | null;
  readonly targetKey: string | null;
  readonly targetName: string | null;
  readonly targetPlatform: string | null;
  readonly targetConfidence: string | null;
  readonly releaseLabel: string | null;
  readonly releaseRevision: string | null;
  readonly flashMethod: string | null;
  readonly settingsBackupAvailable: boolean;
  readonly writableParameterCount: number;
  readonly bindCommandAvailable: boolean;
  readonly bootloaderCommandAvailable: boolean;
  readonly packageFileName: string | null;
  readonly recoveryFileName: string | null;
  readonly packageSegmentCount: number;
  readonly packageSegmentHashes: readonly string[];
  readonly recoveryDownloaded: boolean;
  readonly checkpointStage: string | null;
  readonly flashStage: string | null;
  readonly statusMessage: string;
}

export interface PhysicalAcceptanceEvent {
  readonly at: string;
  readonly type:
    | "SESSION_CREATED"
    | "CONTEXT_CAPTURED"
    | "STEP_UPDATED"
    | "SESSION_IMPORTED";
  readonly stepId: PhysicalAcceptanceStepId | null;
  readonly summary: string;
}

export interface PhysicalAcceptanceSession {
  readonly schemaVersion: typeof PHYSICAL_ACCEPTANCE_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly operatorAlias: string;
  readonly benchLabel: string;
  readonly candidateSha: string;
  readonly appUrl: string;
  readonly userAgent: string;
  readonly language: string;
  readonly overallNotes: string;
  readonly lastContext: PhysicalAcceptanceContextSnapshot | null;
  readonly results: Readonly<
    Record<PhysicalAcceptanceStepId, PhysicalAcceptanceStepResult>
  >;
  readonly events: readonly PhysicalAcceptanceEvent[];
}

export interface PhysicalAcceptanceRuntime {
  readonly appUrl: string;
  readonly userAgent: string;
  readonly language: string;
  readonly candidateSha: string;
}

export interface PhysicalAcceptanceSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly notRun: number;
  readonly completed: number;
  readonly completionPercent: number;
}

export interface PhysicalAcceptanceSuggestion {
  readonly status: PhysicalAcceptanceStepStatus | null;
  readonly evidence: string;
  readonly reason: string;
}

export const PHYSICAL_ACCEPTANCE_STEPS: readonly PhysicalAcceptanceStepDefinition[] =
  Object.freeze([
    {
      id: "secure_browser",
      order: 1,
      phase: "PREFLIGHT",
      title: "المتصفح والسياق الآمن",
      instructions:
        "افتح النسخة المراجعة عبر HTTPS في Chrome أو Edge وتأكد من ظهور Web Serial.",
      expectedEvidence:
        "السياق آمن، Web Serial متاح، ورابط التطبيق وCandidate SHA مسجلان.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "bench_baseline",
      order: 2,
      phase: "PREFLIGHT",
      title: "خط أساس منصة الاختبار",
      instructions:
        "سجل نوع TX/RX والكابل ومصدر الطاقة والهوائي وحالة المراوح قبل أي كتابة.",
      expectedEvidence:
        "اسم مختصر للمنصة، مصدر طاقة ثابت، هوائي TX مثبت، والمراوح منزوعة عند الحاجة.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "tx_crsf_identity",
      order: 3,
      phase: "IDENTITY",
      title: "تعريف TX عبر CRSF",
      instructions:
        "اختر TX وافتح المنفذ المباشر وانتظر Device Info صحيحًا وCRC صالحًا.",
      expectedEvidence:
        "اسم المنتج، إصدار Firmware، إصدار Hardware، VID/PID إن توفرا، وعدد Parameters.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "rx_crsf_identity",
      order: 4,
      phase: "IDENTITY",
      title: "تعريف RX عبر CRSF",
      instructions:
        "اختر RX وافتح المنفذ المباشر وانتظر Device Info صحيحًا وCRC صالحًا.",
      expectedEvidence:
        "اسم المنتج، إصدار Firmware، إصدار Hardware، VID/PID إن توفرا، وعدد Parameters.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "wrong_port_rejected",
      order: 5,
      phase: "IDENTITY",
      title: "رفض المنفذ الخاطئ",
      instructions:
        "اختر عمدًا منفذ Joystick أو منفذًا لا يرسل CRSF وتأكد من عدم إعلان اتصال ناجح.",
      expectedEvidence: "فشل منظم بلا هوية جهاز وبلا بقاء المنفذ محجوزًا.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "wrong_role_rejected",
      order: 6,
      phase: "IDENTITY",
      title: "رفض دور TX/RX الخاطئ",
      instructions: "اختر RX لجهاز TX أو العكس وتأكد من توقف الجلسة مغلقة.",
      expectedEvidence:
        "رسالة عدم تطابق الدور، عدم عرض هوية مقبولة، وإغلاق المنفذ.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "reconnect_identity_stable",
      order: 7,
      phase: "IDENTITY",
      title: "ثبات الهوية بعد الفصل وإعادة الاتصال",
      instructions: "افصل الجهاز ثم أعد توصيله واقرأ هويته مرة ثانية.",
      expectedEvidence:
        "عودة الدور والمنتج وإصدار Hardware والهوية المتوقعة بلا تبديل Target.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "settings_backup_created",
      order: 8,
      phase: "SETTINGS",
      title: "إنشاء نسخة إعدادات",
      instructions:
        "بعد تعريف الجهاز، أنشئ لقطة الإعدادات المرئية القابلة للاستعادة.",
      expectedEvidence:
        "وجود Backup مرتبط بهوية الجهاز ولا يحتوي الحقول المخفية أو الحساسة.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "reversible_setting_write",
      order: 9,
      phase: "SETTINGS",
      title: "كتابة إعداد قابل للعكس",
      instructions:
        "غيّر إعدادًا آمنًا واحدًا ضمن حدوده ثم اطلب القراءة الرجعية.",
      expectedEvidence:
        "القيمة المقروءة بعد الكتابة تطابق القيمة المطلوبة حرفيًا.",
      risk: "REVERSIBLE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "settings_restored",
      order: 10,
      phase: "SETTINGS",
      title: "استعادة الإعداد الأصلي",
      instructions: "استعد لقطة الإعدادات وتحقق من كل قيمة بالقراءة الرجعية.",
      expectedEvidence: "عودة القيمة الأصلية وعدم وجود فشل أو Parameter ناقص.",
      risk: "REVERSIBLE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "tx_bind_command_ack",
      order: 11,
      phase: "BINDING",
      title: "إقرار أمر Bind على TX",
      instructions:
        "نفذ Command Parameter الحقيقي للربط على TX وانتظر إقرار الجهاز.",
      expectedEvidence: "إقرار أمر CRSF فقط؛ لا يسجل نجاح RF في هذه الخطوة.",
      risk: "RF",
      optional: false,
      destructive: false,
    },
    {
      id: "rx_bind_command_sent",
      order: 12,
      phase: "BINDING",
      title: "إرسال أمر Bind إلى RX",
      instructions:
        "ضع RX في حالة جاهزة وأرسل أمر الربط الحقيقي أو Legacy fallback الموثق.",
      expectedEvidence:
        "تسجيل نوع الأمر واستجابة RX إن توفرت، دون افتراض نجاح الرابط.",
      risk: "RF",
      optional: false,
      destructive: false,
    },
    {
      id: "rf_link_observed",
      order: 13,
      phase: "BINDING",
      title: "مشاهدة رابط RF من الطرفين",
      instructions:
        "تحقق من مؤشرات TX وRX ومن عودة Telemetry أو دليل الرابط المستقل.",
      expectedEvidence: "دليل منفصل من الطرفين؛ إقرار أمر Bind وحده غير كافٍ.",
      risk: "RF",
      optional: false,
      destructive: false,
    },
    {
      id: "firmware_package_verified",
      order: 14,
      phase: "FIRMWARE",
      title: "بناء Firmware وحزمة الاستعادة",
      instructions:
        "اختر Release وTarget والمنطقة، ابن الحزمة، وتحقق من SHA-256 ثم نزّل Recovery.",
      expectedEvidence:
        "Target وRelease وطريقة الرفع وأسماء القطاعات وعناوينها وبصماتها مسجلة.",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "bootloader_entry",
      order: 15,
      phase: "FIRMWARE",
      title: "الدخول إلى Bootloader",
      instructions:
        "نفذ طريقة Bootloader المطابقة للـTarget وتأكد من تعرف الأداة على المنصة الصحيحة.",
      expectedEvidence:
        "اسم الشريحة أو Target أو واجهة DFU المطابقة قبل المسح.",
      risk: "FIRMWARE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "normal_flash_verified",
      order: 16,
      phase: "FIRMWARE",
      title: "تفليش طبيعي والتحقق من البايتات",
      instructions: "نفذ أول Flash طبيعي بطاقة ثابتة ومن دون قطع متعمد.",
      expectedEvidence:
        "اكتمال المسح والكتابة وRead-back أو تحقق الأداة من القطاعات.",
      risk: "FIRMWARE_WRITE",
      optional: false,
      destructive: true,
    },
    {
      id: "post_flash_reconnect",
      order: 17,
      phase: "FIRMWARE",
      title: "إعادة الإقلاع والتحقق من Target والإصدار",
      instructions:
        "أعد اختيار الجهاز بعد الإقلاع وتأكد من عودة نفس الهوية وRelease أو Commit المتوقع.",
      expectedEvidence:
        "Target verified، إصدار/Commit مطابق، والجلسة قابلة للاستخدام.",
      risk: "FIRMWARE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "recovery_package_restore",
      order: 18,
      phase: "RECOVERY",
      title: "استعادة عادية بحزمة Recovery",
      instructions:
        "على جهاز اختبار، نفذ استعادة الحزمة الموثقة ثم تحقق من العودة الكاملة.",
      expectedEvidence:
        "بصمة الحزمة مطابقة، الكتابة ناجحة، والهوية والإصدار عادا كما هو متوقع.",
      risk: "RECOVERY_DRILL",
      optional: false,
      destructive: true,
    },
    {
      id: "interrupted_flash_recovery",
      order: 19,
      phase: "RECOVERY",
      title: "استعادة بعد انقطاع متعمد",
      instructions:
        "اختبار اختياري أخير على جهاز احتياطي فقط: اقطع العملية في مرحلة WRITING ثم استعدها.",
      expectedEvidence:
        "ظهور RECOVERY_REQUIRED، استئناف آمن، ثم عودة Target والإصدار المتوقعين.",
      risk: "RECOVERY_DRILL",
      optional: true,
      destructive: true,
    },
  ] satisfies readonly PhysicalAcceptanceStepDefinition[]);

const STEP_IDS = new Set(PHYSICAL_ACCEPTANCE_STEPS.map((step) => step.id));
const STATUS_VALUES = new Set<PhysicalAcceptanceStepStatus>([
  "NOT_RUN",
  "PASS",
  "FAIL",
  "BLOCKED",
  "SKIPPED",
]);
const MAX_EVENTS = 200;
const MAX_IMPORT_BYTES = 1_000_000;

function iso(now: () => Date): string {
  return now().toISOString();
}

function randomSessionId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject !== undefined && "randomUUID" in cryptoObject) {
    return cryptoObject.randomUUID();
  }
  return `physical-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function sanitizeAcceptanceText(
  value: unknown,
  maximumLength = 4_000,
): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\r\n?/gu, "\n")
    .slice(0, maximumLength);
}

export function redactSensitiveAcceptanceText(value: unknown): string {
  return sanitizeAcceptanceText(value, 20_000)
    .replace(
      /\b(password|passphrase|wifi\s*password|ssid|binding\s*phrase|bind\s*phrase|uid|token|secret)\b\s*[:=]\s*([^\s,;]+)/giu,
      "$1=[REDACTED]",
    )
    .replace(
      /\b(password|passphrase|ssid|binding\s*phrase|bind\s*phrase|uid|token|secret)\b\s+([^\n]{1,120})/giu,
      "$1 [REDACTED]",
    );
}

function initialResult(): PhysicalAcceptanceStepResult {
  return Object.freeze({
    status: "NOT_RUN",
    observedAt: null,
    evidence: "",
    notes: "",
  });
}

function createInitialResults(): Record<
  PhysicalAcceptanceStepId,
  PhysicalAcceptanceStepResult
> {
  const results = {} as Record<
    PhysicalAcceptanceStepId,
    PhysicalAcceptanceStepResult
  >;
  for (const step of PHYSICAL_ACCEPTANCE_STEPS) {
    results[step.id] = initialResult();
  }
  return results;
}

function trimEvents(
  events: readonly PhysicalAcceptanceEvent[],
): readonly PhysicalAcceptanceEvent[] {
  return Object.freeze(events.slice(-MAX_EVENTS));
}

export function createPhysicalAcceptanceSession(input: {
  readonly runtime: PhysicalAcceptanceRuntime;
  readonly now?: () => Date;
  readonly sessionId?: string;
}): PhysicalAcceptanceSession {
  const now = input.now ?? (() => new Date());
  const timestamp = iso(now);
  const sessionId = sanitizeAcceptanceText(
    input.sessionId ?? randomSessionId(),
    120,
  );
  return Object.freeze({
    schemaVersion: PHYSICAL_ACCEPTANCE_SCHEMA_VERSION,
    sessionId,
    createdAt: timestamp,
    updatedAt: timestamp,
    operatorAlias: "",
    benchLabel: "",
    candidateSha: sanitizeAcceptanceText(input.runtime.candidateSha, 80),
    appUrl: sanitizeAcceptanceText(input.runtime.appUrl, 500),
    userAgent: sanitizeAcceptanceText(input.runtime.userAgent, 500),
    language: sanitizeAcceptanceText(input.runtime.language, 40),
    overallNotes: "",
    lastContext: null,
    results: Object.freeze(createInitialResults()),
    events: Object.freeze([
      Object.freeze({
        at: timestamp,
        type: "SESSION_CREATED",
        stepId: null,
        summary: "Physical acceptance session created",
      }),
    ]),
  });
}

export function updatePhysicalAcceptanceMetadata(
  session: PhysicalAcceptanceSession,
  patch: Readonly<{
    operatorAlias?: string;
    benchLabel?: string;
    overallNotes?: string;
  }>,
  now: () => Date = () => new Date(),
): PhysicalAcceptanceSession {
  return Object.freeze({
    ...session,
    operatorAlias:
      patch.operatorAlias === undefined
        ? session.operatorAlias
        : sanitizeAcceptanceText(patch.operatorAlias, 120),
    benchLabel:
      patch.benchLabel === undefined
        ? session.benchLabel
        : sanitizeAcceptanceText(patch.benchLabel, 160),
    overallNotes:
      patch.overallNotes === undefined
        ? session.overallNotes
        : sanitizeAcceptanceText(patch.overallNotes, 8_000),
    updatedAt: iso(now),
  });
}

export function capturePhysicalAcceptanceContext(
  session: PhysicalAcceptanceSession,
  context: PhysicalAcceptanceContextSnapshot,
  now: () => Date = () => new Date(),
): PhysicalAcceptanceSession {
  const timestamp = iso(now);
  const safeContext = sanitizeContext(context);
  return Object.freeze({
    ...session,
    updatedAt: timestamp,
    lastContext: safeContext,
    events: trimEvents([
      ...session.events,
      Object.freeze({
        at: timestamp,
        type: "CONTEXT_CAPTURED",
        stepId: null,
        summary: summarizeContext(safeContext),
      }),
    ]),
  });
}

export function updatePhysicalAcceptanceStep(
  session: PhysicalAcceptanceSession,
  stepId: PhysicalAcceptanceStepId,
  patch: Readonly<{
    status?: PhysicalAcceptanceStepStatus;
    evidence?: string;
    notes?: string;
  }>,
  now: () => Date = () => new Date(),
): PhysicalAcceptanceSession {
  if (!STEP_IDS.has(stepId)) {
    throw new RangeError(`Unknown physical acceptance step: ${stepId}`);
  }
  const current = session.results[stepId];
  const status = patch.status ?? current.status;
  if (!STATUS_VALUES.has(status)) {
    throw new RangeError(`Unsupported physical acceptance status: ${status}`);
  }
  const timestamp = iso(now);
  const result: PhysicalAcceptanceStepResult = Object.freeze({
    status,
    observedAt: status === "NOT_RUN" ? null : timestamp,
    evidence:
      patch.evidence === undefined
        ? current.evidence
        : sanitizeAcceptanceText(patch.evidence, 8_000),
    notes:
      patch.notes === undefined
        ? current.notes
        : sanitizeAcceptanceText(patch.notes, 8_000),
  });
  return Object.freeze({
    ...session,
    updatedAt: timestamp,
    results: Object.freeze({ ...session.results, [stepId]: result }),
    events: trimEvents([
      ...session.events,
      Object.freeze({
        at: timestamp,
        type: "STEP_UPDATED",
        stepId,
        summary: `${stepId}: ${status}`,
      }),
    ]),
  });
}

export function summarizePhysicalAcceptance(
  session: PhysicalAcceptanceSession,
): PhysicalAcceptanceSummary {
  const values = PHYSICAL_ACCEPTANCE_STEPS.map(
    (step) => session.results[step.id].status,
  );
  const passed = values.filter((value) => value === "PASS").length;
  const failed = values.filter((value) => value === "FAIL").length;
  const blocked = values.filter((value) => value === "BLOCKED").length;
  const skipped = values.filter((value) => value === "SKIPPED").length;
  const notRun = values.filter((value) => value === "NOT_RUN").length;
  const completed = values.length - notRun;
  return Object.freeze({
    total: values.length,
    passed,
    failed,
    blocked,
    skipped,
    notRun,
    completed,
    completionPercent:
      values.length === 0 ? 0 : Math.round((completed / values.length) * 100),
  });
}

export function acceptanceEvidenceFromContext(
  context: PhysicalAcceptanceContextSnapshot,
): string {
  const rows: readonly [string, string | number | boolean | null][] = [
    ["capturedAt", context.capturedAt],
    ["secureContext", context.secureContext],
    ["webSerialSupported", context.webSerialSupported],
    ["connectionState", context.connectionState],
    ["selectedRole", context.selectedRole],
    ["observedRole", context.observedRole],
    ["productName", context.productName],
    ["firmwareVersion", context.firmwareVersion],
    ["hardwareVersion", context.hardwareVersion],
    ["parameterCount", context.parameterCount],
    ["usbVendorId", context.usbVendorId],
    ["usbProductId", context.usbProductId],
    ["targetId", context.targetId],
    ["targetKey", context.targetKey],
    ["targetName", context.targetName],
    ["targetPlatform", context.targetPlatform],
    ["targetConfidence", context.targetConfidence],
    ["releaseLabel", context.releaseLabel],
    ["releaseRevision", context.releaseRevision],
    ["flashMethod", context.flashMethod],
    ["settingsBackupAvailable", context.settingsBackupAvailable],
    ["writableParameterCount", context.writableParameterCount],
    ["bindCommandAvailable", context.bindCommandAvailable],
    ["bootloaderCommandAvailable", context.bootloaderCommandAvailable],
    ["packageFileName", context.packageFileName],
    ["recoveryFileName", context.recoveryFileName],
    ["packageSegmentCount", context.packageSegmentCount],
    ["recoveryDownloaded", context.recoveryDownloaded],
    ["checkpointStage", context.checkpointStage],
    ["flashStage", context.flashStage],
    ["statusMessage", context.statusMessage],
  ];
  const lines = rows
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);
  for (const hash of context.packageSegmentHashes.slice(0, 16)) {
    lines.push(`segmentSha256: ${hash}`);
  }
  return redactSensitiveAcceptanceText(lines.join("\n"));
}

export function suggestPhysicalAcceptanceEvidence(
  stepId: PhysicalAcceptanceStepId,
  context: PhysicalAcceptanceContextSnapshot,
): PhysicalAcceptanceSuggestion {
  const evidence = acceptanceEvidenceFromContext(context);
  switch (stepId) {
    case "secure_browser":
      return Object.freeze({
        status:
          context.secureContext && context.webSerialSupported
            ? "PASS"
            : "BLOCKED",
        evidence,
        reason:
          context.secureContext && context.webSerialSupported
            ? "HTTPS and Web Serial are available"
            : "HTTPS or Web Serial is unavailable",
      });
    case "tx_crsf_identity":
      return Object.freeze({
        status:
          context.connectionState === "CRSF_CONNECTED" &&
          context.observedRole === "tx"
            ? "PASS"
            : null,
        evidence,
        reason: "A valid TX Device Info snapshot is required",
      });
    case "rx_crsf_identity":
      return Object.freeze({
        status:
          context.connectionState === "CRSF_CONNECTED" &&
          context.observedRole === "rx"
            ? "PASS"
            : null,
        evidence,
        reason: "A valid RX Device Info snapshot is required",
      });
    case "settings_backup_created":
      return Object.freeze({
        status: context.settingsBackupAvailable ? "PASS" : null,
        evidence,
        reason: "The live session must expose an identity-bound backup",
      });
    case "firmware_package_verified":
      return Object.freeze({
        status:
          context.packageSegmentCount > 0 && context.recoveryDownloaded
            ? "PASS"
            : null,
        evidence,
        reason:
          "A prepared package and the user's explicit confirmation that the recovery archive was saved are required",
      });
    case "post_flash_reconnect":
      return Object.freeze({
        status:
          context.flashStage === "COMPLETE" &&
          context.connectionState === "CRSF_CONNECTED"
            ? "PASS"
            : null,
        evidence,
        reason: "The flash must complete and the device must reconnect",
      });
    default:
      return Object.freeze({
        status: null,
        evidence,
        reason: "This result requires direct operator observation",
      });
  }
}

function sanitizeContext(
  context: PhysicalAcceptanceContextSnapshot,
): PhysicalAcceptanceContextSnapshot {
  const safeNumber = (value: number | null): number | null =>
    value !== null && Number.isFinite(value) ? value : null;
  return Object.freeze({
    capturedAt: sanitizeAcceptanceText(context.capturedAt, 80),
    secureContext: context.secureContext === true,
    webSerialSupported: context.webSerialSupported === true,
    connectionState:
      context.connectionState === "CRSF_CONNECTED"
        ? "CRSF_CONNECTED"
        : "DISCONNECTED",
    selectedRole: context.selectedRole === "rx" ? "rx" : "tx",
    observedRole:
      context.observedRole === "tx" || context.observedRole === "rx"
        ? context.observedRole
        : null,
    productName: nullableText(context.productName, 200),
    firmwareVersion: nullableText(context.firmwareVersion, 160),
    hardwareVersion: safeNumber(context.hardwareVersion),
    parameterCount: safeNumber(context.parameterCount),
    usbVendorId: validUsbId(context.usbVendorId),
    usbProductId: validUsbId(context.usbProductId),
    targetId: nullableText(context.targetId, 300),
    targetKey: nullableText(context.targetKey, 300),
    targetName: nullableText(context.targetName, 300),
    targetPlatform: nullableText(context.targetPlatform, 120),
    targetConfidence: nullableText(context.targetConfidence, 40),
    releaseLabel: nullableText(context.releaseLabel, 160),
    releaseRevision: nullableText(context.releaseRevision, 160),
    flashMethod: nullableText(context.flashMethod, 80),
    settingsBackupAvailable: context.settingsBackupAvailable === true,
    writableParameterCount:
      Number.isInteger(context.writableParameterCount) &&
      context.writableParameterCount >= 0
        ? Math.min(context.writableParameterCount, 4_096)
        : 0,
    bindCommandAvailable: context.bindCommandAvailable === true,
    bootloaderCommandAvailable: context.bootloaderCommandAvailable === true,
    packageFileName: nullableText(context.packageFileName, 300),
    recoveryFileName: nullableText(context.recoveryFileName, 300),
    packageSegmentCount:
      Number.isInteger(context.packageSegmentCount) &&
      context.packageSegmentCount >= 0
        ? Math.min(context.packageSegmentCount, 128)
        : 0,
    packageSegmentHashes: Object.freeze(
      context.packageSegmentHashes
        .filter((value) => /^[a-f0-9]{64}$/iu.test(value))
        .slice(0, 128)
        .map((value) => value.toLocaleLowerCase("en-US")),
    ),
    recoveryDownloaded: context.recoveryDownloaded === true,
    checkpointStage: nullableText(context.checkpointStage, 80),
    flashStage: nullableText(context.flashStage, 80),
    statusMessage: sanitizeAcceptanceText(context.statusMessage, 1_000),
  });
}

function nullableText(
  value: string | null,
  maximumLength: number,
): string | null {
  if (value === null) return null;
  const safe = sanitizeAcceptanceText(value, maximumLength).trim();
  return safe.length === 0 ? null : safe;
}

function validUsbId(value: number | null): number | null {
  return value !== null &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffff
    ? value
    : null;
}

function summarizeContext(context: PhysicalAcceptanceContextSnapshot): string {
  const identity =
    context.productName === null
      ? "no device identity"
      : `${context.observedRole ?? "unknown"}:${context.productName}`;
  return `${context.connectionState}; ${identity}; ${context.targetConfidence ?? "no target evidence"}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStatus(value: unknown): value is PhysicalAcceptanceStepStatus {
  return (
    typeof value === "string" &&
    STATUS_VALUES.has(value as PhysicalAcceptanceStepStatus)
  );
}

function parseStepResult(value: unknown): PhysicalAcceptanceStepResult | null {
  if (!isObject(value) || !isStatus(value.status)) return null;
  const observedAt =
    value.observedAt === null
      ? null
      : typeof value.observedAt === "string"
        ? sanitizeAcceptanceText(value.observedAt, 80)
        : null;
  return Object.freeze({
    status: value.status,
    observedAt,
    evidence: sanitizeAcceptanceText(value.evidence, 8_000),
    notes: sanitizeAcceptanceText(value.notes, 8_000),
  });
}

function parseContext(
  value: unknown,
): PhysicalAcceptanceContextSnapshot | null {
  if (!isObject(value)) return null;
  const selectedRole = value.selectedRole === "rx" ? "rx" : "tx";
  const observedRole =
    value.observedRole === "tx" || value.observedRole === "rx"
      ? value.observedRole
      : null;
  return sanitizeContext({
    capturedAt: sanitizeAcceptanceText(value.capturedAt, 80),
    secureContext: value.secureContext === true,
    webSerialSupported: value.webSerialSupported === true,
    connectionState:
      value.connectionState === "CRSF_CONNECTED"
        ? "CRSF_CONNECTED"
        : "DISCONNECTED",
    selectedRole,
    observedRole,
    productName:
      typeof value.productName === "string" ? value.productName : null,
    firmwareVersion:
      typeof value.firmwareVersion === "string" ? value.firmwareVersion : null,
    hardwareVersion:
      typeof value.hardwareVersion === "number" ? value.hardwareVersion : null,
    parameterCount:
      typeof value.parameterCount === "number" ? value.parameterCount : null,
    usbVendorId:
      typeof value.usbVendorId === "number" ? value.usbVendorId : null,
    usbProductId:
      typeof value.usbProductId === "number" ? value.usbProductId : null,
    targetId: typeof value.targetId === "string" ? value.targetId : null,
    targetKey: typeof value.targetKey === "string" ? value.targetKey : null,
    targetName: typeof value.targetName === "string" ? value.targetName : null,
    targetPlatform:
      typeof value.targetPlatform === "string" ? value.targetPlatform : null,
    targetConfidence:
      typeof value.targetConfidence === "string"
        ? value.targetConfidence
        : null,
    releaseLabel:
      typeof value.releaseLabel === "string" ? value.releaseLabel : null,
    releaseRevision:
      typeof value.releaseRevision === "string" ? value.releaseRevision : null,
    flashMethod:
      typeof value.flashMethod === "string" ? value.flashMethod : null,
    settingsBackupAvailable: value.settingsBackupAvailable === true,
    writableParameterCount:
      typeof value.writableParameterCount === "number"
        ? value.writableParameterCount
        : 0,
    bindCommandAvailable: value.bindCommandAvailable === true,
    bootloaderCommandAvailable: value.bootloaderCommandAvailable === true,
    packageFileName:
      typeof value.packageFileName === "string" ? value.packageFileName : null,
    recoveryFileName:
      typeof value.recoveryFileName === "string"
        ? value.recoveryFileName
        : null,
    packageSegmentCount:
      typeof value.packageSegmentCount === "number"
        ? value.packageSegmentCount
        : 0,
    packageSegmentHashes: Array.isArray(value.packageSegmentHashes)
      ? value.packageSegmentHashes.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    recoveryDownloaded: value.recoveryDownloaded === true,
    checkpointStage:
      typeof value.checkpointStage === "string" ? value.checkpointStage : null,
    flashStage: typeof value.flashStage === "string" ? value.flashStage : null,
    statusMessage:
      typeof value.statusMessage === "string" ? value.statusMessage : "",
  });
}

export function parsePhysicalAcceptanceSession(
  value: unknown,
): PhysicalAcceptanceSession | null {
  if (
    !isObject(value) ||
    value.schemaVersion !== PHYSICAL_ACCEPTANCE_SCHEMA_VERSION
  ) {
    return null;
  }
  if (
    typeof value.sessionId !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isObject(value.results)
  ) {
    return null;
  }
  const results = {} as Record<
    PhysicalAcceptanceStepId,
    PhysicalAcceptanceStepResult
  >;
  for (const definition of PHYSICAL_ACCEPTANCE_STEPS) {
    const parsed = parseStepResult(value.results[definition.id]);
    if (parsed === null) return null;
    results[definition.id] = parsed;
  }
  const events: PhysicalAcceptanceEvent[] = [];
  if (Array.isArray(value.events)) {
    for (const item of value.events.slice(-MAX_EVENTS)) {
      if (!isObject(item) || typeof item.at !== "string") continue;
      const type = item.type;
      if (
        type !== "SESSION_CREATED" &&
        type !== "CONTEXT_CAPTURED" &&
        type !== "STEP_UPDATED" &&
        type !== "SESSION_IMPORTED"
      ) {
        continue;
      }
      const stepId =
        typeof item.stepId === "string" &&
        STEP_IDS.has(item.stepId as PhysicalAcceptanceStepId)
          ? (item.stepId as PhysicalAcceptanceStepId)
          : null;
      events.push(
        Object.freeze({
          at: sanitizeAcceptanceText(item.at, 80),
          type,
          stepId,
          summary: sanitizeAcceptanceText(item.summary, 500),
        }),
      );
    }
  }
  return Object.freeze({
    schemaVersion: PHYSICAL_ACCEPTANCE_SCHEMA_VERSION,
    sessionId: sanitizeAcceptanceText(value.sessionId, 120),
    createdAt: sanitizeAcceptanceText(value.createdAt, 80),
    updatedAt: sanitizeAcceptanceText(value.updatedAt, 80),
    operatorAlias: sanitizeAcceptanceText(value.operatorAlias, 120),
    benchLabel: sanitizeAcceptanceText(value.benchLabel, 160),
    candidateSha: sanitizeAcceptanceText(value.candidateSha, 80),
    appUrl: sanitizeAcceptanceText(value.appUrl, 500),
    userAgent: sanitizeAcceptanceText(value.userAgent, 500),
    language: sanitizeAcceptanceText(value.language, 40),
    overallNotes: sanitizeAcceptanceText(value.overallNotes, 8_000),
    lastContext:
      value.lastContext === null ? null : parseContext(value.lastContext),
    results: Object.freeze(results),
    events: trimEvents([
      ...events,
      Object.freeze({
        at: new Date().toISOString(),
        type: "SESSION_IMPORTED",
        stepId: null,
        summary: "Session imported and validated",
      }),
    ]),
  });
}

export function parsePhysicalAcceptanceJson(
  text: string,
): PhysicalAcceptanceSession | null {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) return null;
  try {
    return parsePhysicalAcceptanceSession(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function exportableSession(
  session: PhysicalAcceptanceSession,
): PhysicalAcceptanceSession {
  const results = {} as Record<
    PhysicalAcceptanceStepId,
    PhysicalAcceptanceStepResult
  >;
  for (const definition of PHYSICAL_ACCEPTANCE_STEPS) {
    const result = session.results[definition.id];
    results[definition.id] = Object.freeze({
      ...result,
      evidence: redactSensitiveAcceptanceText(result.evidence),
      notes: redactSensitiveAcceptanceText(result.notes),
    });
  }
  return Object.freeze({
    ...session,
    operatorAlias: redactSensitiveAcceptanceText(session.operatorAlias),
    benchLabel: redactSensitiveAcceptanceText(session.benchLabel),
    overallNotes: redactSensitiveAcceptanceText(session.overallNotes),
    results: Object.freeze(results),
  });
}

export function serializePhysicalAcceptanceJson(
  session: PhysicalAcceptanceSession,
): string {
  return `${JSON.stringify(exportableSession(session), null, 2)}\n`;
}

const STATUS_LABELS: Readonly<Record<PhysicalAcceptanceStepStatus, string>> =
  Object.freeze({
    NOT_RUN: "لم يبدأ",
    PASS: "ناجح",
    FAIL: "فاشل",
    BLOCKED: "متعذر",
    SKIPPED: "متجاوز",
  });

export function serializePhysicalAcceptanceMarkdown(
  session: PhysicalAcceptanceSession,
): string {
  const safe = exportableSession(session);
  const summary = summarizePhysicalAcceptance(safe);
  const lines = [
    "# تقرير القبول الفيزيائي لـExpressLRS TX/RX",
    "",
    `- Session ID: \`${safe.sessionId}\``,
    `- Candidate SHA: \`${safe.candidateSha || "UNSPECIFIED"}\``,
    `- Created: \`${safe.createdAt}\``,
    `- Updated: \`${safe.updatedAt}\``,
    `- Operator: ${safe.operatorAlias || "غير مسجل"}`,
    `- Bench: ${safe.benchLabel || "غير مسجل"}`,
    `- App: ${safe.appUrl || "غير مسجل"}`,
    `- Browser: ${safe.userAgent || "غير مسجل"}`,
    "",
    "## الملخص",
    "",
    `- مكتمل: ${summary.completed}/${summary.total} (${summary.completionPercent}%)`,
    `- ناجح: ${summary.passed}`,
    `- فاشل: ${summary.failed}`,
    `- متعذر: ${summary.blocked}`,
    `- متجاوز: ${summary.skipped}`,
    `- لم يبدأ: ${summary.notRun}`,
    "",
    "## النتائج",
    "",
    "| # | الاختبار | المخاطرة | النتيجة | وقت الملاحظة |",
    "|---:|---|---|---|---|",
  ];
  for (const definition of PHYSICAL_ACCEPTANCE_STEPS) {
    const result = safe.results[definition.id];
    lines.push(
      `| ${definition.order} | ${definition.title} | ${definition.risk} | ${STATUS_LABELS[result.status]} | ${result.observedAt ?? "—"} |`,
    );
  }
  lines.push("", "## الأدلة والملاحظات", "");
  for (const definition of PHYSICAL_ACCEPTANCE_STEPS) {
    const result = safe.results[definition.id];
    lines.push(`### ${definition.order}. ${definition.title}`, "");
    lines.push(`- النتيجة: **${STATUS_LABELS[result.status]}**`);
    lines.push(`- اختياري: ${definition.optional ? "نعم" : "لا"}`);
    lines.push(`- مدمر: ${definition.destructive ? "نعم" : "لا"}`);
    lines.push("", "**الدليل**", "");
    lines.push(result.evidence || "لا يوجد دليل مسجل.", "");
    lines.push("**ملاحظات**", "");
    lines.push(result.notes || "لا توجد ملاحظات.", "");
  }
  if (safe.lastContext !== null) {
    lines.push("## آخر لقطة حالة", "", "```text");
    lines.push(acceptanceEvidenceFromContext(safe.lastContext));
    lines.push("```", "");
  }
  lines.push("## ملاحظات عامة", "", safe.overallNotes || "لا توجد.", "");
  lines.push(
    "## حد الدليل",
    "",
    "هذا التقرير يسجل ما شاهده المشغل. نجاح CI أو المحاكاة لا يحول أي بند إلى HARDWARE_OBSERVED دون تجربة جهاز فعلية.",
    "",
  );
  return lines.join("\n");
}

export function physicalAcceptanceFileStem(
  session: PhysicalAcceptanceSession,
): string {
  const candidate = session.candidateSha
    .replace(/[^a-f0-9]/giu, "")
    .slice(0, 12);
  const id = session.sessionId.replace(/[^a-z0-9_-]/giu, "-").slice(0, 32);
  return `expresslrs-physical-acceptance-${candidate || "unversioned"}-${id || "session"}`;
}
