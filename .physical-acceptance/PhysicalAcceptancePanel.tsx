import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  PHYSICAL_ACCEPTANCE_STEPS,
  acceptanceEvidenceFromContext,
  capturePhysicalAcceptanceContext,
  createPhysicalAcceptanceSession,
  parsePhysicalAcceptanceJson,
  physicalAcceptanceFileStem,
  serializePhysicalAcceptanceJson,
  serializePhysicalAcceptanceMarkdown,
  suggestPhysicalAcceptanceEvidence,
  summarizePhysicalAcceptance,
  updatePhysicalAcceptanceMetadata,
  updatePhysicalAcceptanceStep,
  type PhysicalAcceptanceContextSnapshot,
  type PhysicalAcceptancePhase,
  type PhysicalAcceptanceRuntime,
  type PhysicalAcceptanceSession,
  type PhysicalAcceptanceStepDefinition,
  type PhysicalAcceptanceStepStatus,
} from "./physical-acceptance";
import {
  browserPhysicalAcceptanceStorage,
  clearPhysicalAcceptanceSession,
  loadPhysicalAcceptanceSession,
  savePhysicalAcceptanceSession,
  type PhysicalAcceptanceStorage,
} from "./physical-acceptance-storage";

const STATUS_OPTIONS: readonly Readonly<{
  value: PhysicalAcceptanceStepStatus;
  label: string;
}>[] = Object.freeze([
  { value: "NOT_RUN", label: "لم يبدأ" },
  { value: "PASS", label: "ناجح" },
  { value: "FAIL", label: "فاشل" },
  { value: "BLOCKED", label: "متعذر" },
  { value: "SKIPPED", label: "متجاوز" },
]);

const PHASE_LABELS: Readonly<Record<PhysicalAcceptancePhase, string>> =
  Object.freeze({
    PREFLIGHT: "تهيئة منصة الاختبار",
    IDENTITY: "التعريف والاتصال",
    SETTINGS: "الإعدادات القابلة للعكس",
    BINDING: "الربط اللاسلكي",
    FIRMWARE: "Bootloader والتفليش",
    RECOVERY: "الاستعادة",
  });

const RISK_LABELS = Object.freeze({
  READ_ONLY: "قراءة فقط",
  REVERSIBLE_WRITE: "كتابة قابلة للعكس",
  RF: "رابط RF",
  FIRMWARE_WRITE: "كتابة Firmware",
  RECOVERY_DRILL: "اختبار استعادة",
});

const MAX_IMPORT_FILE_BYTES = 1_000_000;

function systemNow(): Date {
  return new Date();
}

function detectedCandidateSha(): string {
  const value = import.meta.env.VITE_BUILD_SHA;
  return typeof value === "string" ? value.trim() : "";
}

function browserRuntime(candidateSha: string): PhysicalAcceptanceRuntime {
  return Object.freeze({
    appUrl: typeof window === "undefined" ? "" : window.location.href,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    language: typeof navigator === "undefined" ? "" : navigator.language,
    candidateSha,
  });
}

function downloadTextFile(
  contents: string,
  fileName: string,
  mimeType: string,
): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function groupedSteps(): readonly Readonly<{
  phase: PhysicalAcceptancePhase;
  steps: readonly PhysicalAcceptanceStepDefinition[];
}>[] {
  const phases: readonly PhysicalAcceptancePhase[] = [
    "PREFLIGHT",
    "IDENTITY",
    "SETTINGS",
    "BINDING",
    "FIRMWARE",
    "RECOVERY",
  ];
  return phases.map((phase) =>
    Object.freeze({
      phase,
      steps: PHYSICAL_ACCEPTANCE_STEPS.filter((step) => step.phase === phase),
    }),
  );
}

function evidenceWithCapture(
  current: string,
  capturedAt: string,
  evidence: string,
): string {
  const block = `لقطة ${capturedAt}\n${evidence}`;
  if (current.trim().length === 0) return block;
  if (current.includes(block)) return current;
  return `${current.trim()}\n\n---\n${block}`;
}

function statusClass(status: PhysicalAcceptanceStepStatus): string {
  return `acceptance-step is-${status.toLocaleLowerCase("en-US").replace("_", "-")}`;
}

export interface PhysicalAcceptancePanelProps {
  readonly context: PhysicalAcceptanceContextSnapshot;
  readonly storage?: PhysicalAcceptanceStorage | null;
  readonly now?: () => Date;
  readonly initialCandidateSha?: string;
}

export function PhysicalAcceptancePanel({
  context,
  storage = browserPhysicalAcceptanceStorage(),
  now = systemNow,
  initialCandidateSha = detectedCandidateSha(),
}: PhysicalAcceptancePanelProps) {
  const runtime = useMemo(
    () => browserRuntime(initialCandidateSha),
    [initialCandidateSha],
  );
  const [session, setSession] = useState<PhysicalAcceptanceSession>(() => {
    return (
      loadPhysicalAcceptanceSession(storage) ??
      createPhysicalAcceptanceSession({ runtime, now })
    );
  });
  const [message, setMessage] = useState(
    "سجل محلي جاهز. كل خطوة متاحة من البداية ولا توجد تبعية إجبارية بين الخطوات.",
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const groups = useMemo(groupedSteps, []);
  const summary = summarizePhysicalAcceptance(session);

  useEffect(() => {
    const result = savePhysicalAcceptanceSession(session, storage);
    if (!result.ok) {
      setMessage(`تعذر الحفظ المحلي: ${result.message}`);
    }
  }, [session, storage]);

  function updateMetadata(
    patch: Parameters<typeof updatePhysicalAcceptanceMetadata>[1],
  ): void {
    setSession((current) =>
      updatePhysicalAcceptanceMetadata(current, patch, now),
    );
  }

  function captureCurrentContext(): void {
    setSession((current) =>
      capturePhysicalAcceptanceContext(current, context, now),
    );
    setMessage(
      "تم التقاط الحالة الحالية من التطبيق دون حفظ كلمات مرور أو SSID أو Binding phrase.",
    );
  }

  function updateStep(
    step: PhysicalAcceptanceStepDefinition,
    patch: Parameters<typeof updatePhysicalAcceptanceStep>[2],
  ): void {
    setSession((current) =>
      updatePhysicalAcceptanceStep(current, step.id, patch, now),
    );
  }

  function captureStepEvidence(step: PhysicalAcceptanceStepDefinition): void {
    const suggestion = suggestPhysicalAcceptanceEvidence(step.id, context);
    const current = session.results[step.id];
    const patch: Parameters<typeof updatePhysicalAcceptanceStep>[2] = {
      evidence: evidenceWithCapture(
        current.evidence,
        context.capturedAt,
        suggestion.evidence,
      ),
    };
    if (suggestion.status !== null) patch.status = suggestion.status;
    updateStep(step, patch);
    setMessage(
      suggestion.status === null
        ? `تم التقاط الدليل لـ${step.title}. النتيجة تحتاج مشاهدة المشغل.`
        : `تم التقاط دليل قابل للتحقق واقتراح ${suggestion.status} لـ${step.title}.`,
    );
  }

  function createNewSession(): void {
    clearPhysicalAcceptanceSession(storage);
    setSession(createPhysicalAcceptanceSession({ runtime, now }));
    setMessage("تم إنشاء جلسة قبول جديدة. الجلسة السابقة لم تعد في التخزين المحلي.");
  }

  function exportJson(): void {
    const stem = physicalAcceptanceFileStem(session);
    downloadTextFile(
      serializePhysicalAcceptanceJson(session),
      `${stem}.json`,
      "application/json",
    );
    setMessage("تم إنشاء ملف JSON منقح من الحقول الحساسة.");
  }

  function exportMarkdown(): void {
    const stem = physicalAcceptanceFileStem(session);
    downloadTextFile(
      serializePhysicalAcceptanceMarkdown(session),
      `${stem}.md`,
      "text/markdown",
    );
    setMessage("تم إنشاء تقرير Markdown قابل للمراجعة والإرفاق بالـPR.");
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) return;
    if (file.size < 1 || file.size > MAX_IMPORT_FILE_BYTES) {
      setMessage("ملف الاستيراد فارغ أو أكبر من 1 MiB.");
      return;
    }
    try {
      const parsed = parsePhysicalAcceptanceJson(await file.text());
      if (parsed === null) {
        setMessage("ملف النتائج غير صالح أو لا يطابق مخطط القبول الفيزيائي.");
        return;
      }
      setSession(parsed);
      setMessage("تم استيراد الجلسة والتحقق من بنيتها وحدودها.");
    } catch {
      setMessage("تعذر قراءة ملف النتائج.");
    }
  }

  return (
    <section className="parity-card acceptance-panel" aria-labelledby="acceptance-heading">
      <div className="parity-card-heading">
        <div>
          <span>5</span>
          <div>
            <h2 id="acceptance-heading">القبول الفيزيائي وتسجيل النتائج</h2>
            <p>
              جميع الاختبارات متاحة مباشرة. الترتيب أدناه موصى به وليس قفلًا
              برمجيًا.
            </p>
          </div>
        </div>
        <span className="acceptance-progress" aria-label="نسبة اكتمال السجل">
          {summary.completionPercent}%
        </span>
      </div>

      <p className="success-note acceptance-unlocked-note">
        لا يوجد قفل مرحلي على أداة التسجيل أو الاختبارات. تبقى فقط شروط السلامة
        داخل عمليات الكتابة نفسها: هوية Target، حزمة Recovery، ثبات الطاقة،
        وهوائي TX. هذه الشروط تمنع الكتابة على جهاز خاطئ ولا تمنع التجربة
        الفيزيائية.
      </p>

      <div className="acceptance-toolbar">
        <button type="button" className="primary-button" onClick={captureCurrentContext}>
          التقاط الحالة الحالية
        </button>
        <button type="button" className="secondary-button" onClick={exportJson}>
          تصدير JSON
        </button>
        <button type="button" className="secondary-button" onClick={exportMarkdown}>
          تصدير تقرير Markdown
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => importInputRef.current?.click()}
        >
          استيراد جلسة
        </button>
        <input
          ref={importInputRef}
          className="acceptance-file-input"
          type="file"
          accept=".json,application/json"
          onChange={(event) => void importJson(event)}
        />
        <button type="button" className="secondary-button" onClick={createNewSession}>
          جلسة جديدة
        </button>
      </div>

      <div className="acceptance-message" role="status" aria-live="polite">
        {message}
      </div>

      <dl className="acceptance-summary">
        <div>
          <dt>الجلسة</dt>
          <dd>{session.sessionId}</dd>
        </div>
        <div>
          <dt>ناجح</dt>
          <dd>{summary.passed}</dd>
        </div>
        <div>
          <dt>فاشل</dt>
          <dd>{summary.failed}</dd>
        </div>
        <div>
          <dt>متعذر</dt>
          <dd>{summary.blocked}</dd>
        </div>
        <div>
          <dt>لم يبدأ</dt>
          <dd>{summary.notRun}</dd>
        </div>
      </dl>

      <div className="acceptance-metadata-grid">
        <label>
          <span>اسم المشغل المختصر</span>
          <input
            type="text"
            value={session.operatorAlias}
            maxLength={120}
            onChange={(event) =>
              updateMetadata({ operatorAlias: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <span>اسم منصة الاختبار</span>
          <input
            type="text"
            value={session.benchLabel}
            maxLength={160}
            placeholder="مثال: TX-1 / RX-1"
            onChange={(event) =>
              updateMetadata({ benchLabel: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <span>Candidate SHA</span>
          <input
            type="text"
            value={session.candidateSha}
            maxLength={80}
            dir="ltr"
            placeholder="Commit SHA للنسخة المختبرة"
            onChange={(event) =>
              updateMetadata({ candidateSha: event.currentTarget.value })
            }
          />
        </label>
      </div>

      <label className="acceptance-overall-notes">
        <span>ملاحظات عامة</span>
        <textarea
          value={session.overallNotes}
          maxLength={8_000}
          rows={3}
          placeholder="لا تكتب UID أو SSID أو كلمة مرور أو Binding phrase."
          onChange={(event) =>
            updateMetadata({ overallNotes: event.currentTarget.value })
          }
        />
      </label>

      {session.lastContext === null ? null : (
        <details className="acceptance-context">
          <summary>آخر لقطة حالة محفوظة</summary>
          <pre>{acceptanceEvidenceFromContext(session.lastContext)}</pre>
        </details>
      )}

      <div className="acceptance-phases">
        {groups.map((group) => (
          <section key={group.phase} className="acceptance-phase">
            <div className="acceptance-phase-heading">
              <h3>{PHASE_LABELS[group.phase]}</h3>
              <span>{group.steps.length} اختبارات</span>
            </div>
            <div className="acceptance-steps">
              {group.steps.map((step) => {
                const result = session.results[step.id];
                return (
                  <article key={step.id} className={statusClass(result.status)}>
                    <header>
                      <div>
                        <span className="acceptance-order">{step.order}</span>
                        <div>
                          <h4>{step.title}</h4>
                          <p>{step.instructions}</p>
                        </div>
                      </div>
                      <span className={`acceptance-risk is-${step.risk.toLocaleLowerCase("en-US")}`}>
                        {RISK_LABELS[step.risk]}
                      </span>
                    </header>

                    <p className="acceptance-expected">
                      <strong>دليل القبول:</strong> {step.expectedEvidence}
                    </p>
                    {step.destructive ? (
                      <p className="danger-note acceptance-destructive">
                        هذا الاختبار يكتب على Flash. نفذه بعد نجاح الاختبارات
                        الأقل خطورة، وعلى جهاز احتياطي في حالة الانقطاع المتعمد.
                      </p>
                    ) : null}

                    <div className="acceptance-step-controls">
                      <label>
                        <span>النتيجة</span>
                        <select
                          aria-label={`نتيجة ${step.title}`}
                          value={result.status}
                          onChange={(event) =>
                            updateStep(step, {
                              status: event.currentTarget
                                .value as PhysicalAcceptanceStepStatus,
                            })
                          }
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => captureStepEvidence(step)}
                      >
                        التقاط دليل هذه الخطوة
                      </button>
                    </div>

                    <label className="acceptance-text-field">
                      <span>الدليل المسجل</span>
                      <textarea
                        aria-label={`دليل ${step.title}`}
                        value={result.evidence}
                        maxLength={8_000}
                        rows={4}
                        onChange={(event) =>
                          updateStep(step, {
                            evidence: event.currentTarget.value,
                          })
                        }
                      />
                    </label>

                    <label className="acceptance-text-field">
                      <span>ملاحظات المشغل</span>
                      <textarea
                        aria-label={`ملاحظات ${step.title}`}
                        value={result.notes}
                        maxLength={8_000}
                        rows={3}
                        onChange={(event) =>
                          updateStep(step, { notes: event.currentTarget.value })
                        }
                      />
                    </label>

                    <footer>
                      <span>{step.optional ? "اختياري" : "مطلوب"}</span>
                      <span>
                        {result.observedAt === null
                          ? "لا توجد ملاحظة زمنية"
                          : `آخر تحديث: ${result.observedAt}`}
                      </span>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
