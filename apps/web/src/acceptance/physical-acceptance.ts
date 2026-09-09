import type { MessageKey } from "@elrs-easy/i18n";

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
  /** Catalog key for the step's name, so both locales read natively. */
  readonly titleKey: MessageKey;
  readonly instructionsKey: MessageKey;
  readonly expectedEvidenceKey: MessageKey;
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
      titleKey: "acc.step.secure_browser.title",
      instructionsKey: "acc.step.secure_browser.instructions",
      expectedEvidenceKey: "acc.step.secure_browser.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "bench_baseline",
      order: 2,
      phase: "PREFLIGHT",
      titleKey: "acc.step.bench_baseline.title",
      instructionsKey: "acc.step.bench_baseline.instructions",
      expectedEvidenceKey: "acc.step.bench_baseline.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "tx_crsf_identity",
      order: 3,
      phase: "IDENTITY",
      titleKey: "acc.step.tx_crsf_identity.title",
      instructionsKey: "acc.step.tx_crsf_identity.instructions",
      expectedEvidenceKey: "acc.step.tx_crsf_identity.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "rx_crsf_identity",
      order: 4,
      phase: "IDENTITY",
      titleKey: "acc.step.rx_crsf_identity.title",
      instructionsKey: "acc.step.rx_crsf_identity.instructions",
      expectedEvidenceKey: "acc.step.rx_crsf_identity.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "wrong_port_rejected",
      order: 5,
      phase: "IDENTITY",
      titleKey: "acc.step.wrong_port_rejected.title",
      instructionsKey: "acc.step.wrong_port_rejected.instructions",
      expectedEvidenceKey: "acc.step.wrong_port_rejected.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "wrong_role_rejected",
      order: 6,
      phase: "IDENTITY",
      titleKey: "acc.step.wrong_role_rejected.title",
      instructionsKey: "acc.step.wrong_role_rejected.instructions",
      expectedEvidenceKey: "acc.step.wrong_role_rejected.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "reconnect_identity_stable",
      order: 7,
      phase: "IDENTITY",
      titleKey: "acc.step.reconnect_identity_stable.title",
      instructionsKey: "acc.step.reconnect_identity_stable.instructions",
      expectedEvidenceKey: "acc.step.reconnect_identity_stable.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "settings_backup_created",
      order: 8,
      phase: "SETTINGS",
      titleKey: "acc.step.settings_backup_created.title",
      instructionsKey: "acc.step.settings_backup_created.instructions",
      expectedEvidenceKey: "acc.step.settings_backup_created.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "reversible_setting_write",
      order: 9,
      phase: "SETTINGS",
      titleKey: "acc.step.reversible_setting_write.title",
      instructionsKey: "acc.step.reversible_setting_write.instructions",
      expectedEvidenceKey: "acc.step.reversible_setting_write.evidence",
      risk: "REVERSIBLE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "settings_restored",
      order: 10,
      phase: "SETTINGS",
      titleKey: "acc.step.settings_restored.title",
      instructionsKey: "acc.step.settings_restored.instructions",
      expectedEvidenceKey: "acc.step.settings_restored.evidence",
      risk: "REVERSIBLE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "tx_bind_command_ack",
      order: 11,
      phase: "BINDING",
      titleKey: "acc.step.tx_bind_command_ack.title",
      instructionsKey: "acc.step.tx_bind_command_ack.instructions",
      expectedEvidenceKey: "acc.step.tx_bind_command_ack.evidence",
      risk: "RF",
      optional: false,
      destructive: false,
    },
    {
      id: "rx_bind_command_sent",
      order: 12,
      phase: "BINDING",
      titleKey: "acc.step.rx_bind_command_sent.title",
      instructionsKey: "acc.step.rx_bind_command_sent.instructions",
      expectedEvidenceKey: "acc.step.rx_bind_command_sent.evidence",
      risk: "RF",
      optional: false,
      destructive: false,
    },
    {
      id: "rf_link_observed",
      order: 13,
      phase: "BINDING",
      titleKey: "acc.step.rf_link_observed.title",
      instructionsKey: "acc.step.rf_link_observed.instructions",
      expectedEvidenceKey: "acc.step.rf_link_observed.evidence",
      risk: "RF",
      optional: false,
      destructive: false,
    },
    {
      id: "firmware_package_verified",
      order: 14,
      phase: "FIRMWARE",
      titleKey: "acc.step.firmware_package_verified.title",
      instructionsKey: "acc.step.firmware_package_verified.instructions",
      expectedEvidenceKey: "acc.step.firmware_package_verified.evidence",
      risk: "READ_ONLY",
      optional: false,
      destructive: false,
    },
    {
      id: "bootloader_entry",
      order: 15,
      phase: "FIRMWARE",
      titleKey: "acc.step.bootloader_entry.title",
      instructionsKey: "acc.step.bootloader_entry.instructions",
      expectedEvidenceKey: "acc.step.bootloader_entry.evidence",
      risk: "FIRMWARE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "normal_flash_verified",
      order: 16,
      phase: "FIRMWARE",
      titleKey: "acc.step.normal_flash_verified.title",
      instructionsKey: "acc.step.normal_flash_verified.instructions",
      expectedEvidenceKey: "acc.step.normal_flash_verified.evidence",
      risk: "FIRMWARE_WRITE",
      optional: false,
      destructive: true,
    },
    {
      id: "post_flash_reconnect",
      order: 17,
      phase: "FIRMWARE",
      titleKey: "acc.step.post_flash_reconnect.title",
      instructionsKey: "acc.step.post_flash_reconnect.instructions",
      expectedEvidenceKey: "acc.step.post_flash_reconnect.evidence",
      risk: "FIRMWARE_WRITE",
      optional: false,
      destructive: false,
    },
    {
      id: "recovery_package_restore",
      order: 18,
      phase: "RECOVERY",
      titleKey: "acc.step.recovery_package_restore.title",
      instructionsKey: "acc.step.recovery_package_restore.instructions",
      expectedEvidenceKey: "acc.step.recovery_package_restore.evidence",
      risk: "RECOVERY_DRILL",
      optional: false,
      destructive: true,
    },
    {
      id: "interrupted_flash_recovery",
      order: 19,
      phase: "RECOVERY",
      titleKey: "acc.step.interrupted_flash_recovery.title",
      instructionsKey: "acc.step.interrupted_flash_recovery.instructions",
      expectedEvidenceKey: "acc.step.interrupted_flash_recovery.evidence",
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

/**
 * Latin secret labels. Word separators are accepted as space, underscore, or
 * hyphen so `bind phrase`, `bind-phrase`, and `binding_phrase` are all covered.
 */
const LATIN_SECRET_LABEL =
  "password|passphrase|wifi[\\s_-]*password|ssid|binding[\\s_-]*phrase|bind[\\s_-]*phrase|uid|token|secret";

/**
 * Arabic secret labels. This is an Arabic-first application, so operators write
 * acceptance notes in Arabic and the exported evidence must redact those labels
 * too. Arabic letters are not `\w`, so `\b` cannot be used around them.
 */
const ARABIC_SECRET_LABEL =
  // Arabic here is redaction *data*, not interface text: these patterns match
  // the Arabic words an operator might type around a secret, so the export can
  // strip it. They are locale-independent and must not be translated.
  "كلمة\\s+(?:المرور|السر)|عبارة\\s+(?:الربط|ربط)|اسم\\s+الشبكة|الرقم\\s+السري|الرمز\\s+السري";

export function redactSensitiveAcceptanceText(value: unknown): string {
  return (
    sanitizeAcceptanceText(value, 20_000)
      // A binding UID is written as an octet list. Redact every octet, not just
      // the first one before the separating comma.
      .replace(
        // The Arabic comma here is redaction data, not interface text: a UID an
        // operator pasted may be separated by either comma.
        /\b(uid)\b[ \t]*[:=][ \t]*\[?[ \t]*\d{1,3}(?:[ \t]*[,،][ \t]*\d{1,3})*[ \t]*\]?/giu,
        "$1=[REDACTED]",
      )
      .replace(
        new RegExp(
          `\\b(${LATIN_SECRET_LABEL})\\b\\s*[:=]\\s*([^\\s,;]+)`,
          "giu",
        ),
        "$1=[REDACTED]",
      )
      .replace(
        new RegExp(`\\b(${LATIN_SECRET_LABEL})\\b\\s+([^\\n]{1,120})`, "giu"),
        "$1 [REDACTED]",
      )
      .replace(
        new RegExp(
          `(${ARABIC_SECRET_LABEL})\\s*[:=]?\\s*([^\\n]{1,120})`,
          "gu",
        ),
        "$1 [REDACTED]",
      )
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

export function serializePhysicalAcceptanceMarkdown(
  session: PhysicalAcceptanceSession,
  /**
   * The exported report reads in the operator's own language, so every label
   * comes from the catalog rather than being frozen into this module.
   */
  translate: (
    key: MessageKey,
    parameters?: Record<string, string | number>,
  ) => string,
): string {
  const safe = exportableSession(session);
  const summary = summarizePhysicalAcceptance(safe);
  const t = translate;
  const statusLabel = (status: PhysicalAcceptanceStepStatus): string =>
    t(`acc.status.${status}` as MessageKey);
  const orUnrecorded = (value: string): string =>
    value || t("acc.md.unrecorded");
  const lines = [
    `# ${t("acc.md.title")}`,
    "",
    `- Session ID: \`${safe.sessionId}\``,
    `- Candidate SHA: \`${safe.candidateSha || "UNSPECIFIED"}\``,
    `- Created: \`${safe.createdAt}\``,
    `- Updated: \`${safe.updatedAt}\``,
    `- ${t("acc.md.operator")}: ${orUnrecorded(safe.operatorAlias)}`,
    `- ${t("acc.md.bench")}: ${orUnrecorded(safe.benchLabel)}`,
    `- ${t("acc.md.app")}: ${orUnrecorded(safe.appUrl)}`,
    `- ${t("acc.md.browser")}: ${orUnrecorded(safe.userAgent)}`,
    "",
    `## ${t("acc.md.summary")}`,
    "",
    `- ${t("acc.md.completed")}: ${summary.completed}/${summary.total} (${summary.completionPercent}%)`,
    `- ${t("acc.md.passed")}: ${summary.passed}`,
    `- ${t("acc.md.failed")}: ${summary.failed}`,
    `- ${t("acc.md.blocked")}: ${summary.blocked}`,
    `- ${t("acc.md.skipped")}: ${summary.skipped}`,
    `- ${t("acc.md.notRun")}: ${summary.notRun}`,
    "",
    `## ${t("acc.md.stepsTable")}`,
    "",
    `| ${t("acc.md.colOrder")} | ${t("acc.md.colStep")} | ${t("acc.md.colRisk")} | ${t("acc.md.colStatus")} | ${t("acc.md.colObserved")} |`,
    "|---:|---|---|---|---|",
  ];
  for (const definition of PHYSICAL_ACCEPTANCE_STEPS) {
    const result = safe.results[definition.id];
    lines.push(
      `| ${definition.order} | ${t(definition.titleKey)} | ${definition.risk} | ${statusLabel(result.status)} | ${result.observedAt ?? "—"} |`,
    );
  }
  lines.push("", `## ${t("acc.md.evidenceSection")}`, "");
  for (const definition of PHYSICAL_ACCEPTANCE_STEPS) {
    const result = safe.results[definition.id];
    lines.push(`### ${definition.order}. ${t(definition.titleKey)}`, "");
    lines.push(`- ${t("acc.md.result")}: **${statusLabel(result.status)}**`);
    lines.push(
      `- ${t("acc.md.optional")}: ${definition.optional ? t("acc.md.yes") : t("acc.md.no")}`,
    );
    lines.push(
      `- ${t("acc.md.destructive")}: ${definition.destructive ? t("acc.md.yes") : t("acc.md.no")}`,
    );
    lines.push("", `**${t("acc.md.evidence")}**`, "");
    lines.push(result.evidence || t("acc.md.noEvidence"), "");
    lines.push(`**${t("acc.md.notes")}**`, "");
    lines.push(result.notes || t("acc.md.noNotes"), "");
  }
  if (safe.lastContext !== null) {
    lines.push(`## ${t("acc.md.lastSnapshot")}`, "", "```text");
    lines.push(acceptanceEvidenceFromContext(safe.lastContext));
    lines.push("```", "");
  }
  lines.push(
    `## ${t("acc.md.generalNotes")}`,
    "",
    safe.overallNotes || t("acc.md.none"),
    "",
  );
  lines.push(
    `## ${t("acc.md.evidenceLimitTitle")}`,
    "",
    t("acc.md.evidenceLimit"),
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
