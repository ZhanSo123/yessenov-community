"use client";

import { useEffect, useMemo, useState } from "react";

type AuditItem = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; email: string; username: string | null; name: string | null };
};

type AuditResponse = {
  data?: AuditItem[];
  nextCursor?: string | null;
};

export default function AdminAuditPage() {
  const [targetType, setTargetType] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("desc");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [logs, setLogs] = useState<AuditItem[]>([]);
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
      const url = new URL("/api/admin/audit", window.location.origin);
      if (targetType.trim()) {
        url.searchParams.set("targetType", targetType.trim());
      }
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
        throw new Error("Не удалось загрузить аудит");
      }

      const payload = (await response.json()) as AuditResponse;
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
  }, []);

  const handleFilter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadLogs({ reset: true });
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loading,
    [nextCursor, loading]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-slate-600">
          История действий администраторов и модераторов.
        </p>
      </header>

      <form onSubmit={handleFilter} className="flex flex-wrap gap-2">
        <input
          value={targetType}
          onChange={(event) => setTargetType(event.target.value)}
          placeholder="targetType (User, Post, Report)"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по action/actor"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Фильтр
        </button>
        <a
          href={`/api/admin/export/audit?range=7d`}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
        >
          Export CSV
        </a>
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
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Meta</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100">
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {log.actor.username ?? log.actor.email}
                </td>
                <td className="px-4 py-3">{log.action}</td>
                <td className="px-4 py-3">
                  {log.targetType}#{log.targetId}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {log.metadata ? JSON.stringify(log.metadata) : "—"}
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
          className="rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
        >
          {loading ? "Загружаем..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
