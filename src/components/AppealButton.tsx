"use client";

import { useState } from "react";

import { useI18n } from "@/lib/i18n/useI18n";

type AppealButtonProps = {
  targetType: string;
  targetId: string;
  label?: string;
  className?: string;
};

export default function AppealButton({
  targetType,
  targetId,
  label,
  className,
}: AppealButtonProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const fallbackLabel = label ?? t("appeal.label");

  const handleAppeal = async () => {
    const reason = window.prompt(t("appeal.prompt"))?.trim();

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
      ? t("appeal.sent")
      : status === "sending"
        ? t("appeal.sending")
        : status === "error"
          ? t("appeal.error")
          : fallbackLabel;

  return (
    <button
      type="button"
      onClick={handleAppeal}
      disabled={status === "sending" || status === "sent"}
      className={
        className ??
        "bubble-btn inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-60 pressable"
      }
    >
      {statusLabel}
    </button>
  );
}
