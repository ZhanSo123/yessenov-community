"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/lib/i18n/useI18n";

type NotificationActor = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
};

type NotificationItem = {
  id: string;
  type: "REPLY" | "LIKE" | "FOLLOW" | "MENTION";
  postId: number | null;
  replyId: number | null;
  createdAt: string;
  readAt: string | null;
  actor: NotificationActor | null;
};

type NotificationsResponse = {
  data?: NotificationItem[];
  nextCursor?: string | null;
  error?: string;
};

type UnreadCountResponse = {
  data?: { count: number };
  error?: string;
};

export default function NotificationsClient() {
  const router = useRouter();
  const { t } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [listRes, countRes] = await Promise.all([
          fetch("/api/notifications", { credentials: "include" }),
          fetch("/api/notifications/unread-count", { credentials: "include" }),
        ]);

        if (!listRes.ok) {
          throw new Error(t("common.error_load"));
        }

        const listPayload = (await listRes.json()) as NotificationsResponse;
        const countPayload = (await countRes.json()) as UnreadCountResponse;

        if (active) {
          setItems(listPayload.data ?? []);
          setUnreadCount(countPayload.data?.count ?? 0);
        }
      } catch (fetchError) {
        if (active) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t("common.error_load")
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
  }, []);

  const markReadOptimistic = (id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id && !item.readAt
          ? { ...item, readAt: new Date().toISOString() }
          : item
      )
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const handleRowClick = async (item: NotificationItem) => {
    if (!item.readAt) {
      markReadOptimistic(item.id);
      try {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
      } catch {
        // ignore
      }
    }

    if (item.postId) {
      router.push(`/p/${item.postId}`);
    }
  };

  const handleMarkAll = async () => {
    if (markingAll || unreadCount === 0) {
      return;
    }
    setMarkingAll(true);
    setItems((current) =>
      current.map((item) =>
        item.readAt ? item : { ...item, readAt: new Date().toISOString() }
      )
    );
    setUnreadCount(0);

    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const emptyState = useMemo(
    () =>
      !loading && !error && items.length === 0
        ? t("notifications.empty")
        : "",
    [error, items.length, loading, t]
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">{t("notifications.title")}</h1>
            <p className="text-sm text-slate-500">
              {t("notifications.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={markingAll || unreadCount === 0}
            className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 pressable"
          >
            {t("notifications.mark_all")}
          </button>
        </header>

        {loading ? (
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {emptyState ? (
          <p className="text-sm text-slate-500">{emptyState}</p>
        ) : null}

        <section className="space-y-3">
          {items.map((item) => {
            const isUnread = !item.readAt;
            const actorName =
              item.actor?.displayName ||
              (item.actor?.username ? `@${item.actor.username}` : "@user");
            const avatarInitial = actorName
              .replace("@", "")
              .slice(0, 1)
              .toUpperCase();
            const actorHandle = item.actor?.username
              ? `@${item.actor.username}`
              : "@user";
            const buildMessage = () => {
              switch (item.type) {
                case "REPLY":
                  return t("notifications.reply", { actor: actorHandle });
                case "LIKE":
                  return t("notifications.like", { actor: actorHandle });
                case "FOLLOW":
                  return t("notifications.follow", { actor: actorHandle });
                case "MENTION":
                  return t("notifications.mention", { actor: actorHandle });
                default:
                  return t("notifications.default");
              }
            };
            const formatRelativeTime = (value: string) => {
              const createdAt = new Date(value);
              if (Number.isNaN(createdAt.getTime())) {
                return t("post.just_now");
              }
              const diffMs = Date.now() - createdAt.getTime();
              if (diffMs < 0) {
                return t("post.just_now");
              }
              const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
              if (diffMinutes < 60) {
                return t("post.minutes_ago", { count: diffMinutes });
              }
              const diffHours = Math.floor(diffMinutes / 60);
              if (diffHours < 24) {
                return t("post.hours_ago", { count: diffHours });
              }
              if (diffHours < 48) {
                return t("post.yesterday");
              }
              const diffDays = Math.floor(diffHours / 24);
              return t("post.days_ago", { count: diffDays });
            };

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleRowClick(item)}
                className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                  isUnread
                    ? "border-slate-300 bg-white"
                    : "border-slate-200 bg-white/70"
                } hover:border-slate-300`}
              >
                {item.actor?.image ? (
                  <img
                    src={item.actor.image}
                    alt={actorName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                    {avatarInitial || "U"}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-sm text-slate-800">{buildMessage()}</p>
                  <span className="text-xs text-slate-400">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
                {isUnread ? (
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                ) : null}
              </button>
            );
          })}
        </section>
      </main>
    </div>
  );
}
