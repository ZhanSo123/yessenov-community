"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { FACULTY_OPTIONS } from "@/lib/faculty-interests";
import {
  INTEREST_SUGGESTIONS,
  suggestInterestsFromProfile,
} from "@/lib/interests";
import { useI18n } from "@/lib/i18n/useI18n";

type OnboardingResponse = {
  data?: { username: string; displayName: string | null; bio: string | null };
  error?: string;
  message?: string;
};

const normalizeUsername = (raw: string) => raw.trim().replace(/^@/, "");

const isUsernameValid = (raw: string) => {
  const username = normalizeUsername(raw);
  if (username.length < 3 || username.length > 20) {
    return false;
  }
  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
    return false;
  }
  if (/^[._]/.test(username) || /[._]$/.test(username)) {
    return false;
  }
  if (username.includes("..") || username.includes("__")) {
    return false;
  }
  return true;
};

const buildSuggestion = (email?: string | null, name?: string | null) => {
  const base = (name || email?.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return base || "user";
};

const parseInterests = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const formatInterests = (items: string[]) => items.join(", ");

export default function OnboardingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const { t } = useI18n();
  const steps = [
    t("onboarding.steps.profile"),
    t("onboarding.steps.faculty"),
    t("onboarding.steps.interests"),
    t("onboarding.steps.done"),
  ];

  const suggested = useMemo(() => {
    const fromQuery = searchParams.get("u");
    if (fromQuery) {
      return fromQuery.toLowerCase();
    }
    return buildSuggestion(user?.email ?? null, user?.name ?? null);
  }, [searchParams, user?.email, user?.name]);

  const [username, setUsername] = useState(suggested);
  const initialDisplayName = useMemo(
    () => (typeof user?.name === "string" ? user.name : ""),
    [user?.name]
  );
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState("");
  const [faculty, setFaculty] = useState("");
  const [course, setCourse] = useState("");
  const [interests, setInterests] = useState("");
  const [interestError, setInterestError] = useState("");
  const [autoSuggested, setAutoSuggested] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canSubmit = isUsernameValid(username);
  const canProceedProfile = canSubmit;
  const courseNumber = course ? Number(course) : null;
  const courseValid =
    course === "" ||
    (courseNumber !== null &&
      Number.isInteger(courseNumber) &&
      courseNumber >= 1 &&
      courseNumber <= 6);
  const canProceedFaculty = courseValid;
  const canProceedInterests = true;
  const interestsList = useMemo(() => parseInterests(interests), [interests]);

  useEffect(() => {
    if (step !== 2 || autoSuggested || interestsList.length > 0) {
      return;
    }
    const suggestions = suggestInterestsFromProfile({
      faculty: faculty.trim() || null,
      course: course ? Number(course) : null,
    });
    if (suggestions.length > 0) {
      setInterests(formatInterests(suggestions));
      setAutoSuggested(true);
    }
  }, [step, autoSuggested, interestsList.length, faculty, course]);

  useEffect(() => {
    if (!username && suggested) {
      setUsername(suggested);
    }
  }, [suggested, username]);

  useEffect(() => {
    if (!displayName && initialDisplayName) {
      setDisplayName(initialDisplayName);
    }
  }, [displayName, initialDisplayName]);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/me/profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalizeUsername(username),
          displayName: displayName.trim() || undefined,
          bio: bio.trim() || undefined,
          faculty: faculty.trim() || undefined,
          course: course ? Number(course) : undefined,
          interests: interests.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | OnboardingResponse
        | null;

      if (!response.ok) {
        if (payload?.error === "BAD_REQUEST") {
          if (payload?.message === "INVALID_USERNAME") {
            setError(t("onboarding.error.invalid_username"));
          } else {
            setError(t("onboarding.error.profile_check"));
          }
        } else if (payload?.error === "CONFLICT") {
          setError(t("onboarding.error.name_taken"));
        } else if (payload?.error === "UNAUTHORIZED") {
          router.replace("/welcome");
        } else {
          setError(t("onboarding.error.save_failed"));
        }
        return;
      }

      if (!payload?.data?.username) {
        setError(t("onboarding.error.save_failed"));
        return;
      }

      router.replace("/");
    } catch {
      setError(t("onboarding.error.save_failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const handleBack = () => {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
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
      setInterestError(t("onboarding.interests.limit_error"));
      return;
    }
    const next = [...current, value];
    setInterests(formatInterests(next));
    setInterestError("");
  };

  return (
    <div className="min-h-screen min-h-[100svh] bg-[color:var(--background)] text-[color:var(--foreground)]">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {t("onboarding.title")}
          </h1>
          <p className="text-sm text-slate-600">
            {t("onboarding.subtitle")}
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {steps.map((label, index) => (
              <span
                key={label}
                className={`rounded-full border px-3 py-1 ${
                  index === step
                    ? "border-[#6495ED]/40 bg-[#6495ED]/10 text-[#6495ED]"
                    : "border-slate-200"
                }`}
              >
                {index + 1}. {label}
              </span>
            ))}
          </div>
        </header>

        <div className="bubble-surface rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          ) : null}

          {step === 0 ? (
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-semibold text-slate-600">
                {t("onboarding.fields.username")}
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="username"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                {t("onboarding.fields.display_name")}
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder={t("onboarding.placeholders.display_name")}
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
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-semibold text-slate-600">
                {t("onboarding.fields.faculty")}
                <input
                  type="text"
                  value={faculty}
                  onChange={(event) => setFaculty(event.target.value)}
                  list="faculty-options"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder={t("onboarding.placeholders.faculty")}
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
              <p className="text-xs text-slate-500">
                {t("onboarding.faculty_hint")}
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-4 space-y-4">
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
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-xs uppercase text-slate-400">
                  {t("onboarding.review.title")}
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  @{normalizeUsername(username)}
                </p>
                {displayName ? <p>{displayName}</p> : null}
                {bio ? <p className="mt-2">{bio}</p> : null}
                {faculty || course ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {faculty
                      ? t("onboarding.review.faculty", { faculty })
                      : ""}
                    {faculty && course ? " · " : ""}
                    {course ? t("onboarding.review.course", { course }) : ""}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {t("onboarding.review.faculty_course_later")}
                  </p>
                )}
                {interests ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {t("onboarding.review.interests", { interests })}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {t("onboarding.review.interests_later")}
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {t("onboarding.review.cta")}
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 0 || loading}
              className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 pressable"
            >
              {t("onboarding.buttons.back")}
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  loading ||
                  (step === 0
                    ? !canProceedProfile
                    : step === 1
                      ? !canProceedFaculty
                      : !canProceedInterests)
                }
                className="bubble-btn-primary rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-60 pressable"
              >
                {t("onboarding.buttons.next")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !canSubmit}
                className="bubble-btn-primary rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-60 pressable"
              >
                {loading ? t("onboarding.buttons.saving") : t("onboarding.buttons.save")}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
