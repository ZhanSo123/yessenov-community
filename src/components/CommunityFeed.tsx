"use client";

import { useEffect, useMemo, useState } from "react";

import PostCard from "@/components/PostCard";
import ReplyComposer from "@/components/ReplyComposer";
import { type PostWithMeta } from "@/lib/post-types";
import { useI18n } from "@/lib/i18n/useI18n";

type FeedResponse = {
  data?: PostWithMeta[];
  nextCursor?: string | null;
  error?: string;
};

type LikeToggleResponse = {
  data?: {
    postId: number;
    liked: boolean;
    likeCount: number;
  };
};

export default function CommunityFeed() {
  const { t } = useI18n();
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [likePending, setLikePending] = useState<Set<number>>(new Set());

  const loadFeed = async (options?: { append?: boolean }) => {
    const append = options?.append ?? false;
    if (append && loadingMore) {
      return;
    }

    if (!append) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError("");

    try {
      const url = new URL("/api/community-feed", window.location.origin);
      if (append && nextCursor) {
        url.searchParams.set("cursor", nextCursor);
      }
      const response = await fetch(url.toString(), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(t("community_feed.error.load"));
      }
      const payload = (await response.json()) as FeedResponse;
      const incoming = payload.data ?? [];
      setPosts((current) => (append ? [...current, ...incoming] : incoming));
      setNextCursor(payload.nextCursor ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : t("community_feed.error.load_generic")
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleLike = async (postId: number) => {
    if (likePending.has(postId)) {
      return;
    }

    setActionMessage("");

    const previous = posts.find((post) => post.id === postId);
    if (!previous || typeof previous.id !== "number") {
      return;
    }

    setPosts((current) =>
      current.map((post) => {
        if (post.id !== postId) {
          return post;
        }
        const nextLiked = !post.viewerHasLiked;
        return {
          ...post,
          viewerHasLiked: nextLiked,
          _count: {
            ...post._count,
            likes: Math.max(0, post._count.likes + (nextLiked ? 1 : -1)),
          },
        };
      })
    );

    setLikePending((current) => new Set(current).add(postId));

    try {
      const response = await fetch("/api/likes/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setActionMessage(t("community_feed.action.like_requires_login"));
        }
        throw new Error("failed");
      }
      const payload = (await response.json()) as LikeToggleResponse;
      const likeCount =
        typeof payload.data?.likeCount === "number"
          ? payload.data.likeCount
          : undefined;
      if (likeCount !== undefined) {
        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  viewerHasLiked: Boolean(payload.data?.liked),
                  _count: { ...post._count, likes: likeCount },
                }
              : post
          )
        );
      }
    } catch {
      setPosts((current) =>
        current.map((post) =>
          post.id === postId && previous
            ? { ...post, viewerHasLiked: previous.viewerHasLiked, _count: previous._count }
            : post
        )
      );
    } finally {
      setLikePending((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  };

  const handleReplyCreated = (postId: number) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              _count: { ...post._count, replies: post._count.replies + 1 },
            }
          : post
      )
    );
    setReplyingId(null);
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loadingMore,
    [nextCursor, loadingMore]
  );

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-10">
        <header className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {t("community_feed.title.private")}
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {t("community_feed.subtitle.private")}
          </h1>
          <p className="text-sm text-slate-600">
            {t("community_feed.description.private")}
          </p>
        </header>

        {actionMessage ? (
          <p className="text-xs text-slate-500">{actionMessage}</p>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`community-feed-skeleton-${index}`}
                className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-24 rounded bg-slate-200" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded bg-slate-200" />
                  <div className="h-3 w-5/6 rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !error && posts.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t("community_feed.empty.private")}
          </p>
        ) : null}

        <div className="space-y-4">
          {posts.map((post) => {
            const numericId = typeof post.id === "number" ? post.id : null;
            return (
              <div key={post.id} className="space-y-3">
                <PostCard
                  post={post}
                  onLike={handleToggleLike}
                  onReplyToggle={(postId) =>
                    setReplyingId(replyingId === postId ? null : postId)
                  }
                  showReplyCount={false}
                />
                {numericId && replyingId === numericId ? (
                  <ReplyComposer
                    postId={numericId}
                    onCreated={() => handleReplyCreated(numericId)}
                    onCancel={() => setReplyingId(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {nextCursor ? (
          <button
            type="button"
            onClick={() => loadFeed({ append: true })}
            disabled={!canLoadMore}
            className="self-center rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
          >
            {loadingMore ? t("community_feed.loading_more") : t("community_feed.load_more")}
          </button>
        ) : null}
      </main>
    </div>
  );
}
