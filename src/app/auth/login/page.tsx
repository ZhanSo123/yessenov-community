"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";

import DevLoginButton from "@/components/DevLoginButton";
export default function AuthLoginPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Вход</h1>
          <p className="text-sm text-slate-600">
            Продолжите через Google.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold pressable"
          >
            Войти через Google
          </button>
          <div className="mt-3">
            <DevLoginButton />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Нет аккаунта?{" "}
            <Link href="/welcome" className="underline">
              На главную
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
