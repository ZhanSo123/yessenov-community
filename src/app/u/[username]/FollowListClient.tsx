"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useI18n } from "@/lib/i18n/useI18n";
type FollowUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  isFriend: boolean;
  isFollowing: boolean;
};

type FollowListResponse = {
  items?: FollowUser[];
  nextCursor?: string | null;
  error?: string;
};

type ToggleResponse = {
  data?: { following: boolean; isFriend: boolean };
  error?: string;
};

type FollowListClientProps = {
  username: string;
  mode: "followers" | "following";
};

export default function FollowListClient({ username, mode }: FollowListClientProps) {
  const { data: session, status } = useSession();
  const { t } = useI18n();
  const viewerId = session?.user?.id ?? null;
  const isUnauthed = status === "unauthenticated";

  const [items, setItems] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/users/${username}/${mode}`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(t("profile.overlay.error"));
        }

        const payload = (await response.json()) as FollowListResponse;
        if (active) {
          setItems(payload.items ?? []);
        }
      } catch (fetchError) {
        if (active) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t("profile.error.load_generic")
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [mode, username]);

  const handleToggle = async (item: FollowUser) => {
    if (isUnauthed || !item.username) {
      return;
    }

    const prevFollowing = item.isFollowing;
    const prevIsFriend = item.isFriend;

    setItems((current) =>
      current.map((user) =>
        user.id === item.id
          ? {
              ...user,
              isFollowing: !prevFollowing,
              isFriend: prevFollowing ? false : user.isFriend,
            }
          : user
      )
    );

    try {
      const response = await fetch("/api/follow/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: item.username }),
      });

      if (!response.ok) {
        throw new Error("failed");
      }

      const payload = (await response.json()) as ToggleResponse;
      const nextFollowing = Boolean(payload.data?.following);
      const nextIsFriend = Boolean(payload.data?.isFriend);

      setItems((current) =>
        current.map((user) =>
          user.id === item.id
            ? { ...user, isFollowing: nextFollowing, isFriend: nextIsFriend }
            : user
        )
      );
    } catch {
      setItems((current) =>
        current.map((user) =>
          user.id === item.id
            ? { ...user, isFollowing: prevFollowing, isFriend: prevIsFriend }
            : user
        )
      );
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header>
          <h1 className="text-3xl font-semibold">
            {mode === "followers"
              ? t("profile.overlay.followers")
              : t("profile.overlay.following")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">@{username}</p>
        </header>

        {loading ? (
          <p className="text-sm text-slate-500">{t("profile.overlay.loading")}</p>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="space-y-3">
          {items.map((item) => {
            const displayName =
              item.displayName || item.username || t("common.user");
            const handle = item.username ? `@${item.username}` : "@user";
            const isSelf = viewerId && item.id === viewerId;
            const canToggle = Boolean(item.username);
            const label = isUnauthed
              ? t("user_search.action.sign_in")
              : item.isFriend
              ? t("profile.overlay.friends")
              : item.isFollowing
              ? t("profile.overlay.following_state")
              : t("profile.overlay.follow");

            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={displayName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                      {(displayName || t("common.user"))
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-500">{handle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.isFriend ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                      {t("profile.overlay.friends")}
                    </span>
                  ) : null}
                  {!isSelf ? (
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      disabled={isUnauthed || !canToggle}
                      className="bubble-btn rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 pressable"
                    >
                      {label}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
