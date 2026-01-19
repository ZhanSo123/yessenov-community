"use client";

import { useEffect, useState } from "react";

type MetricsData = {
  range: string;
  newUsers: number;
  newPosts: number;
  deletedPosts: number;
  openReports: number;
  resolvedReports: number;
  bans: number;
  shadowbans: number;
};

export default function AdminMetricsPage() {
  const [range, setRange] = useState("24h");
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMetrics = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/metrics?range=${range}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Не удалось загрузить метрики");
      }
      const payload = (await response.json()) as { data?: MetricsData };
      setData(payload.data ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Метрики модерации</h1>
        <p className="text-sm text-slate-600">
          Пульс за выбранный период.
        </p>
      </header>

      <div className="flex gap-2">
        {["24h", "7d"].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value)}
            className={`rounded-full border px-4 py-1 text-xs font-semibold ${
              range === value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

      {data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Новых пользователей", value: data.newUsers },
            { label: "Новых постов", value: data.newPosts },
            { label: "Скрытых постов", value: data.deletedPosts },
            { label: "Открытых жалоб", value: data.openReports },
            { label: "Решённых жалоб", value: data.resolvedReports },
            { label: "Банов", value: data.bans },
            { label: "Shadowban", value: data.shadowbans },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm"
            >
              <p className="text-xs uppercase text-slate-500">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
