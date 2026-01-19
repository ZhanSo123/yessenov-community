"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import AppealButton from "@/components/AppealButton";
import { type PostWithMeta } from "@/lib/post-types";

type ReplyComposerProps = {
  postId: number;
  onCreated?: (reply: PostWithMeta, tempId?: string) => void;
  onOptimistic?: (reply: PostWithMeta) => void;
  onFailed?: (tempId: string) => void;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
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
  const router = useRouter();
  const user = session?.user ?? null;
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
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
      setError("Войдите, чтобы отвечать.");
      return;
    }

    if (!isOnboarded) {
      router.push("/onboarding");
      return;
    }

    if (!content.trim()) {
      setError("Введите ответ.");
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
        username: user?.username ?? null,
        name: user?.name ?? null,
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
        setError("Не удалось отправить ответ.");
        onFailed?.(tempId);
        return;
      }

      const payload = (await response.json()) as { data?: PostWithMeta };
      if (!payload.data) {
        setError("Не удалось отправить ответ.");
        onFailed?.(tempId);
        return;
      }

      onCreated?.(payload.data, tempId);
      setContent("");
    } catch {
      setError("Не удалось отправить ответ.");
      onFailed?.(tempId);
    } finally {
      setSending(false);
    }
  };

  const bannedUntil = banInfo?.bannedUntil;
  const localRef = useRef<HTMLTextAreaElement>(null);
  const resolvedRef = inputRef ?? localRef;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <textarea
        ref={resolvedRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={500}
        className="min-h-[90px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        placeholder="Ваш ответ"
        disabled={isLoading || isUnauthed || sending || !isOnboarded}
      />
      {isLoading ? (
        <p className="mt-2 text-xs text-slate-500">Загрузка...</p>
      ) : null}
      {isUnauthed ? (
        <p className="mt-2 text-xs text-slate-500">Войдите, чтобы отвечать.</p>
      ) : null}
      {!isUnauthed && !isOnboarded ? (
        <p className="mt-2 text-xs text-slate-500">
          Завершите онбординг, чтобы отвечать.
        </p>
      ) : null}
      {bannedUntil && user ? (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          <p>
            Вы заблокированы до{" "}
            {new Date(bannedUntil).toLocaleDateString()}.
          </p>
          <div className="mt-2">
            <AppealButton targetType="USER_BAN" targetId={user.id} />
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || isUnauthed || sending || !isOnboarded}
          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {sending ? "Отправляем..." : "Ответить"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-500"
          >
            Отмена
          </button>
        ) : null}
      </div>
    </div>
  );
}
