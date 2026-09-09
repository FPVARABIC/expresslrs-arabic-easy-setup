export type NetworkModeLocale = "ar" | "en";

export interface LimitedOfflineCopy {
  readonly title: string;
  readonly description: string;
}

export interface ApplicationUpdateCopy {
  readonly title: string;
  readonly description: string;
}

export interface ApplicationFailureCopy {
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

const applicationUpdateCopy: Readonly<
  Record<NetworkModeLocale, ApplicationUpdateCopy>
> = Object.freeze({
  ar: Object.freeze({
    title: "تحديث التطبيق جاهز",
    description:
      "سيُستخدم الإصدار الجديد بعد إغلاق التطبيق وفتحه من جديد. لن تتبدل النسخة أثناء العملية الحالية.",
  }),
  en: Object.freeze({
    title: "App update ready",
    description:
      "The new version will be used after the app is closed and opened again. The current session will not be replaced.",
  }),
});

const applicationFailureCopy: Readonly<
  Record<NetworkModeLocale, ApplicationFailureCopy>
> = Object.freeze({
  ar: Object.freeze({
    title: "تعذر عرض التطبيق",
    description:
      "أغلق هذه الصفحة وافتح التطبيق من جديد. إذا كانت عملية جارية فحالتها غير مؤكدة؛ تحقق من الجهاز قبل إعادة المحاولة.",
  }),
  en: Object.freeze({
    title: "The app could not be displayed",
    description:
      "Close this page and open the app again. If an operation was running, its state is uncertain; verify the device before retrying.",
  }),
});

export function getLimitedOfflineCopy(
  locale: NetworkModeLocale,
): LimitedOfflineCopy {
  return limitedOfflineCopy[locale];
}

export function getApplicationUpdateCopy(
  locale: NetworkModeLocale,
): ApplicationUpdateCopy {
  return applicationUpdateCopy[locale];
}

export function getApplicationFailureCopy(
  locale: NetworkModeLocale,
): ApplicationFailureCopy {
  return applicationFailureCopy[locale];
}
