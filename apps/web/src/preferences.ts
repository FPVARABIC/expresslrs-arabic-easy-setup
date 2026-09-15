/**
 * The one preference this application remembers between launches.
 *
 * The chosen language used to be React state and nothing else, so it reset to
 * Arabic on every load — including after an application update, which is the
 * case that matters: an operator halfway through a bench session should not
 * have to re-pick their language because a new candidate was installed.
 *
 * `localStorage` is the right place for exactly this and no more. It is
 * per-viewer, small, and losing it costs one tap. Anything whose loss costs a
 * device — the recovery package above all — goes to durable storage instead;
 * see `hardware/durable-recovery.ts`.
 */
import { supportedLocales, type Locale } from "@elrs-easy/i18n";

export const LOCALE_STORAGE_KEY = "elrs-easy:locale:v1" as const;

function storage(): Storage | null {
  try {
    // A private window, cleared site data, or a WebView configured to refuse
    // storage all make this throw rather than return null.
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (supportedLocales as readonly string[]).includes(value)
  );
}

/**
 * The stored language, or null when there is none this build understands.
 *
 * A value that is not a supported locale is treated as absent rather than
 * coerced: a stored string this build does not know would otherwise render an
 * interface in no language at all.
 */
export function readStoredLocale(): Locale | null {
  try {
    const stored = storage()?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Remembers the chosen language. A refusal to store is not worth reporting. */
export function writeStoredLocale(locale: Locale): void {
  try {
    storage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The interface still works in the chosen language for this session; only
    // the memory of it is lost, and there is nothing the operator can do about
    // a browser that refuses storage.
  }
}
