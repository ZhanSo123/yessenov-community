"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type InviteResponse = {
  ok?: boolean;
  error?: string;
};

export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/invite/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => null)) as
        | InviteResponse
        | null;
      if (!response.ok) {
        setError(payload?.error === "BAD_REQUEST" ? "Неверный код" : "Ошибка");
        return;
      }
      router.refresh();
      router.replace("/");
    } catch {
      setError("Не удалось проверить код");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-16">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Closed Beta
            </p>
            <h1 className="text-2xl font-semibold">Проект в закрытом тесте</h1>
            <p className="text-sm text-slate-600">
              Введите код приглашения, чтобы продолжить.
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Код приглашения"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending}
              className="w-full rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {sending ? "Проверяем..." : "Продолжить"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
