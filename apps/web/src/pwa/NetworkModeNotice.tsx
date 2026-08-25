import { useEffect, useMemo, useState } from "react";
import {
  getLimitedOfflineCopy,
  type NetworkModeLocale,
} from "@elrs-easy/i18n";

function readLocale(): NetworkModeLocale {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

function readOnline(): boolean {
  return navigator.onLine !== false;
}

/**
 * Stays absent while normal connectivity is available. When the browser
 * reports offline, it explains the limited mode without blocking local-device
 * access; navigator.onLine is not treated as proof that a local device is
 * unreachable.
 */
export function NetworkModeNotice() {
  const [online, setOnline] = useState(readOnline);
  const [locale, setLocale] = useState(readLocale);
  const copy = useMemo(() => getLimitedOfflineCopy(locale), [locale]);

  useEffect(() => {
    const updateOnline = () => setOnline(readOnline());
    const localeObserver = new MutationObserver(() => setLocale(readLocale()));

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    localeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      localeObserver.disconnect();
    };
  }, []);

  if (online) {
    return null;
  }

  return (
    <div className="limited-offline-notice" role="status" aria-live="polite">
      <strong>{copy.title}</strong>
      <span>{copy.description}</span>
    </div>
  );
}
