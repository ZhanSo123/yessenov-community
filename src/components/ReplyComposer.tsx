"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { type PostWithMeta } from "@/lib/post-types";
import { useI18n } from "@/lib/i18n/useI18n";

type ReplyComposerProps = {
  postId: number;
  onCreated?: (reply: PostWithMeta, tempId?: string) => void;
  onOptimistic?: (reply: PostWithMeta) => void;
  onFailed?: (tempId: string) => void;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export default function ReplyComposer({
  postId,
  onCreated,
  onOptimistic,
  onFailed,
  onCancel,
  inputRef,
}: ReplyComposerProps) {
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const isLoading = status === "loading";
  const isUnauthed = status === "unauthenticated";

  const handleSubmit = async () => {
    setError("");

    if (isLoading) {
      return;
    }

    if (isUnauthed) {
      setError(t("reply.error.sign_in"));
      return;
    }

    if (!content.trim()) {
      setError(t("reply.error.enter_text"));
      return;
    }

    const tempId = `temp:${Date.now()}`;
    const optimisticReply: PostWithMeta = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      replyToId: postId,
      author: {
        id: user?.id ?? "me",
        email: user?.email ?? null,
        username: user?.username ?? null,
        name: user?.name ?? null,
        displayName: user?.displayName ?? null,
        image: user?.image ?? null,
      },
      _count: { likes: 0, replies: 0 },
      viewerHasLiked: false,
      sending: true,
    };

    onOptimistic?.(optimisticReply);

    setSending(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, replyToId: postId }),
      });

      if (response.status === 401) {
        setError(t("reply.error.session_expired"));
        onFailed?.(tempId);
        return;
      }

      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; bannedUntil?: string; banReason?: string }
          | null;
        if (payload?.error === "BANNED") {
          const until = payload.bannedUntil
            ? new Date(payload.bannedUntil).toLocaleDateString()
            : t("common.unknown");
          const reason = payload.banReason
            ? ` ${t("common.reason", { reason: payload.banReason })}`
            : "";
          setError(t("reply.error.banned", { until, reason }));
        } else {
          setError(t("reply.error.forbidden"));
        }
        onFailed?.(tempId);
        return;
      }

      if (!response.ok) {
        setError(t("reply.error.send_failed"));
        onFailed?.(tempId);
        return;
      }

      const payload = (await response.json()) as { data?: PostWithMeta };
      if (!payload.data) {
        setError(t("reply.error.send_failed"));
        onFailed?.(tempId);
        return;
      }

      onCreated?.(payload.data, tempId);
      setContent("");
    } catch {
      setError(t("reply.error.send_failed"));
      onFailed?.(tempId);
    } finally {
      setSending(false);
    }
  };

  const localRef = useRef<HTMLTextAreaElement>(null);
  const resolvedRef = inputRef ?? localRef;

  return (
    <div className="rounded-2xl p-3 bubble-surface">
      <textarea
        ref={resolvedRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={500}
        className="min-h-[90px] w-full rounded-2xl px-3 py-2 text-sm bubble-input"
        placeholder={t("reply.placeholder")}
        disabled={isLoading || isUnauthed || sending}
      />
      {isLoading ? (
        <p className="mt-2 text-xs text-slate-500">{t("reply.loading")}</p>
      ) : null}
      {isUnauthed ? (
        <p className="mt-2 text-xs text-slate-500">{t("reply.sign_in")}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || isUnauthed || sending}
          className="bubble-btn-primary rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 pressable"
        >
          {sending ? t("reply.submitting") : t("reply.submit")}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs bubble-chip rounded-full px-3 py-1"
          >
            {t("reply.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
