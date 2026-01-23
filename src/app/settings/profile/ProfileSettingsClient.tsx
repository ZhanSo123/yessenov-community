"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProfileResponse = {
  data?: { username: string; displayName: string | null; bio: string | null };
  error?: string;
  message?: string;
};

type ProfileSettingsClientProps = {
  initialUsername: string;
  initialDisplayName: string;
  initialBio: string;
};

export default function ProfileSettingsClient({
  initialUsername,
  initialDisplayName,
  initialBio,
}: ProfileSettingsClientProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setToast("");
    setSaving(true);

    try {
      const response = await fetch("/api/me/profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: initialUsername,
          displayName: displayName.trim() || undefined,
          bio: bio.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ProfileResponse
        | null;

      if (!response.ok) {
        if (payload?.error === "UNAUTHORIZED") {
          router.replace("/welcome");
          return;
        }
        if (payload?.error === "CONFLICT") {
          setError("Имя занято.");
          return;
        }
        if (payload?.error === "BAD_REQUEST") {
          if (payload?.message === "USERNAME_LOCKED") {
            setError("Username нельзя изменить.");
          } else {
            setError("Проверьте данные профиля.");
          }
          return;
        }
        setError("Не удалось сохранить профиль.");
        return;
      }

      if (!payload?.data?.username) {
        setError("Не удалось сохранить профиль.");
        return;
      }

      setToast("Профиль обновлён");
    } catch {
      setError("Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16">
        <header>
          <h1 className="text-3xl font-semibold">Профиль</h1>
          <p className="mt-2 text-sm text-slate-600">
            Обновите имя и био. Username изменить нельзя.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm"
        >
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          ) : null}
          {toast ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              {toast}
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-600">
              Username
              <input
                type="text"
                value={initialUsername}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Имя пользователя нельзя изменить
              </span>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Display name
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Как вас видно в ленте"
                maxLength={40}
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
              <span className="mt-1 block text-[11px] text-slate-400">
                {bio.length} / 160
              </span>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
