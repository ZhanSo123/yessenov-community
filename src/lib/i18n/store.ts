import {
  defaultLocale,
  isLocale,
  localeCookieKey,
  localeStorageKey,
  type Locale,
} from "./config";
let currentLocale: Locale = defaultLocale;

const readCookieLocale = () => {
  if (typeof document === "undefined") {
    return null;
  }
  const cookieValue = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${localeCookieKey}=`))
    ?.split("=")[1];
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }
  return null;
};

export const readLocale = (): Locale => {
  if (typeof document === "undefined") {
    return currentLocale;
  }
  const stored = window.localStorage.getItem(localeStorageKey);
  if (stored && isLocale(stored)) {
    currentLocale = stored;
    return stored;
  }
  const cookieLocale = readCookieLocale();
  if (cookieLocale) {
    currentLocale = cookieLocale;
    return cookieLocale;
  }
  const htmlLang = document.documentElement.getAttribute("lang") || "";
  if (htmlLang && isLocale(htmlLang)) {
    currentLocale = htmlLang;
    return htmlLang;
  }
  const navLang = navigator.language?.split("-")[0] ?? "";
  if (navLang && isLocale(navLang)) {
    currentLocale = navLang;
    return navLang;
  }
  return currentLocale;
};

export const writeLocale = (locale: Locale) => {
  currentLocale = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    window.localStorage.setItem(localeStorageKey, locale);
    document.cookie = `${localeCookieKey}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }
};

export const getLocale = () => currentLocale;

export const setLocale = (locale: Locale) => {
  writeLocale(locale);
};
