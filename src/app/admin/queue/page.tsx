"use client";

import { useEffect, useMemo, useState } from "react";

type QueueItem =
  | ({
      type: "report";
      id: string;
      status: "OPEN" | "RESOLVED" | "REJECTED";
      reason: string;
      category?: string | null;
      severity?: number | null;
      createdAt: string;
      post: { id: number; content: string; deletedAt: string | null };
      reporter: { email: string; username: string | null };
    })
  | ({
      type: "auto";
      id: string;
      action: string;
      targetType: string;
      targetId: string;
      reason: string;
      metadata?: Record<string, unknown> | null;
      createdAt: string;
    })
  | ({
      type: "user";
      id: string;
      email: string;
      username: string | null;
      role: string;
      bannedUntil: string | null;
      banReason: string | null;
    })
  | ({
      type: "post";
      id: number;
      content: string;
      createdAt: string;
      deletedAt?: string | null;
      maxSeverity?: number;
      author: { username: string | null; name: string | null };
    });

type QueueResponse = {
  data?: QueueItem[];
  nextCursor?: string | null;
};

type BulkAction =
  | "POST_DELETE"
  | "POST_RESTORE"
  | "USER_BAN"
  | "USER_UNBAN"
  | "REPORT_RESOLVE"
  | "REPORT_REJECT";

const actionLabels: Record<BulkAction, string> = {
  POST_DELETE: "Скрыть посты",
  POST_RESTORE: "Восстановить посты",
  USER_BAN: "Бан пользователей",
  USER_UNBAN: "Разбан пользователей",
  REPORT_RESOLVE: "Решить жалобы",
  REPORT_REJECT: "Отклонить жалобы",
};

export default function AdminQueuePage() {
  const [filter, setFilter] = useState<
    "all" | "report" | "user" | "post" | "auto"
  >(
    "all"
  );
  const [items, setItems] = useState<QueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Record<string, QueueItem>>({});
  const [bulkAction, setBulkAction] = useState<BulkAction>("POST_DELETE");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadQueue = async (options?: { reset?: boolean; cursor?: string }) => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/admin/queue", window.location.origin);
      if (options?.cursor) {
        url.searchParams.set("cursor", options.cursor);
      }
      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить очередь");
      }

      const payload = (await response.json()) as QueueResponse;
      const incoming = payload.data ?? [];

      if (options?.reset) {
        setItems(incoming);
      } else {
        setItems((current) => [...current, ...incoming]);
      }
      setNextCursor(payload.nextCursor ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleItems = items.filter((item) =>
    filter === "all" ? true : item.type === filter
  );

  const toggleSelect = (item: QueueItem) => {
    const key = `${item.type}:${item.id}`;
    setSelected((current) => {
      const next = { ...current };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = item;
      }
      return next;
    });
  };

  const applyBulk = async () => {
    setError("");

    const selectedItems = Object.values(selected);
    if (selectedItems.length === 0) {
      setError("Ничего не выбрано.");
      return;
    }

    if (
      (bulkAction === "POST_DELETE" || bulkAction === "USER_BAN") &&
      !reason.trim()
    ) {
      setError("Нужна причина для действия.");
      return;
    }

    if (
      (bulkAction === "POST_DELETE" || bulkAction === "USER_BAN") &&
      !window.confirm("Подтвердите массовое действие.")
    ) {
      return;
    }

    setActionLoading(true);

    const ids = selectedItems
      .filter((item) => {
        if (
          (bulkAction === "POST_DELETE" || bulkAction === "POST_RESTORE") &&
          item.type === "post"
        ) {
          return true;
        }
        if (
          (bulkAction === "USER_BAN" || bulkAction === "USER_UNBAN") &&
          item.type === "user"
        ) {
          return true;
        }
        if (
          (bulkAction === "REPORT_RESOLVE" ||
            bulkAction === "REPORT_REJECT") &&
          item.type === "report"
        ) {
          return true;
        }
        return false;
      })
      .map((item) => item.id);

    if (ids.length === 0) {
      setError("Нет подходящих элементов для выбранного действия.");
      return;
    }

    try {
      const response = await fetch("/api/admin/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkAction,
          ids,
          reason: reason.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });

      if (!response.ok) {
        setError("Не удалось выполнить bulk action.");
        return;
      }

      setSelected({});
      setReason("");
      setNote("");
      loadQueue({ reset: true });
    } catch {
      setError("Не удалось выполнить bulk action.");
    } finally {
      setActionLoading(false);
    }
  };

  const resolveReport = async (reportId: string, status: "RESOLVED" | "REJECTED") => {
    const noteValue =
      window.prompt("Комментарий (опционально)")?.trim() || undefined;
    const response = await fetch(`/api/admin/reports/${reportId}/resolve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: noteValue }),
    });

    if (!response.ok) {
      setError("Не удалось обновить жалобу.");
      return;
    }

    loadQueue({ reset: true });
  };

  const unbanUser = async (userId: string) => {
    if (!window.confirm("Разбанить пользователя?")) {
      return;
    }
    const response = await fetch(`/api/admin/users/${userId}/unban`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      setError("Не удалось разбанить пользователя.");
      return;
    }
    loadQueue({ reset: true });
  };

  const shadowbanUser = async (userId: string) => {
    const reasonValue = window.prompt("Причина shadowban (обязательно)") ?? "";
    if (!reasonValue.trim()) {
      setError("Нужна причина для shadowban.");
      return;
    }
    const response = await fetch(`/api/admin/users/${userId}/shadowban`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reasonValue.trim() }),
    });
    if (!response.ok) {
      setError("Не удалось применить shadowban.");
      return;
    }
    loadQueue({ reset: true });
  };

  const deletePost = async (postId: number) => {
    const reasonValue = window.prompt("Причина удаления (обязательно)") ?? "";
    if (!reasonValue.trim()) {
      setError("Нужна причина для удаления.");
      return;
    }
    if (!window.confirm("Подтвердите удаление поста.")) {
      return;
    }
    const response = await fetch(`/api/admin/posts/${postId}/delete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reasonValue.trim() }),
    });
    if (!response.ok) {
      setError("Не удалось скрыть пост.");
      return;
    }
    loadQueue({ reset: true });
  };

  const restorePost = async (postId: number) => {
    if (!window.confirm("Восстановить пост?")) {
      return;
    }
    const response = await fetch(`/api/admin/posts/${postId}/restore`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      setError("Не удалось восстановить пост.");
      return;
    }
    loadQueue({ reset: true });
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loading,
    [nextCursor, loading]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Очередь модерации</h1>
        <p className="text-sm text-slate-600">
          Объединённый список задач, требующих внимания.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: "Все" },
          { id: "report", label: "Жалобы" },
          { id: "auto", label: "Auto" },
          { id: "user", label: "Пользователи" },
          { id: "post", label: "Посты" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as typeof filter)}
            className={`${filter === tab.id ? "bubble-btn-primary" : "bubble-btn"} rounded-full px-4 py-1 text-xs font-semibold pressable`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => loadQueue({ reset: true })}
          className="bubble-btn rounded-full px-4 py-1 text-xs font-semibold pressable"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkAction}
            onChange={(event) =>
              setBulkAction(event.target.value as BulkAction)
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {Object.entries(actionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Причина (обязательно для delete/ban)"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Комментарий (опционально)"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={applyBulk}
            disabled={actionLoading}
            className="bubble-btn-primary rounded-xl px-4 py-2 text-sm font-semibold pressable"
          >
            {actionLoading ? "Применяем..." : "Применить"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleItems.map((item) => {
          const key = `${item.type}:${item.id}`;
          const checked = Boolean(selected[key]);

          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSelect(item)}
                className="mt-1 h-4 w-4"
              />
              <div className="flex-1">
                {item.type === "report" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 px-2 py-0.5">
                        Report
                      </span>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5">
                        {item.status}
                      </span>
                      {"category" in item && item.category ? (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5">
                          {item.category}
                        </span>
                      ) : null}
                      {item.severity ? (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5">
                          Severity {item.severity}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-800">{item.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Пост #{item.post.id} ·{" "}
                      {item.post.content.slice(0, 120)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => resolveReport(item.id, "RESOLVED")}
                        className="bubble-btn-primary rounded-full px-3 py-1 text-xs font-semibold pressable"
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveReport(item.id, "REJECTED")}
                        className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                ) : null}

                {item.type === "auto" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 px-2 py-0.5">
                        AUTO
                      </span>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5">
                        {item.action}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-800">
                      {item.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Target: {item.targetType} #{item.targetId}
                    </p>
                  </>
                ) : null}

                {item.type === "user" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 px-2 py-0.5">
                        User
                      </span>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5">
                        {item.role}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-800">
                      {item.username ?? item.email}
                    </p>
                    {item.banReason ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Причина: {item.banReason}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => unbanUser(item.id)}
                        className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
                      >
                        Unban
                      </button>
                      <button
                        type="button"
                        onClick={() => shadowbanUser(item.id)}
                        className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
                      >
                        Shadowban
                      </button>
                    </div>
                  </>
                ) : null}

                {item.type === "post" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 px-2 py-0.5">
                        Post
                      </span>
                      {item.maxSeverity ? (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5">
                          Severity {item.maxSeverity}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-800">
                      {item.content.slice(0, 140) || "Репост"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.deletedAt ? (
                        <button
                          type="button"
                          onClick={() => restorePost(item.id)}
                          className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => deletePost(item.id)}
                          className="bubble-btn-primary rounded-full px-3 py-1 text-xs font-semibold pressable"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => loadQueue({ cursor: nextCursor })}
          disabled={!canLoadMore}
          className="bubble-btn rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 pressable"
        >
          {loading ? "Загружаем..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
