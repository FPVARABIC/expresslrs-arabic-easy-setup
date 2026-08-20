import { useEffect, useMemo, useRef, useState } from "react";
import type { OperationErrorCode } from "@elrs-easy/domain";
import {
  createTranslator,
  defaultLocale,
  getDirection,
  translateOperationError,
  type Locale,
} from "@elrs-easy/i18n";

import {
  bindingPreviewLabScenarios,
  prepareBindingPreviewLab,
  runPreparedBindingPreviewLab,
  type BindingPreviewLabOutcome,
  type BindingPreviewLabPreparation,
  type BindingPreviewLabScenarioId,
} from "./view-model/bindingPreviewLab";

export function BindingPreviewLab() {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [scenarioId, setScenarioId] =
    useState<BindingPreviewLabScenarioId>("tx-2g4");
  const [preparation, setPreparation] =
    useState<BindingPreviewLabPreparation | null>(null);
  const [outcome, setOutcome] = useState<BindingPreviewLabOutcome | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [running, setRunning] = useState(false);
  const [labError, setLabError] = useState<OperationErrorCode | null>(null);
  const requestSequence = useRef(0);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const direction = getDirection(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.title = `${t("task.bind.title")} · ${t("status.mockBadge")}`;
  }, [direction, locale, t]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setPreparation(null);
    setOutcome(null);
    setLabError(null);
    setPreparing(true);
    setRunning(false);

    void prepareBindingPreviewLab(scenarioId)
      .then((nextPreparation) => {
        if (requestSequence.current === requestId) {
          setPreparation(nextPreparation);
        }
      })
      .catch(() => {
        if (requestSequence.current === requestId) {
          setLabError("INTERNAL_ERROR");
        }
      })
      .finally(() => {
        if (requestSequence.current === requestId) {
          setPreparing(false);
        }
      });
  }, [scenarioId]);

  async function confirmPreview() {
    if (preparation?.preview.status !== "READY") {
      return;
    }

    const requestId = ++requestSequence.current;
    setOutcome(null);
    setLabError(null);
    setRunning(true);
    try {
      const nextOutcome = await runPreparedBindingPreviewLab(preparation);
      if (requestSequence.current === requestId) {
        setOutcome(nextOutcome);
      }
    } catch {
      if (requestSequence.current === requestId) {
        setLabError("INTERNAL_ERROR");
      }
    } finally {
      if (requestSequence.current === requestId) {
        setRunning(false);
      }
    }
  }

  const preview = preparation?.preview ?? null;
  const displayedError = outcome?.errorCode ?? labError;
  const backHref = `${window.location.pathname}${window.location.hash}`;

  return (
    <div className="app-shell" dir={direction}>
      <a className="skip-link" href="#binding-lab-main">
        {t("navigation.skip")}
      </a>

      <header className="topbar">
        <a className="brand" href={backHref} aria-label={t("app.name")}>
          <span className="brand-copy">
            <strong>{t("app.shortName")}</strong>
            <small>{t("app.independent")}</small>
          </span>
        </a>

        <div className="topbar-actions">
          <span className="status-pill status-pill-safe">
            {t("status.mockBadge")} · {t("status.readOnly")}
          </span>
          <div
            className="language-switcher"
            role="group"
            aria-label={t("language.switch")}
          >
            <button
              className={locale === "ar" ? "is-active" : undefined}
              type="button"
              onClick={() => setLocale("ar")}
              aria-pressed={locale === "ar"}
            >
              {t("language.arabic")}
            </button>
            <button
              className={locale === "en" ? "is-active" : undefined}
              type="button"
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
            >
              {t("language.english")}
            </button>
          </div>
        </div>
      </header>

      <main className="main-content" id="binding-lab-main">
        <section className="hero" aria-labelledby="binding-lab-heading">
          <div className="hero-copy">
            <span className="eyebrow">M3 · SIMULATION_ONLY</span>
            <h1 id="binding-lab-heading">{t("task.bind.title")}</h1>
            <p>{t("task.confirmDescription")}</p>
          </div>
          <aside className="safety-card">
            <div>
              <h2>{t("safety.heading")}</h2>
              <p>{t("task.previewOnly")}</p>
            </div>
          </aside>
        </section>

        <section className="task-panel" aria-labelledby="preview-lab-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">{t("mode.easy")}</span>
              <h2 id="preview-lab-heading">{t("task.confirmTitle")}</h2>
            </div>
          </div>

          <label className="origin-field" htmlFor="binding-lab-scenario">
            <span>{t("home.mockLabel")}</span>
            <select
              id="binding-lab-scenario"
              value={scenarioId}
              disabled={preparing || running}
              onChange={(event) => {
                const next = bindingPreviewLabScenarios.find(
                  (candidate) => candidate.id === event.currentTarget.value,
                );
                if (next !== undefined) {
                  setScenarioId(next.id);
                }
              }}
            >
              {bindingPreviewLabScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {t(scenario.labelKey)}
                </option>
              ))}
            </select>
          </label>

          {preparing ? (
            <p role="status">{t("task.mockPending")}</p>
          ) : preview !== null ? (
            <div className="advanced-content">
              <div className="real-device-badges">
                <span className="mock-badge">{preview.validationLevel}</span>
                <span
                  className={
                    preview.status === "READY"
                      ? "validation-badge"
                      : "read-only-badge"
                  }
                >
                  {preview.status}
                </span>
              </div>

              <dl className="technical-grid">
                <div>
                  <dt>{t("device.target")}</dt>
                  <dd>{
                    preview.targetDisplayName ??
                    preview.targetId ??
                    t("device.unknown")
                  }</dd>
                </div>
                <div>
                  <dt>{t("advanced.provider")}</dt>
                  <dd>
                    <code>{preview.providerId}</code>
                  </dd>
                </div>
                <div>
                  <dt>{t("advanced.operation")}</dt>
                  <dd>
                    <code>{preview.operationType}</code>
                  </dd>
                </div>
                <div>
                  <dt>{t("safety.heading")}</dt>
                  <dd>
                    <code>{preview.executionAuthority}</code>
                  </dd>
                </div>
              </dl>

              <div className="log-row">
                <div>
                  <strong>{t("task.confirmTitle")}</strong>
                  <p>
                    <code>{preview.changeCodes.join(" · ")}</code>
                  </p>
                  <p>
                    <code>
                      {preview.verificationRequirements.join(" · ")}
                    </code>
                  </p>
                  <p>
                    <code>{preview.catalogContentDigest}</code>
                  </p>
                </div>
              </div>

              {preview.blockers.length > 0 ? (
                <div className="confirmation-preview is-blocked" role="status">
                  <strong>{t("task.blocked")}</strong>
                  <ul>
                    {preview.blockers.map((item) => (
                      <li key={item.code}>
                        <code>{item.code}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="confirmation-actions">
                {preview.status === "READY" ? (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={running}
                    onClick={() => void confirmPreview()}
                  >
                    {running ? t("task.mockRunning") : t("task.confirmAction")}
                  </button>
                ) : null}
                <a className="secondary-button" href={backHref}>
                  {t("task.cancelAction")}
                </a>
              </div>
            </div>
          ) : null}

          {displayedError !== null ? (
            <p role="alert">
              {t("task.mockError", {
                state: outcome?.state ?? "FAILED",
                message: translateOperationError(locale, displayedError),
              })}
            </p>
          ) : outcome?.verificationPassed === true ? (
            <p role="status">
              {t("task.mockVerified", {
                state: outcome.state,
                events: outcome.auditEventCount,
              })}
            </p>
          ) : outcome !== null ? (
            <p role="status">
              {t("task.mockNotVerified", { state: outcome.state })}
            </p>
          ) : null}
        </section>

        <section className="safety-callout" aria-live="polite">
          <div>
            <h2>{t("safety.readOnlyTitle")}</h2>
            <p>{t("safety.readOnlyDescription")}</p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>
          <strong>{t("footer.localFirst")}</strong>
          <span>{t("footer.noCloud")}</span>
        </div>
        <div className="footer-meta">
          <span>M3 · PREVIEW_BOUND_APPROVAL</span>
        </div>
      </footer>
    </div>
  );
}
