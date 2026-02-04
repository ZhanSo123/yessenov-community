"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";

import DevLoginButton from "@/components/DevLoginButton";
import { useI18n } from "@/lib/i18n/useI18n";
export default function AuthRegisterPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="rounded-3xl p-5 bubble-surface-strong">
          <h1 className="text-3xl font-semibold">{t("auth.register.title")}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("auth.register.subtitle")}
          </p>
        </header>

        <div className="rounded-3xl p-6 bubble-surface">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold pressable"
          >
            {t("auth.register.google")}
          </button>
          <div className="mt-3">
            <DevLoginButton />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {t("auth.register.have_account")}{" "}
            <Link href="/auth/login" className="underline">
              {t("auth.register.sign_in")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
