"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProviders, signIn, signOut, useSession } from "next-auth/react";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type ThemeMode,
} from "@/lib/theme/theme";

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const { t } = useI18n();
  const label =
    user?.displayName ?? user?.name ?? user?.email ?? t("common.user");
  const [hasGoogleProvider, setHasGoogleProvider] = useState(true);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    let active = true;

    getProviders()
      .then((providers) => {
        if (!active) {
          return;
        }
        setHasGoogleProvider(Boolean(providers?.google));
        setProvidersLoaded(true);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setHasGoogleProvider(false);
        setProvidersLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored) {
      setTheme(stored);
    }
  }, []);

  const googleMissing = providersLoaded && !hasGoogleProvider;
  const canSignIn = providersLoaded && hasGoogleProvider;

  const handleThemeChange = (next: ThemeMode) => {
    setTheme(next);
    setStoredTheme(next);
    applyTheme(next);
  };

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
        <header>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {t("settings.title")}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {t("settings.subtitle")}
          </p>
        </header>

        <section className="bubble-surface rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <h2 className="text-base font-semibold text-[color:var(--foreground)]">
            {t("settings.account.title")}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {status === "loading"
              ? t("settings.account.checking")
              : status === "authenticated"
              ? t("settings.account.signed_in_as", { label })
              : googleMissing
              ? t("settings.account.google_missing")
              : t("settings.account.sign_in_to_post")}
          </p>

          {status === "authenticated" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/settings/profile"
                className="bubble-btn rounded-full px-4 py-2 text-sm font-semibold pressable"
              >
                {t("settings.actions.profile")}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/welcome" })}
                className="bubble-btn-primary rounded-full px-4 py-2 text-sm font-semibold pressable"
              >
                {t("settings.actions.sign_out")}
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/welcome"
                className="bubble-btn-primary rounded-full px-4 py-2 text-sm font-semibold pressable"
              >
                {t("settings.actions.sign_in")}
              </Link>
              <button
                type="button"
                onClick={() => signIn("google")}
                disabled={!canSignIn || status === "loading"}
                className="bubble-btn rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 pressable"
              >
                {t("settings.actions.google")}
              </button>
            </div>
          )}
        </section>

        <section className="bubble-surface rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <h2 className="text-base font-semibold text-[color:var(--foreground)]">
            {t("settings.language.title")}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {t("settings.language.subtitle")}
          </p>
          <div className="mt-4">
            <LanguageSwitcher />
          </div>
        </section>

        <section className="bubble-surface rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <h2 className="text-base font-semibold text-[color:var(--foreground)]">
            {t("settings.theme.title")}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {t("settings.theme.subtitle")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              className={`rounded-full px-4 py-2 text-sm font-semibold pressable ${
                theme === "light"
                  ? "bubble-btn-primary"
                  : "bubble-btn"
              }`}
            >
              {t("settings.theme.light")}
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              className={`rounded-full px-4 py-2 text-sm font-semibold pressable ${
                theme === "dark"
                  ? "bubble-btn-primary"
                  : "bubble-btn"
              }`}
            >
              {t("settings.theme.dark")}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
