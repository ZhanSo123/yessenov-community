"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Moderator = {
  id: string;
  role: "MEMBER" | "MOD" | "OWNER";
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
    role: string;
  };
};

type ModsResponse = {
  data?: Moderator[];
  community?: { id: number; slug: string; title: string };
};

export default function CommunityModsPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [mods, setMods] = useState<Moderator[]>([]);
  const [community, setCommunity] = useState<ModsResponse["community"] | null>(
    null
  );
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<"MEMBER" | "MOD" | "OWNER">("MEMBER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMods = async () => {
    if (!slug) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/communities/${slug}/mods`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить модераторов");
      }

      const payload = (await response.json()) as ModsResponse;
      setMods(payload.data ?? []);
      setCommunity(payload.community ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleAdd = async () => {
    if (!identifier.trim()) {
      setError("Введите email или username");
      return;
    }

    const payload: Record<string, string> = {};
    if (identifier.includes("@")) {
      payload.email = identifier.trim();
    } else {
      payload.username = identifier.trim();
    }
    payload.role = role;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/communities/${slug}/mods`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Не удалось добавить модератора");
      }

      setIdentifier("");
      setRole("MEMBER");
      await loadMods();
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!window.confirm("Удалить модератора?")) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/communities/${slug}/mods?userId=${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось удалить модератора");
      }

      await loadMods();
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Участники {community ? `/${community.slug}` : ""}
        </h1>
        <p className="text-sm text-slate-600">
          Добавляйте участников и назначайте роли.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Email или username"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "MEMBER" | "MOD" | "OWNER")
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="MEMBER">MEMBER</option>
            <option value="MOD">MOD</option>
            <option value="OWNER">OWNER</option>
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading}
            className="bubble-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60 pressable"
          >
            Добавить
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

      <div className="space-y-3">
        {mods.map((mod) => (
          <div
            key={mod.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {mod.user.username ?? mod.user.email}
              </p>
              <p className="text-xs text-slate-500">{mod.user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                {mod.role}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(mod.user.id)}
                className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
