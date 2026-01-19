"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

type OnboardingResponse = {
  data?: { id: string; username: string | null };
  error?: string;
};

const buildSuggestion = (email?: string | null, name?: string | null) => {
  const base = (name || email?.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return base || "user";
};

export default function OnboardingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const user = session?.user ?? null;

  const suggested = useMemo(() => {
    const fromQuery = searchParams.get("u");
    if (fromQuery) {
      return fromQuery.toLowerCase();
    }
    return buildSuggestion(user?.email ?? null, user?.name ?? null);
  }, [searchParams, user?.email, user?.name]);

  const [username, setUsername] = useState(suggested);
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "loading") {
      return;
    }
    if (!user) {
      router.replace("/welcome");
      return;
    }
    if (
      !user.inviteAcceptedAt &&
      user.role !== "MOD" &&
      user.role !== "ADMIN"
    ) {
      router.replace("/invite");
      return;
    }
    if (user.username) {
      router.replace("/");
    }
  }, [status, user, router]);

  useEffect(() => {
    if (!username && suggested) {
      setUsername(suggested);
    }
  }, [suggested, username]);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/me/profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          age: age ? Number(age) : undefined,
          bio: bio.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | OnboardingResponse
        | null;

      if (!response.ok) {
        if (payload?.error === "BAD_REQUEST") {
          setError("Проверьте данные профиля.");
        } else if (payload?.error === "CONFLICT") {
          setError("Этот username уже занят.");
        } else if (payload?.error === "UNAUTHORIZED") {
          router.replace("/welcome");
        } else {
          setError("Не удалось сохранить профиль.");
        }
        return;
      }

      if (!payload?.data?.id) {
        setError("Не удалось сохранить профиль.");
        return;
      }

      router.refresh();
      router.replace("/");
    } catch {
      setError("Не удалось сохранить профиль.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Настройка профиля</h1>
          <p className="text-sm text-slate-600">
            Остался один шаг, чтобы публиковать посты.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-600">
              Username
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="username"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Возраст
              <input
                type="number"
                min={13}
                max={99}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="18"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Bio
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={160}
                className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Пара строк о себе"
              />
            </label>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Сохраняем..." : "Сохранить профиль"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
