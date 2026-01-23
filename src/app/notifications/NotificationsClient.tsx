"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

const formatRelativeTime = (value: string) => {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    return "только что";
  }
  const diffMs = Date.now() - createdAt.getTime();
  if (diffMs < 0) {
    return "только что";
  }
  const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (diffMinutes < 60) {
    return `${diffMinutes} мин назад`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ч назад`;
  }
  if (diffHours < 48) {
    return "вчера";
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} д назад`;
};

const buildMessage = (item: NotificationItem) => {
  const actorHandle = item.actor?.username
    ? `@${item.actor.username}`
    : "@user";

  switch (item.type) {
    case "REPLY":
      return `${actorHandle} ответил на ваш пост`;
    case "LIKE":
      return `${actorHandle} лайкнул ваш пост`;
    case "FOLLOW":
      return `${actorHandle} подписался на вас`;
    case "MENTION":
      return `${actorHandle} упомянул вас`;
    default:
      return "Новое уведомление";
  }
};

export default function NotificationsClient() {
  const router = useRouter();
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
          throw new Error("Не удалось загрузить уведомления.");
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
              : "Ошибка загрузки"
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
        ? "Пока тихо. Когда кто-то ответит или лайкнет — появится здесь."
        : "",
    [error, items.length, loading]
  );

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Уведомления</h1>
            <p className="text-sm text-slate-500">
              Новые ответы, лайки и упоминания.
            </p>
          </div>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={markingAll || unreadCount === 0}
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отметить всё прочитанным
          </button>
        </header>

        {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}
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
                  <p className="text-sm text-slate-800">{buildMessage(item)}</p>
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
