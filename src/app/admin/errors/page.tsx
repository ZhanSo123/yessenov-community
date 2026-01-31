"use client";

import { useEffect, useMemo, useState } from "react";

type ErrorLog = {
  id: string;
  level: string;
  message: string;
  route: string | null;
  method: string | null;
  status: number | null;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  resolvedAt: string | null;
  metadata: Record<string, unknown> | null;
};

type ErrorResponse = {
  data?: ErrorLog[];
  nextCursor?: string | null;
};

export default function AdminErrorsPage() {
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadLogs = async (options?: { reset?: boolean; cursor?: string }) => {
    if (loading) {
      return;
    }
    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/admin/errors", window.location.origin);
      url.searchParams.set("status", status);
      if (query.trim()) {
        url.searchParams.set("query", query.trim());
      }
      if (options?.cursor) {
        url.searchParams.set("cursor", options.cursor);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Не удалось загрузить логи");
      }
      const payload = (await response.json()) as ErrorResponse;
      const incoming = payload.data ?? [];
      if (options?.reset) {
        setLogs(incoming);
      } else {
        setLogs((current) => [...current, ...incoming]);
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
    loadLogs({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleFilter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadLogs({ reset: true });
  };

  const handleResolve = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/errors/${id}/resolve`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Не удалось закрыть");
      }
      setLogs((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, resolvedAt: new Date().toISOString() }
            : item
        )
      );
    } catch (resolveError) {
      setError(
        resolveError instanceof Error ? resolveError.message : "Ошибка"
      );
    }
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loading,
    [nextCursor, loading]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Ошибки</h1>
        <p className="text-sm text-slate-600">
          Серверные ошибки и сбои API.
        </p>
      </header>

      <form onSubmit={handleFilter} className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по тексту/маршруту"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="open">Открытые</option>
          <option value="resolved">Решённые</option>
        </select>
        <button
          type="submit"
          className="bubble-btn-primary rounded-xl px-4 py-2 text-sm font-semibold pressable"
        >
          Фильтр
        </button>
      </form>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/90">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Meta</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100">
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {log.status ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {log.method ? `${log.method} ` : ""}
                  {log.route ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{log.message}</div>
                  {log.userId ? (
                    <div className="text-xs text-slate-400">
                      user: {log.userId}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {log.metadata ? JSON.stringify(log.metadata) : "—"}
                </td>
                <td className="px-4 py-3">
                  {log.resolvedAt ? (
                    <span className="text-xs text-slate-400">Resolved</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleResolve(log.id)}
                      className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
                    >
                      Закрыть
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => loadLogs({ cursor: nextCursor })}
          disabled={!canLoadMore}
          className="bubble-btn rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 pressable"
        >
          {loading ? "Загружаем..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
