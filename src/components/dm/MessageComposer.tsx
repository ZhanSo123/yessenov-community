"use client";

import { useState } from "react";

type MessageComposerProps = {
  onSend: (content: string) => Promise<boolean> | boolean;
  disabled?: boolean;
};

export default function MessageComposer({
  onSend,
  disabled = false,
}: MessageComposerProps) {
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
      className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
    >
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Напишите сообщение..."
        rows={3}
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      />
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{trimmed.length} / 1000</span>
        <button
          type="submit"
          disabled={!isValid || sending || disabled}
          className="bubble-btn-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 pressable"
        >
          {sending ? "Отправляем..." : "Отправить"}
        </button>
      </div>
    </form>
  );
}
