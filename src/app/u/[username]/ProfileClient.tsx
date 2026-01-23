"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import PostCard from "@/components/PostCard";
import { type PostWithMeta } from "@/lib/post-types";

type ProfileResponse = {
  data?: {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    image: string | null;
    createdAt: string;
    stats: {
      postsCount: number;
      followersCount: number;
      followingCount: number;
    };
    viewer: {
      isMe: boolean;
      isFollowing: boolean;
      isFriend: boolean;
    } | null;
  };
  error?: string;
};

type PostsResponse = {
  data?: PostWithMeta[];
  nextCursor?: string | null;
  totalCount?: number;
  error?: string;
};

type ToggleResponse = {
  data?: { following: boolean; isFriend: boolean };
  error?: string;
};

type FollowItem = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  viewer: {
    isFollowing: boolean;
    isFriend: boolean;
    isMe: boolean;
  };
};

type FollowListResponse = {
  items?: FollowItem[];
  nextCursor?: string | null;
  error?: string;
};

const formatMonthYear = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "недавно";
  }
  return date.toLocaleString("ru-RU", { month: "long", year: "numeric" });
};

export default function ProfileClient() {
  const params = useParams();
  const router = useRouter();
  const usernameParam =
    typeof params.username === "string" ? params.username : "";
  const { status } = useSession();
  const isUnauthed = status === "unauthenticated";
  const isLoadingSession = status === "loading";

  const [profile, setProfile] = useState<ProfileResponse["data"] | null>(null);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [followSaving, setFollowSaving] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<"followers" | "following">(
    "followers"
  );
  const [overlayItems, setOverlayItems] = useState<FollowItem[]>([]);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayLoadingMore, setOverlayLoadingMore] = useState(false);
  const [overlayNextCursor, setOverlayNextCursor] = useState<string | null>(null);
  const [overlayError, setOverlayError] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const handleDeletedPost = (postId: number) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
    setProfile((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        stats: {
          ...current.stats,
          postsCount: Math.max(0, current.stats.postsCount - 1),
        },
      };
    });
  };

  const handleDeleteError = (message: string) => {
    setError(message);
  };

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/users/${usernameParam}`, {
          credentials: "include",
        });
        if (response.status === 404) {
          router.replace("/404");
          return;
        }
        if (!response.ok) {
          throw new Error("Не удалось загрузить профиль.");
        }
        const payload = (await response.json()) as ProfileResponse;
        if (active) {
          setProfile(payload.data ?? null);
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

    const loadPosts = async () => {
      setLoadingPosts(true);
      try {
        const response = await fetch(`/api/users/${usernameParam}/posts`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Не удалось загрузить посты.");
        }
        const payload = (await response.json()) as PostsResponse;
        if (active) {
          setPosts(payload.data ?? []);
          setNextCursor(payload.nextCursor ?? null);
        }
      } catch {
        if (active) {
          setPosts([]);
        }
      } finally {
        if (active) {
          setLoadingPosts(false);
        }
      }
    };

    if (usernameParam) {
      loadProfile();
      loadPosts();
    }

    return () => {
      active = false;
    };
  }, [router, usernameParam]);

  const handleFollowToggle = async () => {
    if (!profile || profile.viewer?.isMe || isUnauthed || isLoadingSession) {
      return;
    }

    const prevViewer = profile.viewer;
    const prevStats = profile.stats;
    const nextFollowing = !prevViewer?.isFollowing;

    setProfile({
      ...profile,
      viewer: {
        ...(prevViewer ?? {
          isMe: false,
          isFollowing: false,
          isFriend: false,
        }),
        isFollowing: nextFollowing,
        isFriend: nextFollowing ? prevViewer?.isFriend ?? false : false,
      },
      stats: {
        ...prevStats,
        followersCount: Math.max(
          0,
          prevStats.followersCount + (nextFollowing ? 1 : -1)
        ),
      },
    });

    setFollowSaving(true);
    try {
      const response = await fetch("/api/follow/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: profile.username }),
      });

      if (!response.ok) {
        throw new Error("failed");
      }

      const payload = (await response.json()) as ToggleResponse;
      setProfile((current) => {
        if (!current || !current.viewer) {
          return current;
        }
        return {
          ...current,
          viewer: {
            ...current.viewer,
            isFollowing: Boolean(payload.data?.following),
            isFriend: Boolean(payload.data?.isFriend),
          },
        };
      });
    } catch {
      setProfile((current) => {
        if (!current || !prevViewer) {
          return current;
        }
        return {
          ...current,
          viewer: prevViewer,
          stats: prevStats,
        };
      });
    } finally {
      setFollowSaving(false);
    }
  };

  const handleStartDm = async () => {
    if (!profile?.username || isUnauthed || isLoadingSession) {
      return;
    }

    setDmError("");
    setDmLoading(true);
    try {
      const response = await fetch("/api/dm/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: profile.username }),
      });

      if (response.status === 401) {
        setDmError("Войдите, чтобы написать.");
        return;
      }

      if (!response.ok) {
        if (response.status === 400) {
          setDmError("Некорректный запрос.");
        } else if (response.status === 404) {
          setDmError("Пользователь не найден.");
        } else {
          setDmError("Ошибка сервера. Попробуйте позже.");
        }
        return;
      }

      const payload = (await response.json()) as {
        data?: { conversationId: string };
      };
      const conversationId = payload.data?.conversationId;
      if (!conversationId) {
        setDmError("Не удалось открыть диалог.");
        return;
      }

      router.push(`/messages/${conversationId}`);
    } catch {
      setDmError("Не удалось открыть диалог.");
    } finally {
      setDmLoading(false);
    }
  };

  const openOverlay = (mode: "followers" | "following") => {
    setOverlayMode(mode);
    setOverlayOpen(true);
  };

  const closeOverlay = () => {
    setOverlayOpen(false);
    setOverlayItems([]);
    setOverlayNextCursor(null);
    setOverlayError("");
  };

  const loadOverlay = useCallback(
    async (cursor?: string | null) => {
      if (!profile) {
        return;
      }
      const isInitial = !cursor;
      if (isInitial) {
        setOverlayLoading(true);
      } else {
        setOverlayLoadingMore(true);
      }

      try {
        const url = new URL(
          `/api/users/${profile.username}/${overlayMode}`,
          window.location.origin
        );
        url.searchParams.set("limit", "20");
        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }
        const response = await fetch(url.toString(), {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("failed");
        }
        const payload = (await response.json()) as FollowListResponse;
        const incoming = payload.items ?? [];
        setOverlayItems((current) =>
          isInitial ? incoming : [...current, ...incoming]
        );
        setOverlayNextCursor(payload.nextCursor ?? null);
      } catch {
        setOverlayError("Не удалось загрузить список.");
      } finally {
        if (isInitial) {
          setOverlayLoading(false);
        } else {
          setOverlayLoadingMore(false);
        }
      }
    },
    [overlayMode, profile]
  );

  useEffect(() => {
    if (!overlayOpen) {
      return;
    }
    setOverlayItems([]);
    setOverlayNextCursor(null);
    setOverlayError("");
    loadOverlay(null);
  }, [loadOverlay, overlayOpen, overlayMode]);

  useEffect(() => {
    if (!overlayOpen) {
      return;
    }
    const node = loadMoreRef.current;
    if (!node || !overlayNextCursor || overlayLoading || overlayLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && overlayNextCursor) {
        loadOverlay(overlayNextCursor);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    loadOverlay,
    overlayNextCursor,
    overlayLoading,
    overlayLoadingMore,
    overlayOpen,
  ]);

  const handleOverlayToggle = async (item: FollowItem) => {
    if (!item.username || item.viewer.isMe || isUnauthed) {
      return;
    }
    const prev = item;
    const optimisticFollowing = !item.viewer.isFollowing;
    const optimisticFriend = optimisticFollowing
      ? item.viewer.isFriend
      : false;

    setOverlayItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              viewer: {
                ...entry.viewer,
                isFollowing: optimisticFollowing,
                isFriend: optimisticFriend,
              },
            }
          : entry
      )
    );

    try {
      const response = await fetch("/api/follow/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: item.username }),
      });
      if (!response.ok) {
        throw new Error("failed");
      }
      const payload = (await response.json()) as ToggleResponse;
      setOverlayItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                viewer: {
                  ...entry.viewer,
                  isFollowing: Boolean(payload.data?.following),
                  isFriend: Boolean(payload.data?.isFriend),
                },
              }
            : entry
        )
      );
    } catch {
      setOverlayItems((current) =>
        current.map((entry) => (entry.id === item.id ? prev : entry))
      );
    }
  };

  const navigateToProfile = (username: string | null) => {
    if (!username) {
      return;
    }
    closeOverlay();
    router.push(`/u/${username}`);
  };

  const followLabel = useMemo(() => {
    if (!profile) {
      return null;
    }
    if (isUnauthed) {
      return "Войти, чтобы подписаться";
    }
    if (profile.viewer?.isMe) {
      return null;
    }
    if (profile.viewer?.isFriend) {
      return "Друзья";
    }
    if (profile.viewer?.isFollowing) {
      return "Вы подписаны";
    }
    return "Подписаться";
  }, [isUnauthed, profile]);

  const skeleton = (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 animate-pulse rounded-full bg-slate-200" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-white/80" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/80" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        {loading ? (
          skeleton
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : profile ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {profile.image ? (
                    <img
                      src={profile.image}
                      alt={profile.displayName ?? profile.username}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
                      {(profile.displayName || profile.username || "U")
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h1 className="text-2xl font-semibold text-slate-900">
                      {profile.displayName ?? `@${profile.username}`}
                    </h1>
                    <p className="text-sm text-slate-500">
                      @{profile.username}
                    </p>
                    {profile.bio ? (
                      <p className="mt-2 text-sm text-slate-600">
                        {profile.bio}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-slate-400">
                      Пишет здесь с {formatMonthYear(profile.createdAt)}
                    </p>
                  </div>
                </div>
                {profile.viewer?.isMe ? null : (
                  <div className="flex flex-col gap-2 sm:items-end">
                    {followLabel ? (
                      <button
                        type="button"
                        onClick={handleFollowToggle}
                        disabled={isUnauthed || isLoadingSession || followSaving}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        {followSaving ? "Обновляем..." : followLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleStartDm}
                      disabled={isUnauthed || isLoadingSession || dmLoading}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-60"
                    >
                      {isUnauthed ? "Войти, чтобы написать" : dmLoading ? "Открываем..." : "Написать"}
                    </button>
                    {dmError ? (
                      <p className="text-xs text-rose-500">{dmError}</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                <div>
                  <span className="font-semibold text-slate-900">
                    {profile.stats.postsCount}
                  </span>{" "}
                  постов
                </div>
                <div>
                  <Link
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      openOverlay("followers");
                    }}
                    className="hover:text-slate-900"
                  >
                    <span className="font-semibold text-slate-900">
                      {profile.stats.followersCount}
                    </span>{" "}
                    подписчиков
                  </Link>
                </div>
                <div>
                  <Link
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      openOverlay("following");
                    }}
                    className="hover:text-slate-900"
                  >
                    <span className="font-semibold text-slate-900">
                      {profile.stats.followingCount}
                    </span>{" "}
                    подписок
                  </Link>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              {loadingPosts ? (
                <p className="text-sm text-slate-500">Загрузка постов...</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-slate-500">
                  @{profile.username} пока ничего не написал
                </p>
              ) : (
                posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onDeleted={handleDeletedPost}
                    onDeleteError={handleDeleteError}
                  />
                ))
              )}
            </section>
          </>
        ) : null}
      </main>

      {overlayOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {overlayMode === "followers" ? "Подписчики" : "Подписки"}
              </h2>
              <button
                type="button"
                onClick={closeOverlay}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300"
              >
                Закрыть
              </button>
            </div>

            {overlayLoading ? (
              <div className="mt-6 space-y-3">
                <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            ) : overlayError ? (
              <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {overlayError}
              </div>
            ) : overlayItems.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">
                {overlayMode === "followers"
                  ? "Пока нет подписчиков"
                  : "Пока ни на кого не подписан"}
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {overlayItems.map((item) => {
                  const displayName =
                    item.displayName || item.username || "User";
                  const handle = item.username ? `@${item.username}` : "@user";
                  const label = item.viewer.isFriend
                    ? "Друзья"
                    : item.viewer.isFollowing
                    ? "Вы подписаны"
                    : "Подписаться";

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => navigateToProfile(item.username)}
                        className="flex items-center gap-3 text-left"
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={displayName}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                            {(displayName || "U").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {displayName}
                          </p>
                          <p className="text-xs text-slate-500">{handle}</p>
                        </div>
                      </button>

                      {!item.viewer.isMe ? (
                        <button
                          type="button"
                          onClick={() => handleOverlayToggle(item)}
                          disabled={isUnauthed || !item.username}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-60"
                        >
                          {label}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                <div ref={loadMoreRef} />
                {overlayLoadingMore ? (
                  <p className="text-xs text-slate-400">Загрузка...</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
