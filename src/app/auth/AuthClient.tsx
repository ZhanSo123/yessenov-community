"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

import DevLoginButton from "@/components/DevLoginButton";
export default function AuthClient() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessage =
    error === "OAuthAccountNotLinked"
      ? "Этот email уже используется с другим способом входа."
      : error === "CredentialsSignin"
        ? "Неверный email или пароль."
        : error === "RATE_LIMIT" || error === "RateLimit"
          ? "Слишком много попыток. Попробуйте позже."
          : error
            ? "Не удалось войти. Попробуйте снова."
            : "";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-500 shadow-sm">
              Yessenov Community
            </div>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Вход в студенческую соцсеть.
            </h1>
            <p className="max-w-xl text-sm text-slate-600">
              Делитесь идеями, находите команду для проектов и следите за
              обновлениями сообщества.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-lg">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Начать</h2>
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
                  Войти
                </Link>
                <Link
                  href="/auth/register"
                  className="bubble-btn rounded-full px-5 py-3 text-center text-sm font-semibold pressable"
                >
                  Создать аккаунт
                </Link>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                или
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold pressable"
              >
                Продолжить с Google
              </button>
              <DevLoginButton />
              <p className="text-xs text-slate-500">
                Регистрируясь, вы соглашаетесь с правилами сообщества.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
