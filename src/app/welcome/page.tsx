"use client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";

import DevLoginButton from "@/components/DevLoginButton";


export default function WelcomePage() {
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
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-500 shadow-sm">
              Yessenov Community
            </div>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Добро пожаловать в студенческую соцсеть.
            </h1>
            <p className="max-w-xl text-sm text-slate-600">
              Делитесь идеями, ищите команду и следите за жизнью сообщества.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-lg">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Вход в сообщество</h2>
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
                disabled={!providersLoaded || googleDisabled}
                className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 pressable"
              >
                Войти через Google
              </button>
              <DevLoginButton />
              {error ? (
                <p className="text-xs text-rose-500">
                  Ошибка входа: {error}
                </p>
              ) : null}
              {googleDisabled ? (
                <p className="text-xs text-slate-500">
                  Google OAuth не настроен. Проверьте ключи в окружении.
                </p>
              ) : null}
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
