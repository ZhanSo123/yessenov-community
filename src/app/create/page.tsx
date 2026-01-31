"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const communitySlug = searchParams.get("c")?.trim() || "";
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const loading = status === "loading";
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const loadingError = error;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!user) {
      setError("Сначала войдите");
      return;
    }

    if (!content.trim()) {
      setError("Введите текст поста");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          communitySlug: communitySlug || undefined,
        }),
      });

      if (response.status === 401) {
        setError("Сначала войдите");
        return;
      }

      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string; bannedUntil?: string; banReason?: string }
          | null;
        if (payload?.error === "BANNED") {
          const until = payload.bannedUntil
            ? new Date(payload.bannedUntil).toLocaleDateString()
            : "неизвестно";
          const reason = payload.banReason ? ` Причина: ${payload.banReason}` : "";
          setError(`Вы заблокированы до ${until}.${reason}`);
        } else {
          setError(
            payload?.message === "PRIVATE_COMMUNITY"
              ? "Это закрытое сообщество."
              : "Доступ запрещён."
          );
        }
        return;
      }

      const payload = (await response.json()) as { data?: { id: number } };
      if (!response.ok || !payload.data?.id) {
        throw new Error("Не удалось создать пост");
      }

      router.push(`/p/${payload.data.id}`);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Не удалось создать пост"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-16 pt-10">
        <header>
          <h1 className="text-3xl font-semibold sm:text-4xl">Создать пост</h1>
          <p className="mt-2 text-sm text-slate-600">
            Быстрый черновик для нового треда.
          </p>
          {communitySlug ? (
            <p className="mt-2 text-xs text-slate-500">
              Сообщество: {communitySlug}
            </p>
          ) : null}
        </header>

        {loadingError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {loadingError}
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

        {!loading && !user ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600">
            <p>Чтобы создать пост, нужно войти.</p>
            <Link
              href="/"
              className="bubble-btn-primary mt-3 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold pressable"
            >
              Войти
            </Link>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm"
        >
          <label className="text-sm font-semibold text-slate-700">
            Текст поста
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="mt-2 min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Что нового?"
              disabled={!user || submitting}
            />
          </label>

          <button
            type="submit"
            disabled={!user || submitting}
            className="bubble-btn-primary mt-4 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 pressable"
          >
            {submitting ? "Публикуем..." : "Post"}
          </button>
        </form>
      </main>
    </div>
  );
}
