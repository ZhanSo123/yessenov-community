"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import UserSearchCard, {
  type UserSearchItem,
} from "@/components/UserSearchCard";

type SearchResponse = {
  items?: UserSearchItem[];
  nextCursor?: string | null;
  error?: string;
};

type ToggleResponse = {
  data?: { following: boolean; isFriend: boolean };
  error?: string;
};

const DEFAULT_LIMIT = 10;

export default function SearchPage() {
  const { status } = useSession();
  const isUnauthed = status === "unauthenticated";

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const activeQueryRef = useRef("");

  const normalizedQuery = useMemo(() => {
    let value = debouncedQuery.trim();
    if (value.startsWith("@")) {
      value = value.slice(1);
    }
    return value.trim();
  }, [debouncedQuery]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => window.clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    let active = true;
    const currentQuery = normalizedQuery;
    activeQueryRef.current = currentQuery;

    if (!currentQuery) {
      setItems([]);
      setNextCursor(null);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const url = new URL("/api/search/users", window.location.origin);
        url.searchParams.set("q", currentQuery);
        url.searchParams.set("limit", String(DEFAULT_LIMIT));
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          throw new Error("Не удалось загрузить пользователей.");
        }
        const payload = (await response.json()) as SearchResponse;
        if (active && activeQueryRef.current === currentQuery) {
          setItems(payload.items ?? []);
          setNextCursor(payload.nextCursor ?? null);
        }
      } catch (fetchError) {
        if (active) {
          setItems([]);
          setNextCursor(null);
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
  }, [debouncedQuery]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore || !activeQueryRef.current) {
      return;
    }

    setLoadingMore(true);
    try {
      const url = new URL("/api/search/users", window.location.origin);
      url.searchParams.set("q", activeQueryRef.current);
      url.searchParams.set("limit", String(DEFAULT_LIMIT));
      url.searchParams.set("cursor", nextCursor);
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить пользователей.");
      }
      const payload = (await response.json()) as SearchResponse;
      setItems((current) => [...current, ...(payload.items ?? [])]);
      setNextCursor(payload.nextCursor ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggle = async (item: UserSearchItem) => {
    if (!item.username || isUnauthed || pendingIds.has(item.id)) {
      return;
    }

    const prevViewer = item.viewer;
    setPendingIds((current) => new Set(current).add(item.id));
    setItems((current) =>
      current.map((user) => {
        if (user.id !== item.id) {
          return user;
        }
        const nextFollowing = !prevViewer.isFollowing;
        return {
          ...user,
          viewer: {
            ...user.viewer,
            isFollowing: nextFollowing,
            isFriend: nextFollowing ? user.viewer.isFriend : false,
          },
        };
      })
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
      const nextFollowing = Boolean(payload.data?.following);
      const nextIsFriend = Boolean(payload.data?.isFriend);
      setItems((current) =>
        current.map((user) =>
          user.id === item.id
            ? {
                ...user,
                viewer: {
                  ...user.viewer,
                  isFollowing: nextFollowing,
                  isFriend: nextIsFriend,
                },
              }
            : user
        )
      );
    } catch {
      setItems((current) =>
        current.map((user) =>
          user.id === item.id ? { ...user, viewer: prevViewer } : user
        )
      );
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  const emptyState = useMemo(() => {
    if (!normalizedQuery) {
      return "Найди людей по имени или @username";
    }
    if (!loading && !error && items.length === 0) {
      return "Никого не нашли";
    }
    return "";
  }, [normalizedQuery, error, items.length, loading]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Поиск</h1>
          <p className="text-sm text-slate-500">
            Ищи по @username или имени, чтобы быстрее найти друзей.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по @username или имени"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {emptyState ? (
          <div className="rounded-xl border border-slate-200 bg-white/90 p-6 text-sm text-slate-500">
            {emptyState}
          </div>
        ) : null}

        <section className="space-y-3">
          {loading && normalizedQuery ? (
            <>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                    <div className="space-y-2">
                      <div className="h-3 w-32 animate-pulse rounded-full bg-slate-200" />
                      <div className="h-2 w-20 animate-pulse rounded-full bg-slate-100" />
                    </div>
                  </div>
                  <div className="h-7 w-24 animate-pulse rounded-full bg-slate-200" />
                </div>
              ))}
            </>
          ) : null}

          {!loading
            ? items.map((item) => (
                <UserSearchCard
                  key={item.id}
                  item={item}
                  isUnauthed={isUnauthed}
                  isPending={pendingIds.has(item.id)}
                  onToggle={handleToggle}
                />
              ))
            : null}
        </section>

        {nextCursor && !loading ? (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="bubble-btn self-start rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 pressable"
          >
            {loadingMore ? "Загружаем..." : "Показать ещё"}
          </button>
        ) : null}
      </main>
    </div>
  );
}
