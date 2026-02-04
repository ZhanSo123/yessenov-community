export const locales = ["ru", "en", "kk"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ru";
export const localeCookieKey = "yc_locale";
export const localeStorageKey = "yc:locale";

export const localeLabels: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша",
};

export const isLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);
