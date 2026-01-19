"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import AppealButton from "@/components/AppealButton";

type FollowButtonProps = {
  username: string;
  initialFollowing: boolean;
};

export default function FollowButton({
  username,
  initialFollowing,
}: FollowButtonProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [banInfo, setBanInfo] = useState<{
    bannedUntil?: string;
    banReason?: string;
  } | null>(null);

  const isUnauthed = status === "unauthenticated";
  const isLoading = status === "loading";
  const isOnboarded = Boolean(session?.user?.hasOnboarded);

  const handleToggle = async () => {
    setMessage("");

    if (isUnauthed) {
      setMessage("Войдите, чтобы подписаться.");
      return;
    }

    if (!isOnboarded) {
      router.push("/onboarding");
      return;
    }

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
          setBanInfo({
            bannedUntil: payload.bannedUntil,
            banReason: payload.banReason,
          });
        } else if (payload?.error === "ONBOARDING_REQUIRED") {
          router.push("/onboarding");
          return;
        } else {
          setMessage("Доступ запрещён.");
        }
        return;
      }

      if (!response.ok) {
        setMessage("Не удалось обновить подписку.");
        return;
      }

      const payload = (await response.json()) as {
        data?: { following: boolean };
      };
      setFollowing(Boolean(payload.data?.following));
    } catch {
      setMessage("Не удалось обновить подписку.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading || loading || !isOnboarded}
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Обновляем..." : following ? "Отписаться" : "Подписаться"}
      </button>
      {!isUnauthed && !isOnboarded ? (
        <p className="text-xs text-slate-500">
          Завершите онбординг, чтобы подписываться.
        </p>
      ) : null}
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
      {banInfo && status === "authenticated" && session?.user?.id ? (
        <AppealButton
          targetType="USER_BAN"
          targetId={session.user.id}
          label="Подать апелляцию"
          className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
        />
      ) : null}
    </div>
  );
}
