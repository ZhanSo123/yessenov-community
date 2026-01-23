"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

type FollowButtonProps = {
  username: string;
  initialFollowing: boolean;
};

export default function FollowButton({
  username,
  initialFollowing,
}: FollowButtonProps) {
  const { data: session, status } = useSession();
  const [following, setFollowing] = useState(initialFollowing);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isUnauthed = status === "unauthenticated";
  const isLoading = status === "loading";

  const handleToggle = async () => {
    setMessage("");

    if (isUnauthed) {
      setMessage("Войдите, чтобы подписаться.");
      return;
    }

    const previous = following;
    setFollowing(!previous);
    setLoading(true);
    try {
      const response = await fetch("/api/follow/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (response.status === 401) {
        setMessage("Сессия истекла. Перезайдите.");
        setFollowing(previous);
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
          setMessage(`Вы заблокированы до ${until}.${reason}`);
        } else {
          setMessage("Доступ запрещён.");
        }
        setFollowing(previous);
        return;
      }

      if (!response.ok) {
        setMessage("Не удалось обновить подписку.");
        setFollowing(previous);
        return;
      }

      const payload = (await response.json()) as {
        data?: { following: boolean };
      };
      setFollowing(Boolean(payload.data?.following));
    } catch {
      setMessage("Не удалось обновить подписку.");
      setFollowing(previous);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading || loading}
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Обновляем..." : following ? "Отписаться" : "Подписаться"}
      </button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
