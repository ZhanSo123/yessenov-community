"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";

import DevLoginButton from "@/components/DevLoginButton";
import { useI18n } from "@/lib/i18n/useI18n";
export default function AuthLoginPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen min-h-[100svh] bg-[color:var(--background)] text-[color:var(--foreground)]">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
        <header className="rounded-2xl p-4 bubble-surface sm:rounded-3xl sm:p-5 sm:bubble-surface-strong">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {t("auth.login.title")}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("auth.login.subtitle")}
          </p>
        </header>

        <div className="rounded-2xl p-5 bubble-surface sm:rounded-3xl sm:p-6">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold pressable"
          >
            {t("auth.login.google")}
          </button>
          <div className="mt-3">
            <DevLoginButton />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {t("auth.login.no_account")}{" "}
            <Link href="/welcome" className="underline">
              {t("auth.login.back_home")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
