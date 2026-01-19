"use client";

import { useEffect, useState } from "react";

type AlphaMetrics = {
  usersTotal: number;
  usersInvitedAccepted: number;
  usersOnboarded: number;
  postsLast24h: number;
  repliesLast24h: number;
  feedbackLast24h: number;
};

type AlphaMetricsResponse = {
  data?: AlphaMetrics;
};

type AlphaDashboardClientProps = {
  inviteCode: string;
  isDev: boolean;
};

export default function AlphaDashboardClient({
  inviteCode,
  isDev,
}: AlphaDashboardClientProps) {
  const [data, setData] = useState<AlphaMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const loadMetrics = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/alpha/metrics", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить метрики");
      }

      const payload = (await response.json()) as AlphaMetricsResponse;
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
  }, []);

  const handleCopy = async () => {
    setCopyStatus("");

    if (!inviteCode) {
      setCopyStatus("Нет invite-кода");
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopyStatus("Скопировано");
    } catch {
      setCopyStatus("Не удалось скопировать");
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Alpha dashboard</h1>
        <p className="text-sm text-slate-600">
          Минимальные сигналы жизни продукта.
        </p>
      </header>

      {isDev ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:text-slate-900"
          >
            Скопировать invite code
          </button>
          {copyStatus ? (
            <span className="text-xs text-slate-500">{copyStatus}</span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm">
          <table className="w-full text-left text-sm">
            <tbody>
              {[
                { label: "Users total", value: data.usersTotal },
                {
                  label: "Users invite accepted",
                  value: data.usersInvitedAccepted,
                },
                { label: "Users onboarded", value: data.usersOnboarded },
                { label: "Posts last 24h", value: data.postsLast24h },
                { label: "Replies last 24h", value: data.repliesLast24h },
                { label: "Feedback last 24h", value: data.feedbackLast24h },
              ].map((item, index) => (
                <tr
                  key={item.label}
                  className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="px-4 py-3 text-slate-600">{item.label}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {item.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
