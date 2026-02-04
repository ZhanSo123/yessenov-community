"use client";

import { useState } from "react";

import { localeLabels, locales, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/useI18n";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="bubble-btn rounded-full px-4 py-2 text-sm font-semibold pressable"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {t("settings.language.title")}: {localeLabels[locale]}
      </button>
      {open ? (
        <div
          className="absolute left-0 mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
          role="listbox"
        >
          {locales.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={locale === item}
              onClick={() => {
                setLocale(item as Locale);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                locale === item
                  ? "bg-[#6495ED]/10 text-[#6495ED]"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{localeLabels[item]}</span>
              {locale === item ? (
                <span className="text-xs font-semibold">•</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
