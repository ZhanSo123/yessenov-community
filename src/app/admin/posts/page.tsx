"use client";

import { useEffect, useMemo, useState } from "react";

type AdminPost = {
  id: number;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  deleteReason: string | null;
  author: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
  };
  deletedBy: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
  } | null;
  _count: { likes: number; replies: number };
};

type PostsResponse = {
  data?: AdminPost[];
  nextCursor?: string | null;
};

export default function AdminPostsPage() {
  const [query, setQuery] = useState("");
  const [deletedFilter, setDeletedFilter] = useState("all");
  const [sort, setSort] = useState("desc");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPosts = async (options?: { reset?: boolean; cursor?: string }) => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/admin/posts", window.location.origin);
      if (query.trim()) {
        url.searchParams.set("query", query.trim());
      }
      url.searchParams.set("sort", sort);
      if (deletedFilter !== "all") {
        url.searchParams.set("deleted", deletedFilter === "deleted" ? "1" : "0");
      }
      if (fromDate) {
        url.searchParams.set("from", fromDate);
      }
      if (toDate) {
        url.searchParams.set("to", toDate);
      }
      if (options?.cursor) {
        url.searchParams.set("cursor", options.cursor);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить посты");
      }

      const payload = (await response.json()) as PostsResponse;
      const incoming = payload.data ?? [];

      if (options?.reset) {
        setPosts(incoming);
      } else {
        setPosts((current) => [...current, ...incoming]);
      }
      setNextCursor(payload.nextCursor ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadPosts({ reset: true });
  };

  const updatePost = (id: number, patch: Partial<AdminPost>) => {
    setPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, ...patch } : post))
    );
  };

  const handleDelete = async (postId: number) => {
    const reason = window.prompt("Причина удаления (обязательно)") ?? undefined;

    if (!reason || !reason.trim()) {
      setError("Нужна причина для удаления.");
      return;
    }

    if (!window.confirm("Подтвердите удаление поста.")) {
      return;
    }

    const response = await fetch(`/api/admin/posts/${postId}/delete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });

    if (!response.ok) {
      setError("Не удалось скрыть пост");
      return;
    }

    const data = (await response.json()) as { data?: AdminPost };
    if (data.data) {
      updatePost(postId, {
        deletedAt: data.data.deletedAt,
        deleteReason: data.data.deleteReason,
      });
    }
  };

  const handleRestore = async (postId: number) => {
    if (!window.confirm("Восстановить пост?")) {
      return;
    }

    const response = await fetch(`/api/admin/posts/${postId}/restore`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      setError("Не удалось восстановить пост");
      return;
    }

    updatePost(postId, { deletedAt: null, deleteReason: null });
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loading,
    [nextCursor, loading]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Посты</h1>
        <p className="text-sm text-slate-600">Модерация контента.</p>
      </header>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по тексту или автору"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="desc">Сначала новые</option>
          <option value="asc">Сначала старые</option>
        </select>
        <select
          value={deletedFilter}
          onChange={(event) => setDeletedFilter(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Все</option>
          <option value="active">Активные</option>
          <option value="deleted">Скрытые</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Найти
        </button>
      </form>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {post.author.username ?? post.author.email} ·{" "}
                {new Date(post.createdAt).toLocaleString()}
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] uppercase">
                  {post.deletedAt ? "DELETED" : "ACTIVE"}
                </span>
                <span>ID: {post.id}</span>
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-800">
              {post.content.slice(0, 180) || "Репост"}
            </p>
            <div className="mt-2 text-xs text-slate-500">
              Replies: {post._count.replies} · Likes: {post._count.likes}
            </div>
            {post.deletedAt ? (
              <div className="mt-2 text-xs text-rose-600">
                Скрыт {new Date(post.deletedAt).toLocaleDateString()}
                {post.deleteReason ? ` · ${post.deleteReason}` : ""}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {post.deletedAt ? (
                <button
                  type="button"
                  onClick={() => handleRestore(post.id)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDelete(post.id)}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => loadPosts({ cursor: nextCursor })}
          disabled={!canLoadMore}
          className="rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
        >
          {loading ? "Загружаем..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
