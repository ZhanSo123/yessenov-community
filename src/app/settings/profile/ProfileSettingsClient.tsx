"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FACULTY_OPTIONS } from "@/lib/faculty-interests";
import {
  INTEREST_SUGGESTIONS,
  suggestInterestsFromProfile,
} from "@/lib/interests";
import { useI18n } from "@/lib/i18n/useI18n";

type ProfileResponse = {
  data?: {
    username: string;
    displayName: string | null;
    bio: string | null;
    image?: string | null;
    faculty?: string | null;
    course?: number | null;
    interests?: string[];
  };
  error?: string;
  message?: string;
};

const parseInterests = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const formatInterests = (items: string[]) => items.join(", ");

type ProfileSettingsClientProps = {
  initialUsername: string;
  initialDisplayName: string;
  initialBio: string;
  initialImage: string;
  initialFaculty: string;
  initialCourse: string;
  initialInterests: string;
};

export default function ProfileSettingsClient({
  initialUsername,
  initialDisplayName,
  initialBio,
  initialImage,
  initialFaculty,
  initialCourse,
  initialInterests,
}: ProfileSettingsClientProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [faculty, setFaculty] = useState(initialFaculty);
  const [course, setCourse] = useState(initialCourse);
  const [interests, setInterests] = useState(initialInterests);
  const [interestError, setInterestError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialImage || null
  );
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const interestsList = useMemo(() => parseInterests(interests), [interests]);
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const resizeImageToSquare = (dataUrl: string) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("noctx"));
          return;
        }
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => reject(new Error("img"));
      img.src = dataUrl;
    });

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }
    setAvatarError("");
    setAvatarLoading(true);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("type");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("size");
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const resized = await resizeImageToSquare(dataUrl);
      setAvatarPreview(resized);
      setAvatarDirty(true);
    } catch (imageError) {
      if (imageError instanceof Error && imageError.message === "size") {
        setAvatarError(t("settings_profile.error.avatar_size"));
      } else if (imageError instanceof Error && imageError.message === "type") {
        setAvatarError(t("settings_profile.error.avatar_format"));
      } else {
        setAvatarError(t("settings_profile.error.avatar_process"));
      }
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleAvatarRemove = () => {
    setAvatarError("");
    setAvatarPreview(null);
    setAvatarDirty(true);
  };

  const toggleInterest = (value: string) => {
    const normalized = value.toLowerCase();
    const current = interestsList;
    const exists = current.some((item) => item.toLowerCase() === normalized);
    if (exists) {
      const next = current.filter(
        (item) => item.toLowerCase() !== normalized
      );
      setInterests(formatInterests(next));
      setInterestError("");
      return;
    }
    if (current.length >= 10) {
      setInterestError(t("settings_profile.error.interests_limit"));
      return;
    }
    const next = [...current, value];
    setInterests(formatInterests(next));
    setInterestError("");
  };

  const applySuggestedInterests = () => {
    const suggestions = suggestInterestsFromProfile({
      faculty: faculty.trim() || null,
      course: course ? Number(course) : null,
    });
    if (suggestions.length === 0) {
      setInterestError(t("settings_profile.error.interests_suggestions"));
      return;
    }
    const merged = Array.from(
      new Set([...interestsList, ...suggestions])
    ).slice(0, 10);
    setInterests(formatInterests(merged));
    setInterestError("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setToast("");
    setSaving(true);

    try {
      const requestPayload: Record<string, unknown> = {
        username: initialUsername,
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        faculty: faculty.trim(),
        course: course === "" ? null : Number(course),
        interests: interests,
      };
      if (avatarDirty) {
        requestPayload.image = avatarPreview ?? null;
      }

      const response = await fetch("/api/me/profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
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
          setError(t("settings_profile.error.name_taken"));
          return;
        }
        if (payload?.error === "BAD_REQUEST") {
          if (payload?.message === "USERNAME_LOCKED") {
            setError(t("settings_profile.error.username_locked"));
          } else if (payload?.message === "INVALID_IMAGE") {
            setError(t("settings_profile.error.avatar_invalid"));
          } else if (payload?.message === "INVALID_INTERESTS") {
            setError(t("settings_profile.error.interests_invalid"));
          } else if (payload?.message === "INVALID_COURSE") {
            setError(t("settings_profile.error.course_invalid"));
          } else if (payload?.message === "INVALID_FACULTY") {
            setError(t("settings_profile.error.faculty_invalid"));
          } else {
            setError(t("settings_profile.error.profile_invalid"));
          }
          return;
        }
        setError(t("settings_profile.error.save_failed"));
        return;
      }

      if (!payload?.data?.username) {
        setError(t("settings_profile.error.save_failed"));
        return;
      }

      setToast(t("settings_profile.toast.saved"));
      setAvatarDirty(false);
    } catch {
      setError(t("settings_profile.error.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16">
        <header>
          <h1 className="text-3xl font-semibold">
            {t("settings_profile.title")}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("settings_profile.subtitle")}
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
            <div>
              <p className="text-xs font-semibold text-slate-600">
                {t("settings_profile.avatar.title")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={t("settings_profile.avatar.preview_alt")}
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
                    {(displayName || initialUsername || t("common.user"))
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarLoading}
                    className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 pressable"
                  >
                    {avatarLoading
                      ? t("settings_profile.avatar.processing")
                      : t("settings_profile.avatar.upload")}
                  </button>
                  {avatarPreview ? (
                    <button
                      type="button"
                      onClick={handleAvatarRemove}
                      className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold pressable"
                    >
                      {t("settings_profile.avatar.delete")}
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                {t("settings_profile.avatar.help")}
              </p>
              {avatarError ? (
                <p className="mt-2 text-xs text-rose-500">{avatarError}</p>
              ) : null}
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              {t("settings_profile.username.label")}
              <input
                type="text"
                value={initialUsername}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                {t("settings_profile.username.locked")}
              </span>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              {t("onboarding.fields.display_name")}
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("onboarding.placeholders.display_name")}
                maxLength={40}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              {t("onboarding.fields.bio")}
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={160}
                className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("onboarding.placeholders.bio")}
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                {bio.length} / 160
              </span>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              {t("onboarding.fields.faculty")}
              <input
                type="text"
                value={faculty}
                onChange={(event) => setFaculty(event.target.value)}
                list="faculty-options"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("onboarding.placeholders.faculty")}
                maxLength={80}
              />
            </label>
            <datalist id="faculty-options">
              {FACULTY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value} label={item.label} />
              ))}
            </datalist>
            <label className="block text-xs font-semibold text-slate-600">
              {t("onboarding.fields.course")}
              <select
                value={course}
                onChange={(event) => setCourse(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t("onboarding.course.none")}</option>
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={value}>
                    {t("onboarding.course.value", { value })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              {t("onboarding.fields.interests")}
              <input
                type="text"
                value={interests}
                onChange={(event) => {
                  setInterests(event.target.value);
                  setInterestError("");
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("onboarding.placeholders.interests")}
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                {t("onboarding.interests_hint")}
              </span>
            </label>
            <button
              type="button"
              onClick={applySuggestedInterests}
              className="bubble-btn w-fit rounded-full px-4 py-1 text-xs font-semibold pressable"
            >
              {t("settings_profile.interests.suggest")}
            </button>
            <div className="flex flex-wrap gap-2">
              {INTEREST_SUGGESTIONS.map((item) => {
                const active = interestsList.some(
                  (value) => value.toLowerCase() === item.toLowerCase()
                );
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleInterest(item)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-[#6495ED]/15 text-[#6495ED]"
                        : "bg-slate-100 text-slate-600 hover:bg-[#6495ED]/10 hover:text-[#6495ED]"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
            {interestError ? (
              <p className="text-xs text-rose-500">{interestError}</p>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="bubble-btn-primary w-full rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 pressable"
            >
              {saving
                ? t("settings_profile.actions.saving")
                : t("settings_profile.actions.save")}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
