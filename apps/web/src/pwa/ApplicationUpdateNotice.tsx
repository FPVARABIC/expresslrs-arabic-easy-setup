import { useEffect, useMemo, useState } from "react";
import {
  getApplicationUpdateCopy,
  type NetworkModeLocale,
} from "@elrs-easy/i18n";

import {
  registerSafeServiceWorker,
  type RegisterSafeServiceWorkerInput,
  type ServiceWorkerRegistrationOutcome,
} from "./register-service-worker";

type RegisterServiceWorker = (
  input: RegisterSafeServiceWorkerInput,
) => Promise<ServiceWorkerRegistrationOutcome>;

interface ApplicationUpdateNoticeProps {
  readonly enabled?: boolean;
  readonly register?: RegisterServiceWorker;
}

function readLocale(): NetworkModeLocale {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

/**
 * Reports a waiting application shell without activating it. The component has
 * no refresh/activate action, so a newly installed worker cannot replace the
 * current session while a future sensitive workflow is in progress.
 */
export function ApplicationUpdateNotice({
  enabled = import.meta.env.PROD,
  register = registerSafeServiceWorker,
}: ApplicationUpdateNoticeProps) {
  const [available, setAvailable] = useState(false);
  const [locale, setLocale] = useState(readLocale);
  const copy = useMemo(() => getApplicationUpdateCopy(locale), [locale]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let mounted = true;
    const startRegistration = () => {
      void register({
        onWaiting() {
          if (mounted) {
            setAvailable(true);
          }
        },
      }).catch(() => {
        // A host integration failure stays a silent fixed failure outcome.
      });
    };

    if (document.readyState === "complete") {
      startRegistration();
    } else {
      window.addEventListener("load", startRegistration, { once: true });
    }

    return () => {
      mounted = false;
      window.removeEventListener("load", startRegistration);
    };
  }, [enabled, register]);

  useEffect(() => {
    const localeObserver = new MutationObserver(() => setLocale(readLocale()));
    localeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
    return () => localeObserver.disconnect();
  }, []);

  if (!available) {
    return null;
  }

  return (
    <div className="application-update-notice" role="status" aria-live="polite">
      <strong>{copy.title}</strong>
      <span>{copy.description}</span>
    </div>
  );
}
