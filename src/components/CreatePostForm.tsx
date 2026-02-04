"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { type PostWithMeta } from "@/lib/post-types";
import { useI18n } from "@/lib/i18n/useI18n";

type CreatePostFormProps = {
  onCreated: (post: PostWithMeta, tempId?: string) => void;
  onOptimistic?: (post: PostWithMeta) => void;
  onFailed?: (tempId: string) => void;
};

export default function CreatePostForm({
  onCreated,
  onOptimistic,
  onFailed,
}: CreatePostFormProps) {
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  const isLoading = status === "loading";
  const isUnauthed = status === "unauthenticated";
  const isOnboarded = user?.hasOnboarded !== false;

  if (!isLoading && !isUnauthed && !isOnboarded) {
    return null;
  }

  const handleSubmit = async () => {
    setError("");

    if (isLoading) {
      return;
    }

    if (isUnauthed) {
      setError(t("create_form.error.sign_in"));
      return;
    }

    if (!content.trim()) {
      setError(t("create_form.error.enter_text"));
      return;
    }

    const tempId = `temp:${Date.now()}`;
    const optimisticPost: PostWithMeta = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      replyToId: null,
      author: {
        id: user?.id ?? "me",
        email: user?.email ?? null,
        username: user?.username ?? null,
        name: user?.name ?? null,
        displayName: user?.displayName ?? null,
        image: user?.image ?? null,
      },
      _count: {
        likes: 0,
        replies: 0,
      },
      viewerHasLiked: false,
      viewCount: 0,
      sending: true,
    };

    onOptimistic?.(optimisticPost);

    setPosting(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (response.status === 401) {
        setError(t("create_form.error.session_expired"));
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
          setError(t("create_form.error.banned", { until, reason }));
        } else {
          setError(t("create_form.error.forbidden"));
        }
        onFailed?.(tempId);
        return;
      }

      if (!response.ok) {
        setError(t("create_form.error.send_failed"));
        onFailed?.(tempId);
        return;
      }

      const payload = (await response.json()) as { data?: PostWithMeta };
      if (!payload.data) {
        setError(t("create_form.error.send_failed"));
        onFailed?.(tempId);
        return;
      }

      onCreated(payload.data, tempId);
      setContent("");
    } catch {
      setError(t("create_form.error.send_failed"));
      onFailed?.(tempId);
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="rounded-2xl p-4 bubble-surface sm:rounded-3xl sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("create_form.title")}
        </h2>
        {user ? (
          <span className="text-xs text-slate-500">
            {t("create_form.author", {
              name: user.displayName ?? user.name ?? user.email ?? t("common.user"),
            })}
          </span>
        ) : null}
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={500}
        className="mt-3 min-h-[120px] w-full rounded-2xl px-4 py-3 text-sm bubble-input"
        placeholder={t("create_form.placeholder")}
        disabled={isLoading || isUnauthed || posting}
      />
      {isLoading ? (
        <p className="mt-2 text-xs text-slate-500">{t("create_form.loading")}</p>
      ) : null}
      {isUnauthed ? (
        <p className="mt-2 text-xs text-slate-500">{t("create_form.sign_in")}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isLoading || isUnauthed || posting}
        className="mt-4 inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold bubble-btn-primary disabled:opacity-60"
      >
        {isLoading
          ? t("create_form.loading")
          : posting
            ? t("create_form.submitting")
            : t("create_form.submit")}
      </button>
    </section>
  );
}
