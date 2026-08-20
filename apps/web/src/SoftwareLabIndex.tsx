import { useEffect, useMemo, useState } from "react";
import {
  createTranslator,
  defaultLocale,
  getDirection,
  type Locale,
} from "@elrs-easy/i18n";

import { buildApplicationViewHref } from "./view-model/applicationView";

export function SoftwareLabIndex() {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const direction = getDirection(locale);
  const defaultHref = buildApplicationViewHref(
    window.location.href,
    "DEFAULT",
  );
  const bindingHref = buildApplicationViewHref(
    window.location.href,
    "BINDING_PREVIEW",
  );
  const firmwareHref = buildApplicationViewHref(
    window.location.href,
    "FIRMWARE_PREVIEW",
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.title = `${t("status.mockBadge")} · SIMULATION_ONLY`;
  }, [direction, locale, t]);

  return (
    <div className="app-shell" dir={direction}>
      <a className="skip-link" href="#software-lab-index-main">
        {t("navigation.skip")}
      </a>

      <header className="topbar">
        <a className="brand" href={defaultHref} aria-label={t("app.name")}>
          <span className="brand-copy">
            <strong>{t("app.shortName")}</strong>
            <small>{t("app.independent")}</small>
          </span>
        </a>

        <div className="topbar-actions">
          <span className="status-pill status-pill-safe">
            {t("status.mockBadge")} · SIMULATION_ONLY
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

      <main className="main-content" id="software-lab-index-main">
        <section className="hero" aria-labelledby="software-lab-index-heading">
          <div className="hero-copy">
            <span className="eyebrow">M5 · SOFTWARE_LABS</span>
            <h1 id="software-lab-index-heading">{t("status.mockBadge")}</h1>
            <p>{t("task.previewOnly")}</p>
          </div>
          <aside className="safety-card">
            <div>
              <h2>{t("safety.heading")}</h2>
              <p>{t("task.previewOnly")}</p>
            </div>
          </aside>
        </section>

        <section
          className="software-lab-index-grid"
          aria-label={`${t("status.mockBadge")} · SIMULATION_ONLY`}
        >
          <article className="software-lab-index-card">
            <div className="software-lab-index-card-header">
              <span className="software-lab-navigation-badge">
                SIMULATION_ONLY
              </span>
              <code>M3 · PREVIEW_BOUND_APPROVAL</code>
            </div>
            <h2>{t("task.bind.title")}</h2>
            <p>{t("task.previewOnly")}</p>
            <ul>
              <li>
                <code>BINDING_RELATIONSHIP_WILL_CHANGE</code>
              </li>
              <li>
                <code>RECONNECT · REIDENTIFY · LINK_ESTABLISHED</code>
              </li>
            </ul>
            <a className="primary-button" href={bindingHref}>
              {t("task.bind.title")}
            </a>
          </article>

          <article className="software-lab-index-card">
            <div className="software-lab-index-card-header">
              <span className="software-lab-navigation-badge">
                SIMULATION_ONLY
              </span>
              <code>M4 · PROVENANCE_BOUND_APPROVAL</code>
            </div>
            <h2>{t("task.update.title")}</h2>
            <p>{t("task.update.description")}</p>
            <ul>
              <li>
                <code>ArtifactProvenance · SHA-256 · COMPATIBILITY</code>
              </li>
              <li>
                <code>REBOOT · RECONNECT · EXACT_VERSION</code>
              </li>
            </ul>
            <a className="primary-button" href={firmwareHref}>
              {t("task.update.title")}
            </a>
          </article>
        </section>

        <section className="safety-callout" aria-live="polite">
          <div>
            <h2>{t("safety.heading")}</h2>
            <p>{t("task.previewOnly")}</p>
          </div>
          <a className="secondary-button" href={defaultHref}>
            {t("task.cancelAction")}
          </a>
        </section>
      </main>

      <footer className="footer">
        <div>
          <strong>{t("footer.localFirst")}</strong>
          <span>{t("footer.noCloud")}</span>
        </div>
        <div className="footer-meta">
          <span>M5 · LINKS_ONLY · NO_PROVIDER_IMPORT</span>
        </div>
      </footer>
    </div>
  );
}
