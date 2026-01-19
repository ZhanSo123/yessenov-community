"use client";

import { useEffect, useState } from "react";

type FeedbackItem = {
  id: string;
  message: string;
  currentPath: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
  };
};

type FeedbackResponse = {
  data?: FeedbackItem[];
  nextCursor?: string | null;
};

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadFeedback = async (options?: { reset?: boolean; cursor?: string }) => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/admin/feedback", window.location.origin);
      if (options?.cursor) {
        url.searchParams.set("cursor", options.cursor);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить фидбек");
      }

      const payload = (await response.json()) as FeedbackResponse;
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
    loadFeedback({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-sm text-slate-600">
          Сообщения от пользователей.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {items.length === 0 && !loading ? (
        <p className="text-sm text-slate-500">Пока нет сообщений.</p>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => {
          const author =
            item.user.username ??
            item.user.name ??
            item.user.email ??
            "Unknown";
          return (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
            >
              <p className="text-sm text-slate-900">{item.message}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{author}</span>
                <span>•</span>
                <span>{item.currentPath}</span>
                <span>•</span>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
            </article>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Загрузка...</p>
      ) : null}

      {nextCursor ? (
        <button
          type="button"
          onClick={() => loadFeedback({ cursor: nextCursor })}
          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
          disabled={loading}
        >
          Загрузить ещё
        </button>
      ) : null}
    </div>
  );
}
