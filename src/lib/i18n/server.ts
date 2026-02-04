import { cookies, headers } from "next/headers";

import { interpolateMessage } from "./format";
import {
  defaultLocale,
  isLocale,
  localeCookieKey,
  type Locale,
} from "./config";
import { messages, type MessageKey } from "./messages";

const parseAcceptLanguage = (value: string | null) => {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim().split(";")[0])
    .map((part) => part.split("-")[0])
    .filter(Boolean);
};

export const getServerLocale = async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(localeCookieKey)?.value ?? "";
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }

  const headerList = await headers();
  const accepted = parseAcceptLanguage(headerList.get("accept-language"));
  for (const lang of accepted) {
    if (isLocale(lang)) {
      return lang;
    }
  }

  return defaultLocale;
};

export const getServerTranslator = async () => {
  const locale = await getServerLocale();
  const dict = messages[locale] ?? messages[defaultLocale];
  const t = (
    key: MessageKey,
    params?: Record<string, string | number | undefined>
  ) => interpolateMessage(dict, key, params);
  return { t, locale };
};
