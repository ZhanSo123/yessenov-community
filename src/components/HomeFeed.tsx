"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import CommunitySwitcher from "@/components/CommunitySwitcher";
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

type ProfileResponse = {
  data?: {
    user?: {
      interests?: string[];
    };
  };
};

type RecommendedCommunity = {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
  isPrivate: boolean;
  facultyCode?: string | null;
  courseYear?: number | null;
};

export default function HomeFeed() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const interestParam = searchParams.get("interest") ?? "";
  const mixParam = searchParams.get("mix") ?? "";
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
  const [interest, setInterest] = useState(interestParam);
  const [interestOptions, setInterestOptions] = useState<string[]>([]);
  const [mix, setMix] = useState(
    searchParams.get("mix") === "1" && !interestParam
  );
  const [recommendedCommunities, setRecommendedCommunities] = useState<
    RecommendedCommunity[]
  >([]);
  const [recommendedCommunitiesError, setRecommendedCommunitiesError] =
    useState("");
  const [recommendedPosts, setRecommendedPosts] = useState<PostWithMeta[]>([]);
  const [recommendedPostsError, setRecommendedPostsError] = useState("");
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [likePending, setLikePending] = useState<Set<number>>(new Set());
  const [participation, setParticipation] = useState<
    Record<string, { replyCount: number; updatedAt: number }>
  >({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    if (!currentUserId) {
      setUnreadCount(0);
      return;
    }

    let active = true;

    const loadUnread = async () => {
      try {
        const response = await fetch("/api/notifications/unread-count", {
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          data?: { count?: number };
        };
        if (active) {
          setUnreadCount(Math.max(0, payload.data?.count ?? 0));
        }
      } catch {
        if (active) {
          setUnreadCount(0);
        }
      }
    };

    loadUnread();
    const handleFocus = () => loadUnread();
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
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

  const recommendedDisplayPosts = useMemo(() => {
    const ids = new Set(
      displayPosts
        .filter((post) => typeof post.id === "number")
        .map((post) => post.id)
    );
    return recommendedPosts
      .filter((post) => !ids.has(post.id))
      .slice(0, 3);
  }, [displayPosts, recommendedPosts]);

  const handleDeletedPost = (postId: number) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
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

  const interleavePosts = (
    primary: PostWithMeta[],
    secondary: PostWithMeta[],
    ratio = 2
  ) => {
    const seen = new Set<number | string>();
    const result: PostWithMeta[] = [];
    let i = 0;
    let j = 0;
    while (i < primary.length || j < secondary.length) {
      for (let r = 0; r < ratio && i < primary.length; r += 1) {
        const post = primary[i++];
        if (!seen.has(post.id)) {
          seen.add(post.id);
          result.push(post);
        }
      }
      if (j < secondary.length) {
        const post = secondary[j++];
        if (!seen.has(post.id)) {
          seen.add(post.id);
          result.push(post);
        }
      }
      if (result.length >= primary.length + secondary.length) {
        break;
      }
    }
    return result;
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
      const interestQuery =
        interestOptions.length > 0 ? interestOptions.join(",") : "";
      const mixRatio =
        interestOptions.length >= 4 ? 1 : interestOptions.length >= 2 ? 2 : 3;
      const shouldMix =
        !append &&
        feedMode === "for-you" &&
        mix &&
        !interest &&
        interestQuery.length > 0;

      const buildUrl = (interestOverride?: string) => {
        const url = new URL("/api/feed", window.location.origin);
        url.searchParams.set("mode", feedMode);
        if (interestOverride) {
          url.searchParams.set("interest", interestOverride);
        }
        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }
        return url.toString();
      };

      const fetchFeed = async (url: string) => {
        const response = await fetch(url, { credentials: "include" });
        if (response.status === 401) {
          setError("Войдите, чтобы увидеть ленту подписок.");
          return null;
        }
        if (!response.ok) {
          throw new Error("Не удалось загрузить ленту");
        }
        const payload = (await response.json()) as FeedResponse;
        return payload;
      };

      if (shouldMix) {
        const [generalPayload, interestPayload] = await Promise.all([
          fetchFeed(buildUrl("")),
          fetchFeed(buildUrl(interestQuery)),
        ]);

        if (!generalPayload) {
          setPosts((current) => (append ? current : []));
          setNextCursor(null);
          return;
        }

        const generalPosts = (generalPayload.data ?? []).map((post) => ({
          ...post,
          viewCount: post.viewCount ?? 0,
        }));
        const interestPosts = (interestPayload?.data ?? []).map((post) => ({
          ...post,
          viewCount: post.viewCount ?? 0,
        }));
        const mixed = interleavePosts(generalPosts, interestPosts, mixRatio);
        setPosts((current) =>
          append ? mergeAppend(current, mixed) : mergeReplace(current, mixed)
        );
        setNextCursor(generalPayload.nextCursor ?? null);
        return;
      }

      const payload = await fetchFeed(buildUrl(interest || ""));
      if (!payload) {
        setPosts((current) => (append ? current : []));
        setNextCursor(null);
        return;
      }

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
    setInterest(interestParam);
  }, [interestParam]);

  useEffect(() => {
    setMix(mixParam === "1" && !interestParam);
  }, [mixParam, interestParam]);

  useEffect(() => {
    if (interestParam || mixParam || interestOptions.length === 0) {
      return;
    }
    setMix(true);
    const params = new URLSearchParams(searchParams);
    params.set("mix", "1");
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/");
  }, [interestParam, mixParam, interestOptions.length, router, searchParams]);

  useEffect(() => {
    if (!currentUserId) {
      setInterestOptions([]);
      return;
    }
    let active = true;
    const loadInterests = async () => {
      try {
        const response = await fetch("/api/me/profile", {
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as ProfileResponse;
        const list = payload.data?.user?.interests ?? [];
        if (active) {
          setInterestOptions(list);
        }
      } catch {
        if (active) {
          setInterestOptions([]);
        }
      }
    };
    loadInterests();
    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setRecommendedCommunities([]);
      return;
    }
    let active = true;
    const loadRecommended = async () => {
      setRecommendedCommunitiesError("");
      try {
        const response = await fetch("/api/communities?scope=recommended", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Не удалось загрузить рекомендации");
        }
        const payload = (await response.json()) as {
          data?: RecommendedCommunity[];
        };
        if (active) {
          setRecommendedCommunities(payload.data ?? []);
        }
      } catch (fetchError) {
        if (active) {
          setRecommendedCommunitiesError(
            fetchError instanceof Error
              ? fetchError.message
              : "Ошибка загрузки"
          );
        }
      }
    };
    loadRecommended();
    return () => {
      active = false;
    };
  }, [currentUserId, interestOptions.length]);

  useEffect(() => {
    if (!currentUserId || interestOptions.length === 0) {
      setRecommendedPosts([]);
      return;
    }
    let active = true;
    const loadRecommendedPosts = async () => {
      setRecommendedPostsError("");
      try {
        const url = new URL("/api/feed", window.location.origin);
        url.searchParams.set("mode", "for-you");
        url.searchParams.set("interest", interestOptions.join(","));
        url.searchParams.set("limit", "6");
        const response = await fetch(url.toString(), {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Не удалось загрузить посты");
        }
        const payload = (await response.json()) as FeedResponse;
        const incoming = (payload.data ?? []).map((post) => ({
          ...post,
          viewCount: post.viewCount ?? 0,
        }));
        if (active) {
          setRecommendedPosts(incoming);
        }
      } catch (fetchError) {
        if (active) {
          setRecommendedPostsError(
            fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
          );
        }
      }
    };
    loadRecommendedPosts();
    return () => {
      active = false;
    };
  }, [currentUserId, interestOptions]);

  useEffect(() => {
    setNextCursor(null);
    loadFeed(mode);
  }, [mode, interest, mix, interestOptions.length]);

  const setFeedMode = (next: "for-you" | "following") => {
    if (next === mode) {
      return;
    }
    setMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === "following") {
      params.set("tab", "following");
    } else {
      params.delete("tab");
    }
    if (interest) {
      params.set("interest", interest);
    }
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/");
  };

  const setFeedInterest = (value: string) => {
    setInterest(value);
    setMix(false);
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("interest", value);
    } else {
      params.delete("interest");
    }
    params.delete("mix");
    if (mode === "following") {
      params.set("tab", "following");
    } else {
      params.delete("tab");
    }
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/");
  };

  const toggleMix = () => {
    const next = !mix;
    setMix(next);
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set("mix", "1");
      params.delete("interest");
      setInterest("");
    } else {
      params.delete("mix");
    }
    if (mode === "following") {
      params.set("tab", "following");
    } else {
      params.delete("tab");
    }
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/");
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start || event.changedTouches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    touchStartRef.current = null;

    const threshold = 60;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) {
      return;
    }
    if (dx < 0) {
      setFeedMode("following");
    } else {
      setFeedMode("for-you");
    }
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
    <div
      className="relative min-h-screen bg-white text-slate-900"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-10">
        <header className="flex flex-col gap-3 animate-fade-up">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Threads Feed
              </p>
              <h1 className="text-3xl font-semibold sm:text-4xl">
                Что нового в сообществе
              </h1>
              <p className="text-sm text-slate-600">
                Лента коротких постов и обсуждений.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/search"
                aria-label="Поиск"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-[#6495ED]/40 hover:text-[#6495ED]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16.2 16.2 20 20" strokeLinecap="round" />
                </svg>
              </Link>
              <Link
                href="/notifications"
                aria-label="Уведомления"
                className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-[#6495ED]/40 hover:text-[#6495ED]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9.5a6 6 0 0 1 12 0v3.3c0 .7.3 1.4.8 1.9l.9.8H4.3l.9-.8c.5-.5.8-1.2.8-1.9V9.5Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.5 18.5a2.5 2.5 0 0 0 5 0"
                    strokeLinecap="round"
                  />
                </svg>
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#6495ED] px-1 text-[10px] font-semibold text-white shadow animate-pop">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            </div>
          </div>
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

        <CommunitySwitcher />

        {interestOptions.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                Режим:
              </span>
              <button
                type="button"
                onClick={toggleMix}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  mix
                    ? "bg-[#6495ED]/15 text-[#6495ED]"
                    : "bg-slate-100 text-slate-600 hover:bg-[#6495ED]/10 hover:text-[#6495ED]"
                }`}
              >
                Смешанная лента
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                По интересам:
              </span>
            {interestOptions.map((item) => {
              const active = item.toLowerCase() === interest.toLowerCase();
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFeedInterest(active ? "" : item)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-[#6495ED]/15 text-[#6495ED]"
                      : "bg-slate-100 text-slate-600 hover:bg-[#6495ED]/10 hover:text-[#6495ED]"
                  }`}
                >
                  {item}
                </button>
              );
            })}
            {interest ? (
              <button
                type="button"
                onClick={() => setFeedInterest("")}
                className="rounded-full px-3 py-1 text-xs text-slate-500 hover:text-slate-900"
              >
                Очистить
              </button>
            ) : null}
            </div>
          </div>
        ) : null}

        {recommendedCommunitiesError ? (
          <p className="text-xs text-rose-500">{recommendedCommunitiesError}</p>
        ) : null}

        {recommendedCommunities.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Рекомендуемые сообщества
              </h2>
              <Link
                href="/communities"
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Все →
              </Link>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {recommendedCommunities.map((community) => {
                const isClosed =
                  community.type !== "OPEN" || community.isPrivate;
                return (
                  <Link
                    key={community.id}
                    href={`/c/${community.slug}`}
                    className={`shrink-0 rounded-2xl border px-3 py-2 text-xs transition ${
                      isClosed
                        ? "border-[#6495ED]/30 bg-[#6495ED]/10 text-[#6495ED]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-[#6495ED]/40 hover:text-[#6495ED]"
                    }`}
                  >
                    <span className="font-semibold">{community.title}</span>
                    <span className="ml-1 text-[10px] text-slate-400">
                      {community.slug}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {recommendedPostsError ? (
          <p className="text-xs text-rose-500">{recommendedPostsError}</p>
        ) : null}

        {recommendedDisplayPosts.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Рекомендуемые посты
              </h2>
              {interestOptions.length > 0 ? (
                <span className="text-xs text-slate-500">
                  по интересам
                </span>
              ) : null}
            </div>
            <div className="space-y-3">
              {recommendedDisplayPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  showActions={false}
                  showReplyCount={false}
                />
              ))}
            </div>
          </section>
        ) : null}

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
            Пока пусто. Создай первый пост через кнопку “+”.
          </p>
        ) : null}

        <div className="space-y-4">
          {displayPosts.map((post, index) => {
            const numericId = typeof post.id === "number" ? post.id : null;

            return (
              <div
                key={post.id}
                className="space-y-3 animate-fade-up"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <PostCard
                  post={post}
                  onLike={handleToggleLike}
                  onReplyToggle={(postId) =>
                    setReplyingId(replyingId === postId ? null : postId)
                  }
                  onDeleted={handleDeletedPost}
                  onDeleteError={setActionMessage}
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
