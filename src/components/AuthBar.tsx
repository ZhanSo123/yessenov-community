"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProviders, signIn, signOut, useSession } from "next-auth/react";

export default function AuthBar() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const label = user?.name ?? user?.email ?? "Пользователь";
  const [hasGoogleProvider, setHasGoogleProvider] = useState(true);
  const [providersLoaded, setProvidersLoaded] = useState(false);

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

  const googleMissing = providersLoaded && !hasGoogleProvider;
  const canSignIn = providersLoaded && hasGoogleProvider;

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Добро пожаловать!</p>
          <p className="text-xs text-slate-600">
            {status === "loading"
              ? "Проверяем сессию..."
              : status === "authenticated"
              ? `Вы вошли как ${label}`
              : googleMissing
              ? "Google OAuth не настроен. Используйте email/пароль."
              : "Войдите в аккаунт, чтобы публиковать"}
          </p>
        </div>

        {status === "authenticated" ? (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Выйти
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/welcome"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Войти
            </Link>
            <button
              type="button"
              onClick={() => signIn("google")}
              disabled={!canSignIn || status === "loading"}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Google
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
