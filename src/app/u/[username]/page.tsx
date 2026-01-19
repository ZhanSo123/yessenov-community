"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import FollowButton from "@/components/FollowButton";
import PostCard from "@/components/PostCard";
import { type PostWithMeta } from "@/lib/post-types";

type ProfileResponse = {
  data?: {
    user: {
      id: string;
      email: string;
      username: string | null;
      name: string | null;
      image: string | null;
      createdAt: string;
    };
    stats: {
      followersCount: number;
      followingCount: number;
      postsCount: number;
    };
    viewerFollows: boolean;
  };
  error?: string;
};

type PostsResponse = {
  data?: PostWithMeta[];
  nextCursor?: string | null;
};

type LikeToggleResponse = {
  data?: {
    postId: number;
    liked: boolean;
    likeCount: number;
  };
};

export default function ProfilePage() {
  const params = useParams();
  const username = typeof params.username === "string" ? params.username : "";
  const { data: session } = useSession();

  const [profile, setProfile] = useState<ProfileResponse["data"] | null>(null);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [likePending, setLikePending] = useState<Set<number>>(new Set());

  const sortPostsDesc = (items: PostWithMeta[]) =>
    [...items].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

  const memberSinceLabel = (createdAt: string) => {
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return "недавно";
    }
    return parsed.toLocaleString("ru-RU", {
      month: "long",
      year: "numeric",
    });
  };

  const mergePosts = (current: PostWithMeta[], incoming: PostWithMeta[]) => {
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

    return sortPostsDesc(merged);
  };

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const [profileRes, postsRes] = await Promise.all([
          fetch(`/api/users/${username}`, { credentials: "include" }),
          fetch(`/api/users/${username}/posts`, { credentials: "include" }),
        ]);

        if (!profileRes.ok) {
          throw new Error("Не удалось загрузить профиль");
        }

        const profilePayload = (await profileRes.json()) as ProfileResponse;
        const postsPayload = (await postsRes.json()) as PostsResponse;

        if (active) {
          setProfile(profilePayload.data ?? null);
          setPosts(sortPostsDesc(postsPayload.data ?? []));
          setNextCursor(postsPayload.nextCursor ?? null);
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

    if (username) {
      loadProfile();
    }

    return () => {
      active = false;
    };
  }, [username]);

  const loadMorePosts = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const url = new URL(`/api/users/${username}/posts`, window.location.origin);
      url.searchParams.set("cursor", nextCursor);
      const response = await fetch(url.toString(), { credentials: "include" });
      if (!response.ok) {
        throw new Error("failed");
      }

      const payload = (await response.json()) as PostsResponse;
      setPosts((current) => mergePosts(current, payload.data ?? []));
      setNextCursor(payload.nextCursor ?? null);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleLike = async (postId: number) => {
    if (likePending.has(postId)) {
      return;
    }

    let previousLiked = false;
    let previousCount = 0;
    setActionMessage("");

    setPosts((current) =>
      current.map((post) => {
        if (post.id !== postId) {
          return post;
        }
        previousLiked = post.viewerHasLiked;
        previousCount = post._count.likes;
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
            const reason = payload.banReason
              ? ` Причина: ${payload.banReason}`
              : "";
            setActionMessage(`Вы заблокированы до ${until}.${reason}`);
          } else {
            setActionMessage("Доступ запрещён.");
          }
          throw new Error("forbidden");
        }
        throw new Error("failed");
      }

      const payload = (await response.json()) as LikeToggleResponse;
      if (!payload.data) {
        throw new Error("failed");
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

  const isSelf = Boolean(
    profile?.user && session?.user && session.user.email === profile.user.email
  );

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loadingMore,
    [nextCursor, loadingMore]
  );

  return (
    <div className="relative min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-16 pt-10">
        <Link href="/" className="text-xs text-slate-500">
          ← Назад к ленте
        </Link>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600">
            {actionMessage}
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

        {profile ? (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {profile.user.username ?? profile.user.name ?? "user"}
                </h1>
                <p className="text-sm text-slate-500">{profile.user.email}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Пишет здесь с {memberSinceLabel(profile.user.createdAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>Подписчики: {profile.stats.followersCount}</span>
                  <span>Подписки: {profile.stats.followingCount}</span>
                  <span>{profile.stats.postsCount} постов</span>
                </div>
              </div>
              {!isSelf && profile.user.username ? (
                <FollowButton
                  username={profile.user.username}
                  initialFollowing={profile.viewerFollows}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Посты</h2>
          {posts.length === 0 ? (
            <p className="text-sm text-slate-500">Постов пока нет.</p>
          ) : null}
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={handleToggleLike}
              showActions
            />
          ))}
        </section>

        {nextCursor ? (
          <button
            type="button"
            onClick={loadMorePosts}
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
