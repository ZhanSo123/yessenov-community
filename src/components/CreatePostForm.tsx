"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { type PostWithMeta } from "@/lib/post-types";

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
      setError("Войдите, чтобы публиковать посты.");
      return;
    }

    if (!content.trim()) {
      setError("Напишите текст поста.");
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
        setError("Сессия истекла. Перезайдите.");
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
            : "неизвестно";
          const reason = payload.banReason ? ` Причина: ${payload.banReason}` : "";
          setError(`Вы заблокированы до ${until}.${reason}`);
        } else {
          setError("Доступ запрещён.");
        }
        onFailed?.(tempId);
        return;
      }

      if (!response.ok) {
        setError("Не удалось опубликовать пост.");
        onFailed?.(tempId);
        return;
      }

      const payload = (await response.json()) as { data?: PostWithMeta };
      if (!payload.data) {
        setError("Не удалось опубликовать пост.");
        onFailed?.(tempId);
        return;
      }

      onCreated(payload.data, tempId);
      setContent("");
    } catch {
      setError("Не удалось опубликовать пост.");
      onFailed?.(tempId);
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Новый пост</h2>
        {user ? (
          <span className="text-xs text-slate-500">
            Автор: {user.displayName ?? user.name ?? user.email ?? "Вы"}
          </span>
        ) : null}
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={500}
        className="mt-3 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        placeholder="Что нового?"
        disabled={isLoading || isUnauthed || posting}
      />
      {isLoading ? (
        <p className="mt-2 text-xs text-slate-500">Загрузка...</p>
      ) : null}
      {isUnauthed ? (
        <p className="mt-2 text-xs text-slate-500">Войдите, чтобы писать.</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isLoading || isUnauthed || posting}
        className="mt-3 inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {isLoading ? "Загрузка..." : posting ? "Публикуем..." : "Post"}
      </button>
    </section>
  );
}
