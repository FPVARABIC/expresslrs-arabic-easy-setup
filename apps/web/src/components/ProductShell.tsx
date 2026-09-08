import { useEffect, useRef, useState } from "react";
import {
  createTranslator,
  defaultLocale,
  getDirection,
  supportedLocales,
  type Locale,
} from "@elrs-easy/i18n";

import { EasySetup } from "./EasySetup";
import { ExpressLrsParityWorkbench } from "./ExpressLrsParityWorkbench";
import type { HardwareDriverConnector } from "../hardware/userSession";

export interface ProductShellProps {
  readonly initialLocale?: Locale;
  readonly initialMode?: "easy" | "advanced";
  /** Injected only by tests; production always uses the real Web Serial path. */
  readonly hardwareConnector?: HardwareDriverConnector;
}

/**
 * The public entry point. Easy Mode is the default; the technical workbench is
 * reachable only by an explicit user choice. Both are presentations over the
 * same device services, and neither is given device-write authority: the
 * workbench is mounted with no props, so its default-locked write prop governs
 * the public build. Naming that prop here would be a policy change, and
 * `scripts/check-physical-acceptance-package.mjs` fails the build if this
 * module mentions it at all.
 */
export function ProductShell({
  initialLocale = defaultLocale,
  initialMode = "easy",
  hardwareConnector,
}: ProductShellProps = {}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [mode, setMode] = useState<"easy" | "advanced">(initialMode);
  const t = createTranslator(locale);
  const mainRef = useRef<HTMLElement | null>(null);
  const modeChangedRef = useRef(false);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  // A mode switch replaces the whole view, so move focus to the new content
  // rather than leaving it on a button that no longer describes the page.
  useEffect(() => {
    if (modeChangedRef.current) mainRef.current?.focus();
    modeChangedRef.current = true;
  }, [mode]);

  return (
    <div className="product-shell">
      <a className="skip-link" href="#product-main">
        {t("navigation.skip")}
      </a>

      <header className="product-header">
        <p className="product-name">{t("app.name")}</p>
        <nav className="product-controls" aria-label={t("language.switch")}>
          <div
            className="mode-switch"
            role="group"
            aria-label={t("mode.advancedHint")}
          >
            <button
              type="button"
              onClick={() => setMode("easy")}
              aria-pressed={mode === "easy"}
            >
              {t("mode.easy")}
            </button>
            <button
              type="button"
              onClick={() => setMode("advanced")}
              aria-pressed={mode === "advanced"}
            >
              {t("mode.advanced")}
            </button>
          </div>
          <div className="language-switch" role="group">
            {supportedLocales.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                aria-pressed={locale === value}
                lang={value}
              >
                {value === "ar" ? t("language.arabic") : t("language.english")}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main id="product-main" ref={mainRef} tabIndex={-1}>
        {mode === "easy" ? (
          <EasySetup
            locale={locale}
            onOpenAdvanced={() => setMode("advanced")}
            {...(hardwareConnector === undefined ? {} : { hardwareConnector })}
          />
        ) : (
          <>
            <button
              type="button"
              className="easy-advanced"
              onClick={() => setMode("easy")}
            >
              {t("easy.easyCta")}
            </button>
            <ExpressLrsParityWorkbench />
          </>
        )}
      </main>

      <footer className="product-footer">
        <p>{t("app.independent")}</p>
      </footer>
    </div>
  );
}
