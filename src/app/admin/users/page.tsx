"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type AdminUser = {
  id: string;
  email: string;
  username: string | null;
  role: "USER" | "MOD" | "ADMIN";
  bannedUntil: string | null;
  banReason: string | null;
  shadowBannedAt: string | null;
  shadowBanReason: string | null;
  createdAt: string;
};

type UsersResponse = {
  data?: AdminUser[];
  nextCursor?: string | null;
};

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserEmail = session?.user?.email ?? null;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("desc");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = async (options?: { reset?: boolean; cursor?: string }) => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/admin/users", window.location.origin);
      if (query.trim()) {
        url.searchParams.set("query", query.trim());
      }
      url.searchParams.set("sort", sort);
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
        throw new Error("Не удалось загрузить пользователей");
      }

      const payload = (await response.json()) as UsersResponse;
      const incoming = payload.data ?? [];

      if (options?.reset) {
        setUsers(incoming);
      } else {
        setUsers((current) => [...current, ...incoming]);
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
    loadUsers({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadUsers({ reset: true });
  };

  const updateUser = (id: string, patch: Partial<AdminUser>) => {
    setUsers((current) =>
      current.map((user) => (user.id === id ? { ...user, ...patch } : user))
    );
  };

  const handleBan = async (userId: string) => {
    const daysInput = window.prompt("На сколько дней? (по умолчанию 7)");
    const reason = window.prompt("Причина (обязательно)") ?? undefined;

    if (!reason || !reason.trim()) {
      setError("Нужна причина для бана.");
      return;
    }

    const payload: Record<string, unknown> = {};
    const days = daysInput ? Number(daysInput) : undefined;
    if (days && Number.isFinite(days)) {
      payload.days = days;
    }
    payload.reason = reason.trim();

    const response = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError("Не удалось забанить пользователя");
      return;
    }

    const data = (await response.json()) as {
      data?: { bannedUntil: string | null; banReason: string | null };
    };

    if (data.data) {
      updateUser(userId, {
        bannedUntil: data.data.bannedUntil,
        banReason: data.data.banReason,
      });
    }
  };

  const handleUnban = async (userId: string) => {
    if (!window.confirm("Разбанить пользователя?")) {
      return;
    }

    const response = await fetch(`/api/admin/users/${userId}/unban`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      setError("Не удалось разбанить пользователя");
      return;
    }

    updateUser(userId, { bannedUntil: null, banReason: null });
  };

  const handleShadowBan = async (userId: string) => {
    const reason = window.prompt("Причина shadowban (обязательно)") ?? undefined;

    if (!reason || !reason.trim()) {
      setError("Нужна причина для shadowban.");
      return;
    }

    const response = await fetch(`/api/admin/users/${userId}/shadowban`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });

    if (!response.ok) {
      setError("Не удалось применить shadowban.");
      return;
    }

    const payload = (await response.json()) as {
      data?: { shadowBannedAt: string | null; shadowBanReason: string | null };
    };
    if (payload.data) {
      updateUser(userId, {
        shadowBannedAt: payload.data.shadowBannedAt,
        shadowBanReason: payload.data.shadowBanReason,
      });
    }
  };

  const handleShadowUnban = async (userId: string) => {
    if (!window.confirm("Снять shadowban?")) {
      return;
    }

    const response = await fetch(`/api/admin/users/${userId}/shadowunban`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      setError("Не удалось снять shadowban.");
      return;
    }

    updateUser(userId, { shadowBannedAt: null, shadowBanReason: null });
  };

  const handleRoleChange = async (userId: string, role: AdminUser["role"]) => {
    const response = await fetch(`/api/admin/users/${userId}/role`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });

    if (!response.ok) {
      setError("Не удалось обновить роль");
      return;
    }

    updateUser(userId, { role });
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loading,
    [nextCursor, loading]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
        <p className="text-sm text-slate-600">
          Управление ролями и банами.
        </p>
      </header>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Email или username"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="desc">Сначала новые</option>
          <option value="asc">Сначала старые</option>
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/90">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Ban</th>
              <th className="px-4 py-3">Shadowban</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = Boolean(
                currentUserEmail && user.email === currentUserEmail
              );
              const bannedLabel = user.bannedUntil
                ? new Date(user.bannedUntil).toLocaleDateString()
                : "—";
              const shadowLabel = user.shadowBannedAt
                ? new Date(user.shadowBannedAt).toLocaleDateString()
                : "—";

              return (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{user.username ?? "—"}</span>
                      {user.bannedUntil ? (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] uppercase text-slate-500">
                          BANNED
                        </span>
                      ) : null}
                      {user.shadowBannedAt ? (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] uppercase text-slate-500">
                          SHADOW
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={isSelf}
                      onChange={(event) =>
                        handleRoleChange(
                          user.id,
                          event.target.value as AdminUser["role"]
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="USER">USER</option>
                      <option value="MOD">MOD</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-600">{bannedLabel}</div>
                    {user.banReason ? (
                      <div className="text-[11px] text-slate-400">
                        {user.banReason}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-600">{shadowLabel}</div>
                    {user.shadowBanReason ? (
                      <div className="text-[11px] text-slate-400">
                        {user.shadowBanReason}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {user.bannedUntil ? (
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => handleUnban(user.id)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => handleBan(user.id)}
                        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Ban
                      </button>
                    )}
                    {user.shadowBannedAt ? (
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => handleShadowUnban(user.id)}
                        className="ml-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50"
                      >
                        Unshadow
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => handleShadowBan(user.id)}
                        className="ml-2 rounded-full border border-slate-900 px-3 py-1 text-xs text-slate-900 disabled:opacity-50"
                      >
                        Shadowban
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => loadUsers({ cursor: nextCursor })}
          disabled={!canLoadMore}
          className="rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
        >
          {loading ? "Загружаем..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
