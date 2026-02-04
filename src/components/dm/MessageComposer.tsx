"use client";

import { useState } from "react";

import { useI18n } from "@/lib/i18n/useI18n";

type MessageComposerProps = {
  onSend: (content: string) => Promise<boolean> | boolean;
  disabled?: boolean;
};

export default function MessageComposer({
  onSend,
  disabled = false,
}: MessageComposerProps) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const trimmed = content.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= 1000;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || sending || disabled) {
      return;
    }

    setSending(true);
    try {
      const ok = await onSend(trimmed);
      if (ok) {
        setContent("");
      }
    } finally {
      setSending(false);
    }
  };

    return (
    <form
      onSubmit={handleSubmit}
      className="bubble-surface flex flex-col gap-2 rounded-2xl p-4"
    >
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={t("dm.message.placeholder")}
        rows={3}
        className="bubble-input w-full resize-none rounded-xl px-3 py-2 text-sm text-[color:var(--foreground)] outline-none transition"
      />
      <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
        <span>{trimmed.length} / 1000</span>
        <button
          type="submit"
          disabled={!isValid || sending || disabled}
          className="bubble-btn-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 pressable"
        >
          {sending ? t("dm.message.sending") : t("dm.message.send")}
        </button>
      </div>
    </form>
  );
}
