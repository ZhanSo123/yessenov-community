"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { useI18n } from "@/lib/i18n/useI18n";

export default function FeedbackButton() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { t } = useI18n();
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
      setError(t("feedback.error.empty"));
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
        setError(t("feedback.error.send_failed"));
        setSending(false);
        return;
      }

      setSent(true);
      setMessage("");
    } catch {
      setError(t("feedback.error.send_failed"));
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
        {t("feedback.title")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl p-4 bubble-surface sm:p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {t("feedback.question")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("feedback.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                {t("feedback.close")}
              </button>
            </div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
              className="bubble-input mt-4 min-h-[140px] w-full rounded-xl px-3 py-2 text-sm text-[color:var(--foreground)]"
              placeholder={t("feedback.placeholder")}
              disabled={sending}
            />
            {error ? (
              <p className="mt-2 text-xs text-rose-600">{error}</p>
            ) : null}
            {sent ? (
              <p className="mt-2 text-xs text-emerald-600">
                {t("feedback.sent")}
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
                {sending ? t("feedback.sending") : t("feedback.send")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
