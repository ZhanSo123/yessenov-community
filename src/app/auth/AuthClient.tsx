"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

import DevLoginButton from "@/components/DevLoginButton";
import { useI18n } from "@/lib/i18n/useI18n";
export default function AuthClient() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const { t } = useI18n();

  const errorMessage =
    error === "OAuthAccountNotLinked"
      ? t("auth.error.oauth_account_not_linked")
      : error === "CredentialsSignin"
        ? t("auth.error.credentials")
        : error === "RATE_LIMIT" || error === "RateLimit"
          ? t("auth.error.rate_limit")
          : error
            ? t("auth.error.default")
            : "";

  return (
    <div className="min-h-screen min-h-[100svh] bg-[color:var(--background)] text-[color:var(--foreground)]">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-20 pt-16 sm:px-6">
        <section className="grid gap-8 sm:gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-500 bubble-chip">
              {t("common.app_name")}
            </div>
            <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">
              {t("auth.title")}
            </h1>
            <p className="max-w-xl text-sm text-slate-600">
              {t("auth.subtitle")}
            </p>
          </div>

          <div className="rounded-2xl p-5 bubble-surface sm:rounded-3xl sm:p-6 sm:bubble-surface-strong">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{t("auth.card.title")}</h2>
              {errorMessage ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {errorMessage}
                </div>
              ) : null}
              <div className="grid gap-3">
                <Link
                  href="/auth/login"
                  className="bubble-btn-primary rounded-full px-5 py-3 text-center text-sm font-semibold pressable"
                >
                  {t("auth.actions.sign_in")}
                </Link>
                <Link
                  href="/auth/register"
                  className="bubble-btn rounded-full px-5 py-3 text-center text-sm font-semibold pressable"
                >
                  {t("auth.actions.register")}
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
                className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold pressable"
              >
                {t("auth.actions.google")}
              </button>
              <DevLoginButton />
              <p className="text-xs text-slate-500">
                {t("auth.terms")}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
