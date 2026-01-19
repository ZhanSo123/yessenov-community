"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Community = {
  id: number;
  slug: string;
  title: string;
  description: string;
  _count?: { posts: number; moderators: number };
};

type CommunityResponse = {
  data?: Community[];
};

export default function AdminCommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/communities", {
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

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Сообщества</h1>
        <p className="text-sm text-slate-600">
          Управление модераторами на уровне сообществ.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

      <div className="grid gap-3">
        {communities.map((community) => (
          <div
            key={community.id}
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {community.title}
                </h2>
                <p className="text-xs text-slate-500">/{community.slug}</p>
              </div>
              <Link
                href={`/admin/communities/${community.slug}/mods`}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600"
              >
                Manage mods
              </Link>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {community.description || "Описание не задано."}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Постов: {community._count?.posts ?? 0}</span>
              <span>Модераторов: {community._count?.moderators ?? 0}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
