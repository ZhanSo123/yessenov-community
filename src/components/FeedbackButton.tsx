"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export default function FeedbackButton() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (status !== "authenticated") {
    return null;
  }

  const handleSubmit = async () => {
    setError("");

    if (!message.trim()) {
      setError("Напишите пару слов.");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          currentPath: pathname ?? "/",
          createdAt: new Date().toISOString(),
          userId: session?.user?.id ?? null,
        }),
      });

      if (!response.ok) {
        setError("Не удалось отправить. Попробуйте позже.");
        setSending(false);
        return;
      }

      setSent(true);
      setMessage("");
    } catch {
      setError("Не удалось отправить. Попробуйте позже.");
    } finally {
      setSending(false);
    }
  };

  const closeModal = () => {
    setOpen(false);
    setError("");
    setSending(false);
    setSent(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError("");
          setSent(false);
          setMessage("");
        }}
        className="bubble-btn fixed bottom-5 right-5 z-40 rounded-full px-4 py-2 text-xs font-semibold pressable"
      >
        Оставить фидбек
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Что было неудобно?
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Мы читаем всё, спасибо.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Закрыть
              </button>
            </div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
              className="mt-4 min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Опишите проблему или идею..."
              disabled={sending}
            />
            {error ? (
              <p className="mt-2 text-xs text-rose-600">{error}</p>
            ) : null}
            {sent ? (
              <p className="mt-2 text-xs text-emerald-600">
                Отправлено. Спасибо!
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {message.length}/1000
              </span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={sending}
                className="bubble-btn-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 pressable"
              >
                {sending ? "Отправляем..." : "Отправить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
