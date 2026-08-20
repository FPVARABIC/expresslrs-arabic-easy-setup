import { ar } from "./locales/ar";
import { en } from "./locales/en";
import type { MessageKey } from "./locales/en";

export type { MessageKey } from "./locales/en";
export type Locale = "ar" | "en";
export type Direction = "rtl" | "ltr";
export type TranslationParameters = Readonly<Record<string, string | number>>;

export const defaultLocale: Locale = "ar";
export const fallbackLocale: Locale = "en";
export const supportedLocales = ["ar", "en"] as const;

const catalog: Readonly<Record<Locale, Partial<Record<MessageKey, string>>>> = {
  ar,
  en
};

export function getDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

export function translate(
  locale: Locale,
  key: MessageKey,
  parameters: TranslationParameters = {}
): string {
  const template = catalog[locale][key] ?? catalog[fallbackLocale][key] ?? key;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) => {
    const value = parameters[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function createTranslator(locale: Locale) {
  return (key: MessageKey, parameters?: TranslationParameters): string =>
    translate(locale, key, parameters);
}
