"use client";

import { useState } from "react";

type AppealButtonProps = {
  targetType: string;
  targetId: string;
  label?: string;
  className?: string;
};

export default function AppealButton({
  targetType,
  targetId,
  label = "Подать апелляцию",
  className,
}: AppealButtonProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  const handleAppeal = async () => {
    const reason = window
      .prompt("Причина апелляции (1-500 символов)")?.trim();

    if (!reason) {
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch("/api/appeals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  const statusLabel =
    status === "sent"
      ? "Отправлено"
      : status === "sending"
        ? "Отправляем..."
        : status === "error"
          ? "Ошибка"
          : label;

  return (
    <button
      type="button"
      onClick={handleAppeal}
      disabled={status === "sending" || status === "sent"}
      className={
        className ??
        "inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
      }
    >
      {statusLabel}
    </button>
  );
}
