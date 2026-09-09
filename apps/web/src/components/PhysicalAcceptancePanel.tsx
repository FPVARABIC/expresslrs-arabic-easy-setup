import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  createTranslator,
  defaultLocale,
  type Locale,
  type MessageKey,
} from "@elrs-easy/i18n";
import type {
  ControllerMessage,
  DeviceOperation,
  OperationReadiness,
} from "../hardware/useDeviceController";

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
} from "../acceptance/physical-acceptance";
import {
  browserPhysicalAcceptanceStorage,
  clearPhysicalAcceptanceSession,
  loadPhysicalAcceptanceSession,
  savePhysicalAcceptanceSession,
  type PhysicalAcceptanceStorage,
} from "../acceptance/physical-acceptance-storage";

const STATUS_OPTIONS: readonly PhysicalAcceptanceStepStatus[] = Object.freeze([
  "NOT_RUN",
  "PASS",
  "FAIL",
  "BLOCKED",
  "SKIPPED",
]);

/**
 * The device operations this panel reports readiness for. Each one is answered
 * separately by the controller, so an operator can see exactly which
 * prerequisite is missing for which operation instead of one blanket verdict.
 */
type ReportedOperation = Exclude<
  DeviceOperation,
  "connect" | "diagnostics" | "bindingPrerequisites"
>;

const REPORTED_OPERATIONS: readonly ReportedOperation[] = Object.freeze([
  "settingsWrite",
  "settingsRestore",
  "binding",
  "firmwareWrite",
  "recovery",
  "rxAsTx",
  "airport",
]);

const MAX_IMPORT_FILE_BYTES = 1_000_000;

function captureLabelFor(
  t: (key: MessageKey, parameters?: Record<string, string | number>) => string,
) {
  return (capturedAt: string): string =>
    t("accp.msg.captureBlock", { at: capturedAt });
}

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
  /** Localised "Snapshot <time>" heading for the appended block. */
  captureLabel: (capturedAt: string) => string,
): string {
  const block = `${captureLabel(capturedAt)}\n${evidence}`;
  if (current.trim().length === 0) return block;
  if (current.includes(block)) return current;
  return `${current.trim()}\n\n---\n${block}`;
}

function statusClass(status: PhysicalAcceptanceStepStatus): string {
  return `acceptance-step is-${status.toLocaleLowerCase("en-US").replace("_", "-")}`;
}

function isExactCandidateSha(value: string): boolean {
  return /^[0-9a-f]{40}$/u.test(value);
}

export interface PhysicalAcceptancePanelProps {
  readonly context: PhysicalAcceptanceContextSnapshot;
  /**
   * Live readiness, one entry per device operation. This panel never gates its
   * own recording on it: the recorder, the import, the export and every result
   * field stay open regardless. It is shown so the operator can see which
   * device operation is currently blocked and by what.
   */
  readonly readiness?: Readonly<Record<DeviceOperation, OperationReadiness>>;
  /** Renders a controller message in the current locale. */
  readonly renderMessage?: (value: ControllerMessage) => string;
  readonly locale?: Locale;
  readonly storage?: PhysicalAcceptanceStorage | null;
  readonly now?: () => Date;
  readonly initialCandidateSha?: string;
}

export function PhysicalAcceptancePanel({
  context,
  readiness,
  renderMessage,
  locale = defaultLocale,
  storage = browserPhysicalAcceptanceStorage(),
  now = systemNow,
  initialCandidateSha = detectedCandidateSha(),
}: PhysicalAcceptancePanelProps) {
  const t = createTranslator(locale);
  const captureLabel = captureLabelFor(t);
  const runtime = useMemo(
    () => browserRuntime(initialCandidateSha),
    [initialCandidateSha],
  );
  const [initialState] = useState(() => {
    const loaded = loadPhysicalAcceptanceSession(storage);
    const runtimeSha = runtime.candidateSha.trim();
    const matchingLoaded =
      loaded !== null &&
      loaded.candidateSha === runtimeSha &&
      (runtimeSha.length === 0 || isExactCandidateSha(runtimeSha));
    return Object.freeze({
      session: matchingLoaded
        ? loaded
        : createPhysicalAcceptanceSession({ runtime, now }),
      rejectedPersistedSession: loaded !== null && !matchingLoaded,
    });
  });
  const [session, setSession] = useState<PhysicalAcceptanceSession>(
    initialState.session,
  );
  const [message, setMessage] = useState(
    initialState.rejectedPersistedSession
      ? t("accp.msg.freshRecord")
      : t("accp.msg.ready"),
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const groups = useMemo(() => groupedSteps(), []);
  const summary = summarizePhysicalAcceptance(session);
  const candidateBound =
    isExactCandidateSha(runtime.candidateSha) &&
    session.candidateSha === runtime.candidateSha;

  useEffect(() => {
    savePhysicalAcceptanceSession(session, storage);
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
    setMessage(t("accp.msg.contextCaptured"));
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
    updateStep(step, {
      evidence: evidenceWithCapture(
        current.evidence,
        context.capturedAt,
        suggestion.evidence,
        captureLabel,
      ),
      ...(suggestion.status === null ? {} : { status: suggestion.status }),
    });
    setMessage(
      suggestion.status === null
        ? t("accp.msg.evidenceCaptured", { step: t(step.titleKey) })
        : t("accp.msg.evidenceCapturedWithSuggestion", {
            step: t(step.titleKey),
            status: suggestion.status,
          }),
    );
  }

  function createNewSession(): void {
    clearPhysicalAcceptanceSession(storage);
    setSession(createPhysicalAcceptanceSession({ runtime, now }));
    setMessage(t("accp.msg.newSession"));
  }

  function exportJson(): void {
    const stem = physicalAcceptanceFileStem(session);
    downloadTextFile(
      serializePhysicalAcceptanceJson(session),
      `${stem}.json`,
      "application/json",
    );
    setMessage(
      candidateBound
        ? t("accp.msg.jsonExported")
        : `${t("accp.msg.jsonExported")} ${t("accp.msg.unboundExport")}`,
    );
  }

  function exportMarkdown(): void {
    const stem = physicalAcceptanceFileStem(session);
    downloadTextFile(
      serializePhysicalAcceptanceMarkdown(session, t),
      `${stem}.md`,
      "text/markdown",
    );
    setMessage(
      candidateBound
        ? t("accp.msg.markdownExported")
        : `${t("accp.msg.markdownExported")} ${t("accp.msg.unboundExport")}`,
    );
  }

  async function importJson(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) return;
    if (file.size < 1 || file.size > MAX_IMPORT_FILE_BYTES) {
      setMessage(t("accp.msg.importTooLarge"));
      return;
    }
    try {
      const parsed = parsePhysicalAcceptanceJson(await file.text());
      if (parsed === null) {
        setMessage(t("accp.msg.importInvalid"));
        return;
      }
      if (
        !isExactCandidateSha(runtime.candidateSha) ||
        parsed.candidateSha !== runtime.candidateSha
      ) {
        setMessage(t("accp.msg.importShaMismatch"));
        return;
      }
      setSession(parsed);
      setMessage(t("accp.msg.imported"));
    } catch {
      setMessage(t("accp.msg.importUnreadable"));
    }
  }

  return (
    <section
      className="parity-card acceptance-panel"
      aria-labelledby="acceptance-heading"
    >
      <div className="parity-card-heading">
        <div>
          <span>5</span>
          <div>
            <h2 id="acceptance-heading">{t("accp.heading")}</h2>
            <p>{t("accp.subheading")}</p>
          </div>
        </div>
        <span
          className="acceptance-progress"
          aria-label={t("accp.progressLabel")}
        >
          {summary.completionPercent}%
        </span>
      </div>

      <section
        className="acceptance-readiness"
        aria-label={t("accp.readinessHeading")}
      >
        <h3>{t("accp.readinessHeading")}</h3>
        {readiness === undefined ? (
          <p className="parity-note">{t("accp.readinessUnknown")}</p>
        ) : (
          <ul>
            {REPORTED_OPERATIONS.map((operation) => {
              const state = readiness[operation];
              return (
                <li
                  key={operation}
                  data-operation={operation}
                  data-ready={state.ready ? "yes" : "no"}
                  className={state.ready ? "success-note" : "parity-note"}
                >
                  <strong>{t(`accp.op.${operation}`)}</strong>{" "}
                  {state.ready ? (
                    <span>{t("accp.readinessReady")}</span>
                  ) : (
                    <span>
                      {t("accp.readinessBlocked")}{" "}
                      {state.missing
                        .map((reason) =>
                          renderMessage === undefined
                            ? t(reason.key, reason.params)
                            : renderMessage(reason),
                        )
                        .join(" ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="parity-note">{t("accp.recordingAlwaysOpen")}</p>
        <p className="danger-note">{t("accp.noPhysicalPassFromSoftware")}</p>
      </section>

      <div className="acceptance-toolbar">
        <button
          type="button"
          className="primary-button"
          onClick={captureCurrentContext}
        >
          {t("accp.captureContext")}
        </button>
        <button type="button" className="secondary-button" onClick={exportJson}>
          {t("accp.exportJson")}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={exportMarkdown}
        >
          {t("accp.exportMarkdown")}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => importInputRef.current?.click()}
        >
          {t("accp.importSession")}
        </button>
        <input
          ref={importInputRef}
          className="acceptance-file-input"
          type="file"
          accept=".json,application/json"
          onChange={(event) => void importJson(event)}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={createNewSession}
        >
          {t("accp.newSession")}
        </button>
      </div>

      <div className="acceptance-message" role="status" aria-live="polite">
        {message}
      </div>

      <dl className="acceptance-summary">
        <div>
          <dt>{t("accp.session")}</dt>
          <dd>{session.sessionId}</dd>
        </div>
        <div>
          <dt>{t("accp.passed")}</dt>
          <dd>{summary.passed}</dd>
        </div>
        <div>
          <dt>{t("accp.failed")}</dt>
          <dd>{summary.failed}</dd>
        </div>
        <div>
          <dt>{t("accp.blocked")}</dt>
          <dd>{summary.blocked}</dd>
        </div>
        <div>
          <dt>{t("accp.notRun")}</dt>
          <dd>{summary.notRun}</dd>
        </div>
      </dl>

      <div className="acceptance-metadata-grid">
        <label>
          <span>{t("accp.operatorAlias")}</span>
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
          <span>{t("accp.benchLabel")}</span>
          <input
            type="text"
            value={session.benchLabel}
            maxLength={160}
            placeholder={t("accp.benchPlaceholder")}
            onChange={(event) =>
              updateMetadata({ benchLabel: event.currentTarget.value })
            }
          />
        </label>
        <div className="acceptance-candidate-sha">
          {/*
            The candidate SHA is the build's own identity, read from the
            bundle. It is shown rather than offered as a field, because an
            editable one would only invite an operator to type a provenance
            the report cannot support.
          */}
          <span>Candidate SHA</span>
          <output dir="ltr">
            {session.candidateSha === ""
              ? t("accp.candidateShaUnknown")
              : session.candidateSha}
          </output>
        </div>
      </div>

      <label className="acceptance-overall-notes">
        <span>{t("accp.overallNotes")}</span>
        <textarea
          value={session.overallNotes}
          maxLength={8_000}
          rows={3}
          placeholder={t("accp.notesPlaceholder")}
          onChange={(event) =>
            updateMetadata({ overallNotes: event.currentTarget.value })
          }
        />
      </label>

      {session.lastContext === null ? null : (
        <details className="acceptance-context">
          <summary>{t("accp.lastSnapshot")}</summary>
          <pre>{acceptanceEvidenceFromContext(session.lastContext)}</pre>
        </details>
      )}

      <div className="acceptance-phases">
        {groups.map((group) => (
          <section key={group.phase} className="acceptance-phase">
            <div className="acceptance-phase-heading">
              <h3>{t(`accp.phase.${group.phase}`)}</h3>
              <span>{t("accp.stepsCount", { count: group.steps.length })}</span>
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
                          <h4>{t(step.titleKey)}</h4>
                          <p>{t(step.instructionsKey)}</p>
                        </div>
                      </div>
                      <span
                        className={`acceptance-risk is-${step.risk.toLocaleLowerCase("en-US")}`}
                      >
                        {t(`accp.risk.${step.risk}`)}
                      </span>
                    </header>

                    <p className="acceptance-expected">
                      <strong>{t("accp.expectedEvidence")}</strong>{" "}
                      {t(step.expectedEvidenceKey)}
                    </p>
                    {step.destructive ? (
                      <p className="danger-note acceptance-destructive">
                        {t("accp.destructiveWarning")}
                      </p>
                    ) : null}

                    <div className="acceptance-step-controls">
                      <label>
                        <span>{t("accp.result")}</span>
                        <select
                          aria-label={t("accp.resultOf", {
                            step: t(step.titleKey),
                          })}
                          value={result.status}
                          onChange={(event) =>
                            updateStep(step, {
                              status: event.currentTarget
                                .value as PhysicalAcceptanceStepStatus,
                            })
                          }
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {t(`acc.status.${option}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => captureStepEvidence(step)}
                      >
                        {t("accp.captureStepEvidence")}
                      </button>
                    </div>

                    <label className="acceptance-text-field">
                      <span>{t("accp.recordedEvidence")}</span>
                      <textarea
                        aria-label={t("accp.evidenceOf", {
                          step: t(step.titleKey),
                        })}
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
                      <span>{t("accp.operatorNotes")}</span>
                      <textarea
                        aria-label={t("accp.notesOf", {
                          step: t(step.titleKey),
                        })}
                        value={result.notes}
                        maxLength={8_000}
                        rows={3}
                        onChange={(event) =>
                          updateStep(step, { notes: event.currentTarget.value })
                        }
                      />
                    </label>

                    <footer>
                      <span>
                        {step.optional
                          ? t("accp.optional")
                          : t("accp.required")}
                      </span>
                      <span>
                        {result.observedAt === null
                          ? t("accp.noTimestamp")
                          : t("accp.lastUpdated", { at: result.observedAt })}
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
