"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import PostCard from "@/components/PostCard";
import { type PostWithMeta } from "@/lib/post-types";
import { useI18n } from "@/lib/i18n/useI18n";

type ProfileResponse = {
  data?: {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    image: string | null;
    createdAt: string;
    pinnedPostId: number | null;
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

type TabKey = "posts" | "replies";

const PROFILE_TABS = [
  { key: "posts", labelKey: "profile.tabs.posts", endpoint: "posts" },
  { key: "replies", labelKey: "profile.tabs.replies", endpoint: "replies" },
] as const satisfies readonly {
  key: TabKey;
  labelKey: "profile.tabs.posts" | "profile.tabs.replies";
  endpoint: "posts" | "replies";
}[];

type TabState = {
  items: PostWithMeta[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  nextCursor: string | null;
  totalCount: number;
};

const createTabState = (): TabState => ({
  items: [],
  loading: false,
  loaded: false,
  error: null,
  nextCursor: null,
  totalCount: 0,
});

const formatMonthYear = (value: string, locale: string, fallback: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toLocaleString(locale, { month: "long", year: "numeric" });
};

export default function ProfileClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const usernameParam =
    typeof params.username === "string" ? params.username : "";
  const { status } = useSession();
  const { t, locale } = useI18n();
  const isUnauthed = status === "unauthenticated";
  const isLoadingSession = status === "loading";

  const [profile, setProfile] = useState<ProfileResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followSaving, setFollowSaving] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState("");
  const [pinnedPost, setPinnedPost] = useState<PostWithMeta | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<"followers" | "following">(
    "followers"
  );
  const [overlayItems, setOverlayItems] = useState<FollowItem[]>([]);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayLoadingMore, setOverlayLoadingMore] = useState(false);
  const [overlayNextCursor, setOverlayNextCursor] = useState<string | null>(null);
  const [overlayError, setOverlayError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [followPulse, setFollowPulse] = useState(false);
  const prevFollowingRef = useRef<boolean | null>(null);
  const [tabState, setTabState] = useState<Record<TabKey, TabState>>({
    posts: createTabState(),
    replies: createTabState(),
  });

  const activeTab = useMemo<TabKey>(() => {
    const value = searchParams.get("tab");
    return value === "replies" ? "replies" : "posts";
  }, [searchParams]);

  const setTab = useCallback(
    (next: TabKey) => {
      if (!usernameParam) {
        return;
      }
      const params = new URLSearchParams(searchParams);
      if (next === "posts") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const query = params.toString();
      router.replace(`/u/${usernameParam}${query ? `?${query}` : ""}`);
    },
    [router, searchParams, usernameParam]
  );

  const handleDeletedPost = (postId: number) => {
    setTabState((current) => {
      const next = { ...current } as Record<TabKey, TabState>;
      (Object.keys(next) as TabKey[]).forEach((key) => {
        const tab = next[key];
        if (!tab.items.some((post) => post.id === postId)) {
          return;
        }
        next[key] = {
          ...tab,
          items: tab.items.filter((post) => post.id !== postId),
        };
      });
      return next;
    });
    setProfile((current) => {
      if (!current) {
        return current;
      }
      const shouldClearPin = current.pinnedPostId === postId;
      if (activeTab !== "posts") {
        return shouldClearPin
          ? { ...current, pinnedPostId: null }
          : current;
      }
      return {
        ...current,
        stats: {
          ...current.stats,
          postsCount: Math.max(0, current.stats.postsCount - 1),
        },
        pinnedPostId: shouldClearPin ? null : current.pinnedPostId,
      };
    });
    if (profile?.pinnedPostId === postId) {
      setPinnedPost(null);
    }
  };

  const handleDeleteError = (message: string) => {
    setError(message);
  };

  const loadTab = useCallback(
    async (tab: TabKey) => {
      if (!usernameParam) {
        return;
      }
      const config = PROFILE_TABS.find((entry) => entry.key === tab);
      if (!config) {
        return;
      }

      setTabState((current) => ({
        ...current,
        [tab]: {
          ...current[tab],
          loading: true,
          error: null,
        },
      }));

      try {
        const response = await fetch(
          `/api/users/${usernameParam}/${config.endpoint}`,
          { credentials: "include" }
        );
        if (!response.ok) {
          throw new Error(t("profile.error.load_content"));
        }
        const payload = (await response.json()) as PostsResponse;
        setTabState((current) => ({
          ...current,
          [tab]: {
            ...current[tab],
            items: payload.data ?? [],
            nextCursor: payload.nextCursor ?? null,
            totalCount: payload.totalCount ?? current[tab].totalCount,
            loading: false,
            loaded: true,
            error: null,
          },
        }));
      } catch (fetchError) {
        setTabState((current) => ({
          ...current,
          [tab]: {
            ...current[tab],
            items: [],
            nextCursor: null,
            loading: false,
            loaded: true,
            error:
              fetchError instanceof Error
                ? fetchError.message
                : t("profile.error.load_generic"),
          },
        }));
      }
    },
    [usernameParam]
  );

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
          throw new Error(t("profile.error.load_profile"));
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
              : t("profile.error.load_generic")
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    if (usernameParam) {
      setTabState({
        posts: createTabState(),
        replies: createTabState(),
      });
      setPinnedPost(null);
      loadProfile();
    }

    return () => {
      active = false;
    };
  }, [router, usernameParam]);

  useEffect(() => {
    if (!usernameParam) {
      return;
    }
    const tab = tabState[activeTab];
    if (!tab.loaded && !tab.loading) {
      loadTab(activeTab);
    }
  }, [activeTab, loadTab, tabState, usernameParam]);

  useEffect(() => {
    const following = profile?.viewer?.isFollowing ?? null;
    if (prevFollowingRef.current === null) {
      prevFollowingRef.current = following;
      return;
    }
    if (!prevFollowingRef.current && following) {
      setFollowPulse(true);
      const timer = window.setTimeout(() => setFollowPulse(false), 220);
      prevFollowingRef.current = following;
      return () => window.clearTimeout(timer);
    }
    prevFollowingRef.current = following;
  }, [profile?.viewer?.isFollowing]);

  useEffect(() => {
    if (!shareStatus) {
      return;
    }
    const timer = window.setTimeout(() => setShareStatus(""), 2200);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!profileMenuRef.current) {
        return;
      }
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!profile?.pinnedPostId) {
      setPinnedPost(null);
      return;
    }
    let active = true;
    const loadPinned = async () => {
      try {
        const response = await fetch(`/api/posts/${profile.pinnedPostId}`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("failed");
        }
        const payload = (await response.json()) as {
          data?: { post?: PostWithMeta };
        };
        if (active) {
          setPinnedPost(payload.data?.post ?? null);
        }
      } catch {
        if (active) {
          setPinnedPost(null);
        }
      }
    };
    loadPinned();
    return () => {
      active = false;
    };
  }, [profile?.pinnedPostId]);

  const handleShareProfile = async () => {
    if (!profile?.username) {
      return;
    }
    const url = `${window.location.origin}/u/${profile.username}`;
    try {
      if (navigator?.share) {
        await navigator.share({
          title: profile.displayName ?? `@${profile.username}`,
          url,
        });
        setShareStatus(t("profile.share.link_shared"));
        return;
      }
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareStatus(t("profile.share.link_copied"));
        return;
      }
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setShareStatus(t("profile.share.link_copied"));
    } catch {
      setShareStatus(t("profile.share.failed"));
    }
  };

  const handleCopyUsername = async () => {
    if (!profile?.username) {
      return;
    }
    const handle = `@${profile.username}`;
    try {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(handle);
        setShareStatus(t("profile.share.username_copied"));
        return;
      }
      const input = document.createElement("input");
      input.value = handle;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setShareStatus(t("profile.share.username_copied"));
    } catch {
      setShareStatus(t("profile.share.username_failed"));
    }
  };

  const handleReportUser = async () => {
    if (!profile?.username) {
      return;
    }
    if (isUnauthed || isLoadingSession) {
      setShareStatus(t("profile.report.sign_in"));
      return;
    }
    const reason = window
      .prompt(t("profile.report.prompt"))?.trim();
    if (!reason) {
      return;
    }
    setShareStatus(t("profile.report.sending"));
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `REPORT_USER @${profile.username}: ${reason}`,
          currentPath: `/u/${profile.username}`,
        }),
      });
      if (!response.ok) {
        setShareStatus(t("profile.report.failed"));
        return;
      }
      setShareStatus(t("profile.report.sent"));
    } catch {
      setShareStatus(t("profile.report.failed"));
    }
  };

  const handlePinToggle = async (post: PostWithMeta) => {
    if (!profile?.viewer?.isMe || typeof post.id !== "number") {
      return;
    }
    const prevPinned = profile.pinnedPostId ?? null;
    const prevPinnedPost = pinnedPost;
    const nextPinned = prevPinned === post.id ? null : post.id;

    setProfile({
      ...profile,
      pinnedPostId: nextPinned,
    });
    setPinnedPost(nextPinned ? post : null);
    setPinSaving(true);

    try {
      const response = await fetch("/api/me/pin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: nextPinned }),
      });
      if (!response.ok) {
        throw new Error("failed");
      }
    } catch {
      setProfile({
        ...profile,
        pinnedPostId: prevPinned,
      });
      setPinnedPost(prevPinned ? prevPinnedPost : null);
      setShareStatus(t("profile.pin.failed"));
    } finally {
      setPinSaving(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!profile || profile.viewer?.isMe || isUnauthed || isLoadingSession) {
      return;
    }

    const prevViewer = profile.viewer;
    const prevStats = profile.stats;
    const nextFollowing = !prevViewer?.isFollowing;
    if (navigator?.vibrate && nextFollowing) {
      navigator.vibrate(10);
    }

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
        setDmError(t("profile.dm.sign_in"));
        return;
      }

      if (!response.ok) {
        if (response.status === 400) {
          setDmError(t("profile.dm.invalid_request"));
        } else if (response.status === 404) {
          setDmError(t("profile.dm.not_found"));
        } else {
          setDmError(t("profile.dm.server_error"));
        }
        return;
      }

      const payload = (await response.json()) as {
        data?: { conversationId: string };
      };
      const conversationId = payload.data?.conversationId;
      if (!conversationId) {
        setDmError(t("profile.dm.open_failed"));
        return;
      }

      router.push(`/messages/${conversationId}`);
    } catch {
      setDmError(t("profile.dm.open_failed"));
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
        setOverlayError(t("profile.overlay.error"));
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
    if (profile.viewer?.isMe) {
      return null;
    }
    return profile.viewer?.isFollowing
      ? t("profile.follow.unfollow")
      : t("profile.follow.follow");
  }, [profile, t]);

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
    <div className="min-h-screen min-h-[100svh] bg-[color:var(--background)] text-[color:var(--foreground)]">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
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
                      {(profile.displayName || profile.username || t("common.user"))
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h1 className="text-2xl font-semibold text-slate-900">
                      {profile.displayName ?? `@${profile.username}`}
                    </h1>
                    <button
                      type="button"
                      onClick={handleCopyUsername}
                      className="text-left text-sm text-slate-500 transition hover:text-slate-900"
                      aria-label={t("profile.menu.copy_username")}
                    >
                      @{profile.username}
                    </button>
                    {profile.bio ? (
                      <p className="mt-2 text-sm text-slate-600">
                        {profile.bio}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-slate-400">
                      {t("profile.member_since", {
                        date: formatMonthYear(
                          profile.createdAt,
                          locale,
                          t("profile.recent")
                        ),
                      })}
                    </p>
                  </div>
                </div>
                {profile.viewer?.isMe ? (
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div ref={profileMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setProfileMenuOpen((open) => !open)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 transition hover:border-[#6495ED]/40 hover:text-[#6495ED]"
                        aria-label={t("profile.menu.title")}
                      >
                        ⋯
                      </button>
                      {profileMenuOpen ? (
                        <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setProfileMenuOpen(false);
                              router.push("/settings/profile");
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50"
                          >
                            {t("profile.menu.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileMenuOpen(false);
                              handleShareProfile();
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50"
                          >
                            {t("profile.menu.share")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {shareStatus ? (
                      <p className="text-xs text-slate-400">{shareStatus}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:items-end">
                    {followLabel ? (
                      <button
                        type="button"
                        onClick={handleFollowToggle}
                        disabled={isUnauthed || isLoadingSession || followSaving}
                        className={`bubble-btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 pressable ${
                          followPulse ? "animate-pop" : ""
                        }`}
                      >
                        {followSaving ? t("profile.follow.pending") : followLabel}
                      </button>
                    ) : null}
                    {isUnauthed ? (
                      <p className="text-xs text-slate-400">
                        {t("profile.follow.sign_in_hint")}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStartDm}
                        disabled={isUnauthed || isLoadingSession || dmLoading}
                        className="bubble-btn rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 pressable"
                      >
                        {dmLoading ? t("profile.dm.opening") : t("profile.dm.write")}
                      </button>
                      <div ref={profileMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setProfileMenuOpen((open) => !open)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 transition hover:border-[#6495ED]/40 hover:text-[#6495ED]"
                          aria-label={t("profile.menu.title")}
                        >
                          ⋯
                        </button>
                        {profileMenuOpen ? (
                          <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setProfileMenuOpen(false);
                                handleShareProfile();
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50"
                            >
                              {t("profile.menu.share")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProfileMenuOpen(false);
                                handleReportUser();
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50"
                            >
                              {t("profile.menu.report")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {dmError ? (
                      <p className="text-xs text-rose-500">{dmError}</p>
                    ) : null}
                    {shareStatus ? (
                      <p className="text-xs text-slate-400">{shareStatus}</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setTab("posts")}
                  className="text-left hover:text-slate-900"
                >
                  <span className="font-semibold text-slate-900">
                    {profile.stats.postsCount}
                  </span>{" "}
                  {t("profile.stats.posts")}
                </button>
                <button
                  type="button"
                  onClick={() => openOverlay("followers")}
                  className="text-left hover:text-slate-900"
                >
                  <span className="font-semibold text-slate-900">
                    {profile.stats.followersCount}
                  </span>{" "}
                  {t("profile.stats.followers")}
                </button>
                <button
                  type="button"
                  onClick={() => openOverlay("following")}
                  className="text-left hover:text-slate-900"
                >
                  <span className="font-semibold text-slate-900">
                    {profile.stats.followingCount}
                  </span>{" "}
                  {t("profile.stats.following")}
                </button>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap gap-2">
                  {PROFILE_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTab(tab.key)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        activeTab === tab.key
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {t(tab.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              {tabState[activeTab].loading ? (
                <p className="text-sm text-slate-500">{t("common.loading")}</p>
              ) : tabState[activeTab].error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {tabState[activeTab].error}
                </div>
              ) : tabState[activeTab].items.length === 0 &&
                !(activeTab === "posts" && pinnedPost) ? (
                <p className="text-sm text-slate-500">
                  {activeTab === "posts"
                    ? t("profile.empty.posts", {
                        handle: `@${profile.username}`,
                      })
                    : t("profile.empty.replies", {
                        handle: `@${profile.username}`,
                      })}
                </p>
              ) : (
                <>
                  {activeTab === "posts" && pinnedPost ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <span>{t("profile.pin.pinned")}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <span>{t("profile.pin.author_post")}</span>
                      </div>
                      <PostCard
                        post={pinnedPost}
                        onDeleted={handleDeletedPost}
                        onDeleteError={handleDeleteError}
                        highlight
                        menuItems={
                          profile.viewer?.isMe
                            ? [
                                {
                                  key: "pin",
                                  label: t("profile.pin.unpin"),
                                  onClick: () => handlePinToggle(pinnedPost),
                                  disabled: pinSaving,
                                },
                              ]
                            : undefined
                        }
                      />
                    </div>
                  ) : null}
                  {(activeTab === "posts" && profile.pinnedPostId
                    ? tabState[activeTab].items.filter(
                        (post) => post.id !== profile.pinnedPostId
                      )
                    : tabState[activeTab].items
                  ).map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onDeleted={handleDeletedPost}
                      onDeleteError={handleDeleteError}
                      menuItems={
                        activeTab === "posts" && profile.viewer?.isMe
                          ? [
                              {
                                key: "pin",
                                label:
                                  profile.pinnedPostId === post.id
                                    ? t("profile.pin.unpin")
                                    : t("profile.pin.pin"),
                                onClick: () => handlePinToggle(post),
                                disabled: pinSaving,
                              },
                            ]
                          : undefined
                      }
                    />
                  ))}
                </>
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
                {overlayMode === "followers"
                  ? t("profile.overlay.followers")
                  : t("profile.overlay.following")}
              </h2>
              <button
                type="button"
                onClick={closeOverlay}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300"
              >
                {t("profile.overlay.close")}
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
                  ? t("profile.overlay.empty_followers")
                  : t("profile.overlay.empty_following")}
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {overlayItems.map((item) => {
                  const displayName =
                    item.displayName || item.username || t("common.user");
                  const handle = item.username ? `@${item.username}` : "@user";
                  const label = item.viewer.isFriend
                    ? t("profile.overlay.friends")
                    : item.viewer.isFollowing
                    ? t("profile.overlay.following_state")
                    : t("profile.overlay.follow");

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
                            {(displayName || t("common.user"))
                              .slice(0, 1)
                              .toUpperCase()}
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
                          className="bubble-btn rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 pressable"
                        >
                          {label}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                <div ref={loadMoreRef} />
                {overlayLoadingMore ? (
                  <p className="text-xs text-slate-400">
                    {t("profile.overlay.loading")}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
