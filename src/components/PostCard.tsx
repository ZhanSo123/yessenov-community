"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import AppealButton from "@/components/AppealButton";
import { type PostWithMeta } from "@/lib/post-types";

type PostCardProps = {
  post: PostWithMeta;
  onLike?: (postId: number) => void;
  onReplyToggle?: (postId: number) => void;
  showActions?: boolean;
  indent?: boolean;
  highlight?: boolean;
  showDiscussionHint?: boolean;
  showReplyCount?: boolean;
  activityDot?: boolean;
};

export default function PostCard({
  post,
  onLike,
  onReplyToggle,
  showActions = true,
  indent = false,
  highlight = false,
  showDiscussionHint = false,
  showReplyCount = true,
  activityDot = false,
}: PostCardProps) {
  const { data: session, status } = useSession();
  const isTemp = typeof post.id === "string" || post.sending;
  const createdLabel = (() => {
    if (isTemp) {
      return "Отправляем...";
    }
    const createdAt = new Date(post.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return "только что";
    }
    const diffMs = Date.now() - createdAt.getTime();
    if (diffMs < 0 || diffMs < 5 * 60 * 1000) {
      return "только что";
    }
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes < 60) {
      return `${diffMinutes} мин назад`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} ч назад`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} д назад`;
  })();
  const usernameLabel = post.author.username ?? post.author.name ?? "user";
  const handleLabel = `@${(post.author.username ?? usernameLabel)
    .toLowerCase()
    .replace(/\s+/g, "_")}`;
  const replyCount = post._count.replies;
  const hasDiscussion = replyCount > 0;
  const isHidden = post.canViewDeleted === false;
  const isDeleted = Boolean(post.deletedAt);
  const canReport =
    status === "authenticated" && !isTemp && typeof post.id === "number";
  const canAppealHidden =
    !isTemp &&
    typeof post.id === "number" &&
    session?.user?.id === post.author.id &&
    (isHidden || isDeleted);
  const [reportStatus, setReportStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  const handleReport = async () => {
    if (!canReport || typeof post.id !== "number") {
      return;
    }

    const reason = window
      .prompt("Причина жалобы (1-200 символов)")?.trim();

    if (!reason) {
      return;
    }

    setReportStatus("sending");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, reason }),
      });

      if (!response.ok) {
        setReportStatus("error");
        return;
      }

      setReportStatus("sent");
    } catch {
      setReportStatus("error");
    }
  };

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition ${
        indent ? "ml-6 border-l-4 border-l-slate-200" : ""
      } ${highlight ? "ring-1 ring-emerald-200 bg-emerald-50/40" : ""}`}
    >
      <div className="flex items-start gap-3">
        {post.author.image ? (
          <img
            src={post.author.image}
            alt={usernameLabel}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
            {(usernameLabel || "U").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          {showDiscussionHint && hasDiscussion ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
              Обсуждают сейчас
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {post.author.username ? (
              <Link
                href={`/u/${post.author.username}`}
                className="font-semibold text-slate-900"
              >
                {handleLabel}
              </Link>
            ) : (
              <span className="font-semibold text-slate-900">
                {handleLabel}
              </span>
            )}
            <span className="text-xs text-slate-400">· {createdLabel}</span>
            {activityDot ? (
              <span className="text-xs text-emerald-500">•</span>
            ) : null}
          </div>
          {isHidden ? (
            <div className="mt-2 space-y-2 text-sm text-slate-500">
              <p>Пост скрыт модерацией.</p>
              {canAppealHidden ? (
                <AppealButton targetType="POST" targetId={String(post.id)} />
              ) : null}
            </div>
          ) : isTemp ? (
            <p className="mt-2 text-sm text-slate-700">
              {post.content || "Репост"}
            </p>
          ) : (
            <>
              {isDeleted ? (
                <div className="mt-2 space-y-2 text-xs text-amber-600">
                  <p>Пост скрыт модерацией (виден автору/модераторам).</p>
                  {canAppealHidden ? (
                    <AppealButton targetType="POST" targetId={String(post.id)} />
                  ) : null}
                </div>
              ) : null}
              <Link href={`/p/${post.id}`}>
                <p className="mt-2 text-sm text-slate-700">
                  {post.content || "Репост"}
                </p>
              </Link>
            </>
          )}
          {showActions && !isHidden ? (
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <button
                type="button"
                onClick={() => {
                  if (!isTemp && onLike && typeof post.id === "number") {
                    onLike(post.id);
                  }
                }}
                disabled={isTemp}
                className={`transition hover:text-slate-900 ${
                  post.viewerHasLiked ? "text-slate-900" : ""
                }`}
              >
                {post.viewerHasLiked ? "Liked" : "Like"} · {post._count.likes}
              </button>
              {onReplyToggle ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!isTemp && typeof post.id === "number") {
                      onReplyToggle(post.id);
                    }
                  }}
                  disabled={isTemp}
                  className="transition hover:text-slate-900"
                >
                  {showReplyCount ? `Reply · ${post._count.replies}` : "Reply"}
                </button>
              ) : null}
              <span className="text-xs text-slate-400">
                Просмотры · {post.viewCount ?? 0}
              </span>
              {canReport ? (
                <button
                  type="button"
                  onClick={handleReport}
                  className="transition hover:text-slate-900"
                >
                  {reportStatus === "sent"
                    ? "Отправлено"
                    : reportStatus === "sending"
                      ? "Отправляем..."
                      : reportStatus === "error"
                        ? "Ошибка"
                        : "Пожаловаться"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
