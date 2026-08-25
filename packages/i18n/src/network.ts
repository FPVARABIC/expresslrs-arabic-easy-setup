export type NetworkModeLocale = "ar" | "en";

export interface LimitedOfflineCopy {
  readonly title: string;
  readonly description: string;
}

const limitedOfflineCopy: Readonly<
  Record<NetworkModeLocale, LimitedOfflineCopy>
> = Object.freeze({
  ar: Object.freeze({
    title: "وضع محدود بدون إنترنت",
    description:
      "قد تبقى بعض الوظائف المحلية المحفوظة متاحة. تنزيل التحديثات والبيانات الجديدة من الإنترنت غير متاح حاليًا.",
  }),
  en: Object.freeze({
    title: "Limited offline mode",
    description:
      "Some saved local functions may remain available. New internet updates and metadata are currently unavailable.",
  }),
});

export function getLimitedOfflineCopy(
  locale: NetworkModeLocale,
): LimitedOfflineCopy {
  return limitedOfflineCopy[locale];
}
