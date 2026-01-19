"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function AuthLoginPage() {
  const [tab, setTab] = useState<"email" | "phone" | "google">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async () => {
    setError("");
    setLoading(true);
    const normalizedIdentifier = identifier.trim().toLowerCase();
    try {
      await signIn("credentials", {
        redirect: true,
        callbackUrl: "/",
        identifier: normalizedIdentifier,
        password,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Вход</h1>
          <p className="text-sm text-slate-600">
            Войдите, чтобы продолжить.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "email", label: "Email и пароль" },
              { id: "phone", label: "Телефон (скоро)" },
              { id: "google", label: "Google" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as typeof tab)}
                className={`rounded-full px-4 py-1 text-xs font-semibold ${
                  tab === item.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          ) : null}

          {tab === "email" ? (
            <div className="mt-6 space-y-4">
              <label className="block text-xs font-semibold text-slate-600">
                Email или username
                <input
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="you@example.com или username"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Пароль
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="••••••••"
                />
              </label>
              <button
                type="button"
                onClick={handleEmailLogin}
                disabled={loading}
                className="w-full rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? "Входим..." : "Войти"}
              </button>
              <p className="text-xs text-slate-500">
                Нет аккаунта?{" "}
                <Link href="/auth/register" className="underline">
                  Создать аккаунт
                </Link>
              </p>
            </div>
          ) : null}

          {tab === "phone" ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Телефонный вход будет доступен позже.
            </div>
          ) : null}

          {tab === "google" ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="w-full rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm"
              >
                Продолжить с Google
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
