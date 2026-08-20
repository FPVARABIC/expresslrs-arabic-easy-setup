import { useEffect, useMemo, useState } from "react";
import {
  createTranslator,
  defaultLocale,
  type Locale,
} from "@elrs-easy/i18n";

import { buildApplicationViewHref } from "./view-model/applicationView";

function documentLocale(): Locale {
  return document.documentElement.lang === "en" ? "en" : defaultLocale;
}

/**
 * A links-only launcher for the normal application. It does not import a Mock
 * provider, prepare an operation, or select a sensitive execution route.
 */
export function SoftwareLabLauncher() {
  const [locale, setLocale] = useState<Locale>(documentLocale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const href = buildApplicationViewHref(
    window.location.href,
    "SOFTWARE_LABS",
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setLocale(documentLocale());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      className="software-lab-launcher"
      aria-label={`${t("status.mockBadge")} · SIMULATION_ONLY`}
    >
      <a className="software-lab-launcher-link" href={href}>
        <span className="software-lab-navigation-badge">SIMULATION_ONLY</span>
        <strong>{t("status.mockBadge")}</strong>
        <small>{t("task.previewOnly")}</small>
      </a>
    </nav>
  );
}
