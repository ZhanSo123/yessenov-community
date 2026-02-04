"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { useI18n } from "@/lib/i18n/useI18n";

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const communitySlug = searchParams.get("c")?.trim() || "";
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const { t } = useI18n();
  const loading = status === "loading";
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const loadingError = error;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!user) {
      setError(t("create.error.sign_in"));
      return;
    }

    if (!content.trim()) {
      setError(t("create.error.enter_text"));
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          communitySlug: communitySlug || undefined,
        }),
      });

      if (response.status === 401) {
        setError(t("create.error.sign_in"));
        return;
      }

      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string; bannedUntil?: string; banReason?: string }
          | null;
        if (payload?.error === "BANNED") {
          const until = payload.bannedUntil
            ? new Date(payload.bannedUntil).toLocaleDateString()
            : t("common.unknown");
          const reason = payload.banReason
            ? ` ${t("common.reason", { reason: payload.banReason })}`
            : "";
          setError(t("create.error.banned", { until, reason }));
        } else {
          setError(
            payload?.message === "PRIVATE_COMMUNITY"
              ? t("create.error.private_community")
              : t("create.error.forbidden")
          );
        }
        return;
      }

      const payload = (await response.json()) as { data?: { id: number } };
      if (!response.ok || !payload.data?.id) {
        throw new Error(t("create.error.create_failed"));
      }

      router.push(`/p/${payload.data.id}`);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : t("create.error.create_failed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-16 pt-10">
        <header className="rounded-3xl p-5 bubble-surface-strong">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {t("common.app_name")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
            {t("create.title")}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("create.subtitle")}
          </p>
          {communitySlug ? (
            <p className="mt-2 text-xs text-slate-500">
              {t("create.community_label", { slug: communitySlug })}
            </p>
          ) : null}
        </header>

        {loadingError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {loadingError}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">{t("create.loading")}</p>
        ) : null}

        {!loading && !user ? (
          <div className="rounded-3xl p-5 text-sm text-slate-600 bubble-surface">
            <p>{t("create.prompt.sign_in")}</p>
            <Link
              href="/"
              className="bubble-btn-primary mt-3 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold pressable"
            >
              {t("create.prompt.action")}
            </Link>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl p-6 bubble-surface"
        >
          <label className="text-sm font-semibold text-slate-700">
            {t("create.form.label")}
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="mt-2 min-h-[160px] w-full rounded-2xl px-4 py-3 text-sm bubble-input"
              placeholder={t("create.form.placeholder")}
              disabled={!user || submitting}
            />
          </label>

          <button
            type="submit"
            disabled={!user || submitting}
            className="bubble-btn-primary mt-4 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 pressable"
          >
            {submitting ? t("create.form.submitting") : t("create.form.submit")}
          </button>
        </form>
      </main>
    </div>
  );
}
