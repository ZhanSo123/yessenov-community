"use client";

import { useEffect, useMemo, useState } from "react";

type ReportItem = {
  id: string;
  reason: string;
  status: "OPEN" | "RESOLVED" | "REJECTED";
  category?: "SPAM" | "HARASSMENT" | "ILLEGAL" | "OTHER" | null;
  severity?: number | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  post: {
    id: number;
    content: string;
    deletedAt: string | null;
    author: { id: string; username: string | null; name: string | null };
  };
  reporter: { id: string; email: string; username: string | null; name: string | null };
};

type ReportsResponse = {
  data?: ReportItem[];
  nextCursor?: string | null;
};

export default function AdminReportsPage() {
  const [status, setStatus] = useState("OPEN");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("desc");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadReports = async (options?: { reset?: boolean; cursor?: string }) => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/admin/reports", window.location.origin);
      url.searchParams.set("status", status);
      if (query.trim()) {
        url.searchParams.set("query", query.trim());
      }
      if (category) {
        url.searchParams.set("category", category);
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
        throw new Error("Не удалось загрузить жалобы");
      }

      const payload = (await response.json()) as ReportsResponse;
      const incoming = payload.data ?? [];

      if (options?.reset) {
        setReports(incoming);
      } else {
        setReports((current) => [...current, ...incoming]);
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
    loadReports({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const updateReport = (id: string, patch: Partial<ReportItem>) => {
    setReports((current) =>
      current.map((report) => (report.id === id ? { ...report, ...patch } : report))
    );
  };

  const handleResolve = async (id: string, nextStatus: "RESOLVED" | "REJECTED") => {
    const note = window.prompt("Комментарий (опционально)") ?? undefined;

    const response = await fetch(`/api/admin/reports/${id}/resolve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, note: note?.trim() || undefined }),
    });

    if (!response.ok) {
      setError("Не удалось обновить жалобу");
      return;
    }

    updateReport(id, { status: nextStatus, resolvedAt: new Date().toISOString(), resolutionNote: note?.trim() || null });
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loading,
    [nextCursor, loading]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Жалобы</h1>
        <p className="text-sm text-slate-600">
          Управление пользовательскими репортами.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/admin/export/reports?status=OPEN"
          className="bubble-btn rounded-xl px-4 py-2 text-xs font-semibold pressable"
        >
          Export OPEN CSV
        </a>
        <a
          href="/api/admin/export/reports"
          className="bubble-btn rounded-xl px-4 py-2 text-xs font-semibold pressable"
        >
          Export ALL CSV
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        {["OPEN", "RESOLVED", "REJECTED"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            className={`rounded-full px-4 py-1 text-xs font-semibold pressable ${
              status === item ? "bubble-btn-primary" : "bubble-btn"
            }`}
          >
            {item}
          </button>
        ))}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по тексту"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Все категории</option>
          <option value="SPAM">SPAM</option>
          <option value="HARASSMENT">HARASSMENT</option>
          <option value="ILLEGAL">ILLEGAL</option>
          <option value="OTHER">OTHER</option>
        </select>
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
          onClick={() => loadReports({ reset: true })}
          className="bubble-btn-primary rounded-xl px-4 py-2 text-sm font-semibold pressable"
        >
          Применить
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {reports.map((report) => (
          <div
            key={report.id}
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {report.reporter.username ?? report.reporter.email} ·{" "}
                {new Date(report.createdAt).toLocaleString()}
              </span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] uppercase">
                {report.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-800">{report.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {"category" in report && report.category ? (
                <span className="rounded-full border border-slate-200 px-2 py-0.5">
                  {report.category}
                </span>
              ) : null}
              {"severity" in report && report.severity ? (
                <span className="rounded-full border border-slate-200 px-2 py-0.5">
                  Severity {report.severity}
                </span>
              ) : null}
            </div>
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <div>
                Post #{report.post.id} ·{" "}
                {report.post.author.username ?? report.post.author.name ?? "user"}
              </div>
              <div className="mt-1">
                {report.post.content.slice(0, 140) || "Репост"}
              </div>
            </div>
            {report.status === "OPEN" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleResolve(report.id, "RESOLVED")}
                  className="bubble-btn-primary rounded-full px-3 py-1 text-xs font-semibold pressable"
                >
                  Resolve
                </button>
                <button
                  type="button"
                  onClick={() => handleResolve(report.id, "REJECTED")}
                  className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
                >
                  Reject
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => loadReports({ cursor: nextCursor })}
          disabled={!canLoadMore}
          className="bubble-btn rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 pressable"
        >
          {loading ? "Загружаем..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
