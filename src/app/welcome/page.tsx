"use client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";

import DevLoginButton from "@/components/DevLoginButton";
import { useI18n } from "@/lib/i18n/useI18n";


export default function WelcomePage() {
  const { t } = useI18n();
  const [hasGoogleProvider, setHasGoogleProvider] = useState(true);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

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

  const googleDisabled = providersLoaded && !hasGoogleProvider;

  return (
    <div className="min-h-screen text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 pb-20 pt-16">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-500 bubble-chip">
              {t("common.app_name")}
            </div>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              {t("welcome.title")}
            </h1>
            <p className="max-w-xl text-sm text-slate-600">
              {t("welcome.subtitle")}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full px-3 py-1 bubble-chip">
                {t("welcome.highlight.feed")}
              </span>
              <span className="rounded-full px-3 py-1 bubble-chip">
                {t("welcome.highlight.communities")}
              </span>
              <span className="rounded-full px-3 py-1 bubble-chip">
                {t("welcome.highlight.messages")}
              </span>
            </div>
          </div>

          <div className="rounded-3xl p-6 bubble-surface-strong">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{t("welcome.card.title")}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("welcome.card.subtitle")}
                </p>
              </div>
              <div className="grid gap-3">
                <Link
                  href="/auth/login"
                  className="bubble-btn-primary rounded-full px-5 py-3 text-center text-sm font-semibold pressable"
                >
                  {t("welcome.actions.sign_in")}
                </Link>
                <Link
                  href="/auth/register"
                  className="bubble-btn rounded-full px-5 py-3 text-center text-sm font-semibold pressable"
                >
                  {t("welcome.actions.register")}
                </Link>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                {t("common.or")}
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/" })}
                disabled={!providersLoaded || googleDisabled}
                className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 pressable"
              >
                {t("welcome.actions.google")}
              </button>
              <DevLoginButton />
              {error ? (
                <p className="text-xs text-rose-500">
                  {t("welcome.error", { error })}
                </p>
              ) : null}
              {googleDisabled ? (
                <p className="text-xs text-slate-500">
                  {t("welcome.google_missing")}
                </p>
              ) : null}
              <p className="text-xs text-slate-500">
                {t("welcome.terms")}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
