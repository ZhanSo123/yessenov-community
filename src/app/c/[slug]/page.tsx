"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useI18n } from "@/lib/i18n/useI18n";

type Community = {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
  facultyCode?: string | null;
  courseYear?: number | null;
  isPrivate?: boolean;
};

type Post = {
  id: number;
  content: string;
  createdAt: string;
  community: {
    slug: string;
    title: string;
  };
  author: {
    username: string | null;
  };
};

type CommunityResponse = {
  data?: Community[];
  error?: string;
};

type PostResponse = {
  data?: Post[];
  error?: string;
};

export default function CommunityPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const { t } = useI18n();
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const relativeTime = (iso: string) => {
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) {
      return t("post.just_now");
    }
    const diffMs = Date.now() - createdAt.getTime();
    if (diffMs < 0 || diffMs < 5 * 60 * 1000) {
      return t("post.just_now");
    }
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes < 60) {
      return t("post.minutes_ago", { count: diffMinutes });
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return t("post.hours_ago", { count: diffHours });
    }
    const diffDays = Math.floor(diffHours / 24);
    return t("post.days_ago", { count: diffDays });
  };

  useEffect(() => {
    let active = true;

    const loadCommunity = async () => {
      setLoading(true);
      setError("");

      try {
        const [communityRes, postsRes] = await Promise.all([
          fetch("/api/communities", { credentials: "include" }),
          fetch(`/api/posts?community=${encodeURIComponent(slug)}`, {
            credentials: "include",
          }),
        ]);

        if (postsRes.status === 403) {
          throw new Error(t("thread.error.private"));
        }
        if (!communityRes.ok || !postsRes.ok) {
          throw new Error(t("community_feed.error.load"));
        }

        const communityPayload =
          (await communityRes.json()) as CommunityResponse;
        const postsPayload = (await postsRes.json()) as PostResponse;
        const found = (communityPayload.data ?? []).find(
          (item) => item.slug === slug
        );

        if (active) {
          setCommunity(found ?? null);
          setPosts(postsPayload.data ?? []);
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

    if (slug) {
      loadCommunity();
    }

    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {t("community.page.kicker")}
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {community?.title ?? t("community.page.title_fallback")}
          </h1>
          {community ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>
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
              </span>
              {community.type !== "OPEN" || community.isPrivate ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#6495ED]/30 bg-white px-2 py-1 text-[10px] uppercase text-[#6495ED]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <rect x="6" y="11" width="12" height="9" rx="2" />
                    <path
                      d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"
                      strokeLinecap="round"
                    />
                  </svg>
                  {t("community.page.private")}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="max-w-2xl text-sm text-slate-600">
            {community?.description ?? t("community.page.description_fallback")}
          </p>
          {!error ? (
            <div>
              <Link
                href={`/create?c=${encodeURIComponent(slug)}`}
                className="bubble-btn-primary inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold pressable"
              >
                {t("community.page.create_post")}
              </Link>
            </div>
          ) : null}
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">{t("community.page.loading")}</p>
        ) : null}

        {!loading && !error && posts.length === 0 ? (
          <p className="text-sm text-slate-500">{t("community.page.empty")}</p>
        ) : null}

        <section className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {post.author.username
                    ? `@${post.author.username}`
                    : t("community.page.author")}
                </h2>
                <time className="text-xs text-slate-400">
                  {relativeTime(post.createdAt)}
                </time>
              </div>
              <p className="mt-3 text-sm text-slate-600">{post.content}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1">
                  {post.community.title}
                </span>
                <span>{post.community.slug}</span>
                <span>
                  {t("community.page.author")}: {post.author.username}
                </span>
                <Link
                  href={`/post/${post.id}`}
                  className="text-slate-700 underline-offset-2 hover:underline"
                >
                  {t("community.page.open_post")}
                </Link>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
