"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { defaultLocale, localeLabels, type Locale } from "./config";
import { messages, type MessageKey } from "./messages";
import { interpolateMessage } from "./format";
import { readLocale, setLocale } from "./store";

export type Translator = {
  t: (key: MessageKey, params?: Record<string, string | number | undefined>) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  localeLabel: string;
};

export const useI18n = (): Translator => {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const initial = readLocale();
    setLocaleState(initial);
    setLocale(initial);
  }, []);

  const setLocaleSafe = useCallback((next: Locale) => {
    setLocale(next);
    setLocaleState(next);
  }, []);

  const dict = useMemo(() => messages[locale] ?? messages[defaultLocale], [locale]);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number | undefined>) =>
      interpolateMessage(dict, key, params),
    [dict]
  );

  return {
    t,
    locale,
    setLocale: setLocaleSafe,
    localeLabel: localeLabels[locale] ?? localeLabels[defaultLocale],
  };
};
