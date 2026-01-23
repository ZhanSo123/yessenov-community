"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import AuthBar from "@/components/AuthBar";
import CreatePostForm from "@/components/CreatePostForm";
import PostCard from "@/components/PostCard";
import ReplyComposer from "@/components/ReplyComposer";
import { type PostWithMeta } from "@/lib/post-types";

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

export default function HomeFeed() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const initialMode = tabParam === "following" ? "following" : "for-you";
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      session?.user?.hasOnboarded === false
    ) {
      console.warn("User has not onboarded but reached /");
    }
  }, [session?.user?.hasOnboarded]);

  const [mode, setMode] = useState<"for-you" | "following">(initialMode);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [likePending, setLikePending] = useState<Set<number>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const [participation, setParticipation] = useState<
    Record<string, { replyCount: number; updatedAt: number }>
  >({});

  const limitConsecutiveAuthors = (
    items: PostWithMeta[],
    maxInRow: number
  ) => {
    const remaining = [...items];
    const result: PostWithMeta[] = [];
    let lastAuthor: string | null = null;
    let runLength = 0;

    while (remaining.length > 0) {
      const candidate = remaining[0];
      const candidateAuthor = candidate.author.id;

      if (lastAuthor && candidateAuthor === lastAuthor && runLength >= maxInRow) {
        const nextIndex = remaining.findIndex(
          (post, index) => index > 0 && post.author.id !== lastAuthor
        );
        if (nextIndex === -1) {
          remaining.shift();
          result.push(candidate);
          runLength += 1;
        } else {
          const [nextPost] = remaining.splice(nextIndex, 1);
          result.push(nextPost);
          lastAuthor = nextPost.author.id;
          runLength = 1;
        }
        continue;
      }

      remaining.shift();
      result.push(candidate);
      if (candidateAuthor === lastAuthor) {
        runLength += 1;
      } else {
        lastAuthor = candidateAuthor;
        runLength = 1;
      }
    }

    return result;
  };

  const lastPostLabel = useMemo(() => {
    if (!currentUserId) {
      return "";
    }
    const lastPost = posts
      .filter((post) => post.author.id === currentUserId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
    if (!lastPost) {
      return "";
    }
    const lastDate = new Date(lastPost.createdAt);
    if (Number.isNaN(lastDate.getTime())) {
      return "";
    }
    const now = new Date();
    const todayKey = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const lastKey = lastDate.toDateString();
    if (lastKey === todayKey) {
      return "Ты писал здесь сегодня";
    }
    if (lastKey === yesterday.toDateString()) {
      return "Ты был здесь вчера";
    }
    return "";
  }, [currentUserId, posts]);

  useEffect(() => {
    if (!currentUserId) {
      setParticipation({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(
        `yc:participation:${currentUserId}`
      );
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") {
        setParticipation(parsed);
      } else {
        setParticipation({});
      }
    } catch {
      setParticipation({});
    }
  }, [currentUserId]);

  const hasParticipation = useMemo(() => {
    if (!currentUserId) {
      return false;
    }
    return posts.some(
      (post) => typeof post.id === "number" && participation[post.id]
    );
  }, [currentUserId, participation, posts]);

  const hasRecentPosts = useMemo(
    () =>
      posts.some((post) => {
        const createdAt = new Date(post.createdAt);
        if (Number.isNaN(createdAt.getTime())) {
          return false;
        }
        return Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;
      }),
    [posts]
  );

  const cadenceHint = useMemo(() => {
    return Math.random() > 0.5
      ? "Здесь обычно пишут вечером"
      : "Новые мысли появляются каждый день";
  }, []);

  const displayPosts = useMemo(
    () => limitConsecutiveAuthors(posts, 2),
    [posts]
  );

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 2200);
  };

  const handleDeletedPost = (postId: number) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  };

  const scheduleViewBump = (postId: number) => {
    const delay = 2000 + Math.floor(Math.random() * 3000);
    window.setTimeout(() => {
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? { ...post, viewCount: (post.viewCount ?? 0) + 1 }
            : post
        )
      );
    }, delay);
  };

  const mergeReplace = (current: PostWithMeta[], incoming: PostWithMeta[]) => {
    const temps = current.filter((post) => typeof post.id === "string");
    const existingById = new Map<number, PostWithMeta>();

    current
      .filter((post) => typeof post.id === "number")
      .forEach((post) => existingById.set(post.id as number, post));

    const merged: PostWithMeta[] = [...temps];
    incoming.forEach((post) => {
      if (typeof post.id === "number") {
        existingById.delete(post.id);
      }
      merged.push(post);
    });

    existingById.forEach((post) => merged.push(post));
    return merged;
  };

  const mergeAppend = (current: PostWithMeta[], incoming: PostWithMeta[]) => {
    const ids = new Set(
      current
        .filter((post) => typeof post.id === "number")
        .map((post) => post.id as number)
    );

    const merged = [...current];
    incoming.forEach((post) => {
      if (typeof post.id !== "number") {
        return;
      }
      if (!ids.has(post.id)) {
        merged.push(post);
        ids.add(post.id);
      }
    });

    return merged;
  };

  const loadFeed = async (
    feedMode: "for-you" | "following",
    options?: { append?: boolean }
  ) => {
    const append = options?.append ?? false;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");

    try {
      const cursor = append ? nextCursor : null;
      const url = new URL("/api/feed", window.location.origin);
      url.searchParams.set("mode", feedMode);
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      if (response.status === 401) {
        setError("Войдите, чтобы увидеть ленту подписок.");
        setPosts((current) => (append ? current : []));
        setNextCursor(null);
        return;
      }

      if (!response.ok) {
        throw new Error("Не удалось загрузить ленту");
      }

      const payload = (await response.json()) as FeedResponse;
      const incoming = (payload.data ?? []).map((post) => ({
        ...post,
        viewCount: post.viewCount ?? 0,
      }));
      setPosts((current) =>
        append ? mergeAppend(current, incoming) : mergeReplace(current, incoming)
      );
      setNextCursor(payload.nextCursor ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setNextCursor(null);
    loadFeed(mode);
  }, [mode]);

  const handleOptimisticPost = (post: PostWithMeta) => {
    setPosts((current) => [
      { ...post, viewCount: post.viewCount ?? 0 },
      ...current,
    ]);
  };

  const handlePostCreated = (post: PostWithMeta, tempId?: string) => {
    showToast("Опубликовано");
    if (typeof post.id === "number") {
      scheduleViewBump(post.id);
    }
    if (!tempId) {
      setPosts((current) => [
        { ...post, viewCount: post.viewCount ?? 0 },
        ...current,
      ]);
      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === tempId
          ? { ...post, viewCount: post.viewCount ?? 0 }
          : item
      )
    );
  };

  const handlePostFailed = (tempId: string) => {
    setPosts((current) => current.filter((item) => item.id !== tempId));
  };

  const handleToggleLike = async (postId: number) => {
    if (likePending.has(postId)) {
      return;
    }

    setActionMessage("");
    let previousLiked = false;
    let previousCount = 0;

    setPosts((current) =>
      current.map((post) => {
        if (post.id !== postId) {
          return post;
        }
        previousLiked = post.viewerHasLiked;
        previousCount = post._count.likes;
        const nextLiked = !post.viewerHasLiked;
        const nextCount = Math.max(0, post._count.likes + (nextLiked ? 1 : -1));
        return {
          ...post,
          viewerHasLiked: nextLiked,
          _count: { ...post._count, likes: nextCount },
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

      if (response.status === 401) {
        setActionMessage("Войдите, чтобы ставить лайки.");
        throw new Error("unauthorized");
      }

      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; bannedUntil?: string; banReason?: string }
          | null;
        if (payload?.error === "BANNED") {
          const until = payload.bannedUntil
            ? new Date(payload.bannedUntil).toLocaleDateString()
            : "неизвестно";
          const reason = payload.banReason ? ` Причина: ${payload.banReason}` : "";
          setActionMessage(`Вы заблокированы до ${until}.${reason}`);
        } else if (payload?.error === "ONBOARDING_REQUIRED") {
          router.push("/onboarding");
          throw new Error("onboarding");
        } else {
          setActionMessage("Доступ запрещён.");
        }
        throw new Error("forbidden");
      }

      if (!response.ok) {
        throw new Error("Не удалось обновить лайк");
      }

      const payload = (await response.json()) as LikeToggleResponse;
      if (!payload.data) {
        throw new Error("Не удалось обновить лайк");
      }

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                viewerHasLiked: payload.data?.liked ?? post.viewerHasLiked,
                _count: {
                  ...post._count,
                  likes: payload.data?.likeCount ?? post._count.likes,
                },
              }
            : post
        )
      );
    } catch {
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                viewerHasLiked: previousLiked,
                _count: { ...post._count, likes: previousCount },
              }
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

  const handleReplyCreated = (parentId: number) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === parentId
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
    <div className="relative min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Threads Feed
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Что нового в сообществе
          </h1>
          <p className="text-sm text-slate-600">
            Лента коротких постов и обсуждений.
          </p>
        </header>
        {lastPostLabel ? (
          <p className="text-xs text-slate-500">{lastPostLabel}</p>
        ) : null}
        {hasParticipation ? (
          <p className="text-xs text-slate-500">Ты участвовал в обсуждении</p>
        ) : null}
        {hasRecentPosts ? (
          <p className="text-xs text-slate-500">{cadenceHint}</p>
        ) : null}

        <AuthBar />

        <CreatePostForm
          onOptimistic={handleOptimisticPost}
          onCreated={handlePostCreated}
          onFailed={handlePostFailed}
        />
        {toastMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
            {toastMessage}
          </div>
        ) : null}
        {actionMessage ? (
          <p className="text-xs text-slate-500">{actionMessage}</p>
        ) : null}

        <section className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("for-you")}
            className={`rounded-full px-4 py-2 transition ${
              mode === "for-you"
                ? "bg-slate-900 text-white"
                : "bg-white/80 text-slate-600"
            }`}
          >
            For you
          </button>
          <button
            type="button"
            onClick={() => setMode("following")}
            className={`rounded-full px-4 py-2 transition ${
              mode === "following"
                ? "bg-slate-900 text-white"
                : "bg-white/80 text-slate-600"
            }`}
          >
            Following
          </button>
          <button
            type="button"
            onClick={() => loadFeed(mode)}
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-slate-600 transition hover:text-slate-900"
          >
            Refresh
          </button>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`feed-skeleton-${index}`}
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
            Пока пусто. Напиши первый пост.
          </p>
        ) : null}

        <div className="space-y-4">
          {displayPosts.map((post) => {
            const numericId = typeof post.id === "number" ? post.id : null;

            return (
              <div key={post.id} className="space-y-3">
                <PostCard
                  post={post}
                  onLike={handleToggleLike}
                  onReplyToggle={(postId) =>
                    setReplyingId(replyingId === postId ? null : postId)
                  }
                  onDeleted={handleDeletedPost}
                  onDeleteError={showToast}
                  highlight={
                    Boolean(
                      currentUserId &&
                        post.author.id === currentUserId &&
                        post._count.replies > 0
                    )
                  }
                  showDiscussionHint={post._count.replies > 0}
                  showReplyCount={false}
                  activityDot={Boolean(
                    typeof post.id === "number" &&
                      participation[post.id]?.replyCount !== undefined &&
                      post._count.replies >
                        participation[post.id]?.replyCount
                  )}
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
            onClick={() => loadFeed(mode, { append: true })}
            disabled={!canLoadMore}
            className="self-center rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
          >
            {loadingMore ? "Загружаем..." : "Load more"}
          </button>
        ) : null}
      </main>
    </div>
  );
}
