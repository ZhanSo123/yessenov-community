"use client";

import { useEffect, useState } from "react";

type DashboardData = {
  openReports: number;
  deletedPosts: number;
  bannedUsers: number;
  shadowBannedUsers: number;
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/dashboard", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить данные");
        }

        const payload = (await response.json()) as { data?: DashboardData };
        if (active) {
          setData(payload.data ?? null);
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Админ-панель</h1>
        <p className="mt-2 text-sm text-slate-600">
          Быстрый обзор модерации и жалоб.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

      {data ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Открытых жалоб", value: data.openReports },
            { label: "Скрытых постов", value: data.deletedPosts },
            { label: "Забаненных", value: data.bannedUsers },
            { label: "Shadowban", value: data.shadowBannedUsers },
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

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 text-sm text-slate-600 shadow-sm">
        <p>Быстрый доступ к очереди модерации.</p>
        <a
          href="/admin/queue"
          className="mt-3 inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Открыть очередь
        </a>
      </div>
    </div>
  );
}
