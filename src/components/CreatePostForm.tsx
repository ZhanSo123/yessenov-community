"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import AppealButton from "@/components/AppealButton";
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
  const router = useRouter();
  const user = session?.user ?? null;
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const [banInfo, setBanInfo] = useState<{
    bannedUntil?: string;
    banReason?: string;
  } | null>(null);

  const isLoading = status === "loading";
  const isUnauthed = status === "unauthenticated";
  const isOnboarded = Boolean(user?.hasOnboarded);

  const handleSubmit = async () => {
    setError("");

    if (isLoading) {
      return;
    }

    if (isUnauthed) {
      setError("Войдите, чтобы публиковать посты.");
      return;
    }

    if (!isOnboarded) {
      router.push("/onboarding");
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
        username: user?.username ?? null,
        name: user?.name ?? null,
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
          setBanInfo({
            bannedUntil: payload.bannedUntil,
            banReason: payload.banReason,
          });
        } else if (payload?.error === "ONBOARDING_REQUIRED") {
          router.push("/onboarding");
          onFailed?.(tempId);
          return;
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

  const shadowBannedAt = user?.shadowBannedAt
    ? new Date(user.shadowBannedAt)
    : null;
  const bannedUntil = banInfo?.bannedUntil ?? user?.bannedUntil ?? null;
  const banReason = banInfo?.banReason ?? user?.banReason ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Новый пост</h2>
        {user ? (
          <span className="text-xs text-slate-500">
            Автор: {user.username ?? user.name ?? user.email ?? "Вы"}
          </span>
        ) : null}
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={500}
        className="mt-3 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        placeholder="Что нового?"
        disabled={isLoading || isUnauthed || posting || !isOnboarded}
      />
      {shadowBannedAt ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <p>
            Ваш аккаунт в режиме shadowban с{" "}
            {shadowBannedAt.toLocaleDateString()}.
          </p>
          <div className="mt-2">
            {user ? (
              <AppealButton
                targetType="USER_SHADOWBAN"
                targetId={user.id}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {bannedUntil ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <p>
            Вы заблокированы до{" "}
            {new Date(bannedUntil).toLocaleDateString()}
            {banReason ? ` · Причина: ${banReason}` : ""}.
          </p>
          <div className="mt-2">
            {user ? (
              <AppealButton targetType="USER_BAN" targetId={user.id} />
            ) : null}
          </div>
        </div>
      ) : null}
      {isLoading ? (
        <p className="mt-2 text-xs text-slate-500">Загрузка...</p>
      ) : null}
      {isUnauthed ? (
        <p className="mt-2 text-xs text-slate-500">
          Войдите, чтобы публиковать посты.
        </p>
      ) : null}
      {!isUnauthed && !isOnboarded ? (
        <p className="mt-2 text-xs text-slate-500">
          Завершите онбординг, чтобы публиковать посты.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isLoading || isUnauthed || posting || !isOnboarded}
        className="mt-3 inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {isLoading ? "Загрузка..." : posting ? "Публикуем..." : "Post"}
      </button>
    </section>
  );
}
