export const SUPPORTED_LOCALES = ["fa", "en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "fa";
export const LOCALE_COOKIE_NAME = "locale";
export const LOCALE_STORAGE_KEY = "mohaimen-locale";

export function isSupportedLocale(value: string): value is AppLocale {
  const normalized = normalizeLocaleCandidate(value);
  return normalized === "fa" || normalized === "en";
}

export function resolveLocale(value?: string | null): AppLocale {
  if (!value) return DEFAULT_LOCALE;

  const normalized = normalizeLocaleCandidate(value);
  if (normalized === "fa" || normalized.startsWith("fa-")) return "fa";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";

  return DEFAULT_LOCALE;
}

export function getLocaleDirection(locale: AppLocale): "rtl" | "ltr" {
  return locale === "fa" ? "rtl" : "ltr";
}

export function localeToIntlTag(locale: AppLocale) {
  return locale === "fa" ? "fa-IR" : "en-US";
}

function normalizeLocaleCandidate(value: string) {
  return value.trim().toLowerCase().replace(/_/g, "-");
}
