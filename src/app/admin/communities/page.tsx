"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Community = {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
  isPrivate: boolean;
  facultyCode: string | null;
  courseYear: number | null;
  _count?: { posts: number; members: number };
};

type CommunityResponse = {
  data?: Community[];
};

export default function AdminCommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Community["type"]>("OPEN");
  const [isPrivate, setIsPrivate] = useState(false);
  const [facultyCode, setFacultyCode] = useState("");
  const [courseYear, setCourseYear] = useState("");
  const needsFaculty = type === "FACULTY" || type === "COURSE";
  const needsCourse = type === "COURSE";

  useEffect(() => {
    if (type === "TEACHERS") {
      setIsPrivate(true);
    }
  }, [type]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/communities", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Не удалось загрузить сообщества");
        }
        const payload = (await response.json()) as CommunityResponse;
        if (active) {
          setCommunities(payload.data ?? []);
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

    load();
    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setSlug("");
    setTitle("");
    setDescription("");
    setType("OPEN");
    setIsPrivate(false);
    setFacultyCode("");
    setCourseYear("");
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");

    if (!slug.trim() || !title.trim()) {
      setCreateError("Slug и название обязательны.");
      return;
    }

    if ((type === "FACULTY" || type === "COURSE") && !facultyCode.trim()) {
      setCreateError("Нужен код факультета.");
      return;
    }

    if (type === "COURSE" && !courseYear.trim()) {
      setCreateError("Нужен курс.");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/admin/communities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          title: title.trim(),
          description: description.trim(),
          type,
          isPrivate,
          facultyCode: facultyCode.trim() || undefined,
          courseYear: courseYear ? Number(courseYear) : undefined,
        }),
      });

      if (!response.ok) {
        setCreateError("Не удалось создать сообщество.");
        return;
      }

      const payload = (await response.json()) as { data?: Community };
      if (payload.data) {
        setCommunities((current) => [payload.data!, ...current]);
        resetForm();
      }
    } catch {
      setCreateError("Не удалось создать сообщество.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Сообщества</h1>
        <p className="text-sm text-slate-600">
          Управление модераторами на уровне сообществ.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
      >
        <div className="flex flex-wrap gap-3">
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="slug"
            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Название"
            className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as Community["type"])}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="OPEN">OPEN</option>
            <option value="FACULTY">FACULTY</option>
            <option value="COURSE">COURSE</option>
            <option value="TEACHERS">TEACHERS</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
              disabled={type === "TEACHERS"}
            />
            Private
          </label>
          <input
            value={facultyCode}
            onChange={(event) => setFacultyCode(event.target.value)}
            placeholder="Faculty code"
            disabled={!needsFaculty}
            className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          />
          <input
            value={courseYear}
            onChange={(event) => setCourseYear(event.target.value)}
            placeholder="Course"
            disabled={!needsCourse}
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={creating}
            className="bubble-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60 pressable"
          >
            {creating ? "Создаём..." : "Создать"}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Описание"
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        {createError ? (
          <p className="mt-2 text-xs text-rose-500">{createError}</p>
        ) : null}
      </form>

      <div className="grid gap-3">
        {communities.map((community) => (
          <div
            key={community.id}
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {community.title}
                </h2>
                <p className="text-xs text-slate-500">/{community.slug}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {community.type}
                  {community.facultyCode ? ` · ${community.facultyCode}` : ""}
                  {community.courseYear ? ` · ${community.courseYear} курс` : ""}
                </p>
              </div>
              <Link
                href={`/admin/communities/${community.slug}/mods`}
                className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold pressable"
              >
                Manage mods
              </Link>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {community.description || "Описание не задано."}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Постов: {community._count?.posts ?? 0}</span>
              <span>Участников: {community._count?.members ?? 0}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
