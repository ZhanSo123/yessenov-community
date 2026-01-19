"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";

type RegisterResponse = {
  ok?: boolean;
  suggestedUsername?: string;
  error?: string;
};

export default function AuthRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    setError("");
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          name: name.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | RegisterResponse
        | null;

      if (!response.ok) {
        if (payload?.error === "RATE_LIMIT") {
          setError("Слишком много попыток. Попробуйте позже.");
        } else {
          setError("Не удалось зарегистрироваться.");
        }
        return;
      }

      await signIn("credentials", {
        redirect: true,
        callbackUrl: "/",
        identifier: normalizedEmail,
        password,
      });
    } catch {
      setError("Не удалось зарегистрироваться.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Создать аккаунт</h1>
          <p className="text-sm text-slate-600">
            Заполните базовые данные — профиль настроим дальше.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-600">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Пароль
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Минимум 8 символов"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Имя (опционально)
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Ваше имя"
              />
            </label>
            <button
              type="button"
              onClick={handleRegister}
              disabled={loading}
              className="w-full rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Создаём..." : "Создать аккаунт"}
            </button>
            <p className="text-xs text-slate-500">
              Уже есть аккаунт?{" "}
              <Link href="/auth/login" className="underline">
                Войти
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
