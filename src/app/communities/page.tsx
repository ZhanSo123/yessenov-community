"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/lib/i18n/useI18n";

type Community = {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
  facultyCode?: string | null;
  courseYear?: number | null;
  isPrivate: boolean;
};

type CommunityResponse = {
  data?: Community[];
  error?: string;
};

export default function CommunitiesPage() {
  const { t } = useI18n();
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
          throw new Error(t("community_feed.error.load"));
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
              : t("common.error_load")
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
    <div className="relative min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-12">
        <header>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {t("communities.title")}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("communities.subtitle")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/communities/feed"
              className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold pressable"
            >
              {t("communities.private_feed")}
            </Link>
            <Link
              href="/admin/communities"
              className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold pressable"
            >
              {t("communities.admin")}
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">{t("communities.loading")}</p>
        ) : null}

        {!loading && !error && communities.length === 0 ? (
          <p className="text-sm text-slate-500">{t("communities.empty")}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {communities.map((community) => {
            const isClosed = community.type !== "OPEN" || community.isPrivate;

            return (
              <Link
                key={community.id}
                href={`/c/${community.slug}`}
                className={`group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
                  isClosed
                    ? "border-[#6495ED]/25 bg-[#6495ED]/5"
                    : "border-slate-200 bg-white/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {community.title}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                      {community.slug}
                    </span>
                    {isClosed ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#6495ED]/30 bg-white px-2 py-1 text-[10px] uppercase text-[#6495ED]">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        >
                          <rect
                            x="6"
                            y="11"
                            width="12"
                            height="9"
                            rx="2"
                          />
                          <path
                            d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"
                            strokeLinecap="round"
                          />
                        </svg>
                        {t("communities.private")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {community.type === "OPEN"
                    ? t("community.type.open")
                    : community.type === "FACULTY"
                      ? t("community.type.faculty")
                      : community.type === "COURSE"
                        ? t("community.type.course")
                        : t("community.type.teachers")}
                  {community.facultyCode ? ` · ${community.facultyCode}` : ""}
                  {community.courseYear
                    ? ` · ${community.courseYear} ${t("community.type.course")}`
                    : ""}
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  {community.description || t("communities.description_fallback")}
                </p>
                <p className="mt-4 text-xs text-slate-500 group-hover:text-slate-700">
                  {t("communities.open_feed")}
                </p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
