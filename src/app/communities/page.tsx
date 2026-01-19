"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Community = {
  id: number;
  slug: string;
  title: string;
  description: string;
};

type CommunityResponse = {
  data?: Community[];
  error?: string;
};

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadCommunities = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/communities", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Не удалось загрузить сообщества");
        }

        const payload = (await response.json()) as CommunityResponse;
        if (active) {
          setCommunities(payload.data ?? []);
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

    loadCommunities();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-12">
        <header>
          <h1 className="text-3xl font-semibold sm:text-4xl">Сообщества</h1>
          <p className="mt-2 text-sm text-slate-600">
            Выберите сообщество, чтобы увидеть ленту постов.
          </p>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">Загрузка...</p>
        ) : null}

        {!loading && !error && communities.length === 0 ? (
          <p className="text-sm text-slate-500">Сообществ пока нет.</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {communities.map((community) => (
            <Link
              key={community.id}
              href={`/c/${community.slug}`}
              className="group rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  {community.title}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                  {community.slug}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {community.description || "Описание пока не добавлено."}
              </p>
              <p className="mt-4 text-xs text-slate-500 group-hover:text-slate-700">
                Открыть ленту →
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
