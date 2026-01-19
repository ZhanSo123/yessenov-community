"use client";

import { useEffect, useMemo, useState } from "react";

type AppealItem = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: "OPEN" | "APPROVED" | "DENIED";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  user: { id: string; email: string; username: string | null; name: string | null };
  resolvedBy: { id: string; email: string; username: string | null; name: string | null } | null;
  targetPost?: { id: number; content: string; author: { username: string | null; name: string | null } } | null;
  targetUser?: { id: string; email: string; username: string | null; role: string } | null;
};

type AppealsResponse = {
  data?: AppealItem[];
  nextCursor?: string | null;
};

export default function AdminAppealsPage() {
  const [status, setStatus] = useState("OPEN");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("desc");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAppeals = async (options?: { reset?: boolean; cursor?: string }) => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/admin/appeals", window.location.origin);
      url.searchParams.set("status", status);
      if (query.trim()) {
        url.searchParams.set("query", query.trim());
      }
      url.searchParams.set("sort", sort);
      if (fromDate) {
        url.searchParams.set("from", fromDate);
      }
      if (toDate) {
        url.searchParams.set("to", toDate);
      }
      if (options?.cursor) {
        url.searchParams.set("cursor", options.cursor);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить апелляции");
      }

      const payload = (await response.json()) as AppealsResponse;
      const incoming = payload.data ?? [];

      if (options?.reset) {
        setAppeals(incoming);
      } else {
        setAppeals((current) => [...current, ...incoming]);
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
    loadAppeals({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const resolveAppeal = async (id: string, nextStatus: "APPROVED" | "DENIED") => {
    const note = window.prompt("Комментарий (опционально)") ?? undefined;

    const response = await fetch(`/api/admin/appeals/${id}/resolve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, note: note?.trim() || undefined }),
    });

    if (!response.ok) {
      setError("Не удалось обновить апелляцию");
      return;
    }

    setAppeals((current) =>
      current.map((appeal) =>
        appeal.id === id
          ? { ...appeal, status: nextStatus, resolvedAt: new Date().toISOString() }
          : appeal
      )
    );
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loading,
    [nextCursor, loading]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Апелляции</h1>
        <p className="text-sm text-slate-600">
          Запросы на пересмотр блокировок или скрытий.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {["OPEN", "APPROVED", "DENIED"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            className={`rounded-full border px-4 py-1 text-xs font-semibold ${
              status === item
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {item}
          </button>
        ))}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по причине/пользователю"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="desc">Сначала новые</option>
          <option value="asc">Сначала старые</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => loadAppeals({ reset: true })}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

      <div className="space-y-3">
        {appeals.map((appeal) => (
          <div
            key={appeal.id}
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 px-2 py-0.5">
                {appeal.status}
              </span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5">
                {appeal.targetType}
              </span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5">
                Target #{appeal.targetId}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-800">{appeal.reason}</p>
            <p className="mt-1 text-xs text-slate-500">
              Автор апелляции: {appeal.user.username ?? appeal.user.email}
            </p>
            {appeal.targetPost ? (
              <p className="mt-1 text-xs text-slate-500">
                Пост: {appeal.targetPost.content.slice(0, 120)}
              </p>
            ) : null}
            {appeal.targetUser ? (
              <p className="mt-1 text-xs text-slate-500">
                Пользователь: {appeal.targetUser.username ?? appeal.targetUser.email}
              </p>
            ) : null}
            {appeal.status === "OPEN" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => resolveAppeal(appeal.id, "APPROVED")}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => resolveAppeal(appeal.id, "DENIED")}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
                >
                  Deny
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => loadAppeals({ cursor: nextCursor })}
          disabled={!canLoadMore}
          className="rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
        >
          {loading ? "Загружаем..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
