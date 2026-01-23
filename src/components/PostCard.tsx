"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import AppealButton from "@/components/AppealButton";
import { type PostWithMeta } from "@/lib/post-types";

type PostCardProps = {
  post: PostWithMeta;
  onLike?: (postId: number) => void;
  onReplyToggle?: (postId: number) => void;
  onDeleted?: (postId: number) => void;
  onDeleteError?: (message: string) => void;
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
  onDeleted,
  onDeleteError,
  showActions = true,
  indent = false,
  highlight = false,
  showDiscussionHint = false,
  showReplyCount = true,
  activityDot = false,
}: PostCardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isTemp = typeof post.id === "string" || post.sending;
  if (process.env.NODE_ENV === "development" && !post.author.username) {
    console.warn("PostCard: missing author.username", { postId: post.id });
  }

  const formatRelativeTime = (value: string) => {
    if (isTemp) {
      return "Отправляем...";
    }
    const createdAt = new Date(value);
    if (Number.isNaN(createdAt.getTime())) {
      return "только что";
    }
    const diffMs = Date.now() - createdAt.getTime();
    if (diffMs < 0) {
      return "только что";
    }
    const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    if (diffMinutes < 60) {
      return `${diffMinutes} мин назад`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} ч назад`;
    }
    if (diffHours < 48) {
      return "вчера";
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} д назад`;
  };

  const createdLabel = formatRelativeTime(post.createdAt);
  const displayName = post.author.displayName?.trim() || null;
  const handleLabel = post.author.username ? `@${post.author.username}` : null;
  const profileHref = post.author.username
    ? `/u/${post.author.username}`
    : null;
  const handleProfilePrefetch = () => {
    if (profileHref) {
      router.prefetch(profileHref);
    }
  };
  const avatarInitial = (displayName ?? post.author.username ?? "U")
    .slice(0, 1)
    .toUpperCase();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<
    "idle" | "sending" | "error"
  >("idle");
  const [deletedLocal, setDeletedLocal] = useState(false);
  const isDeletedEffective = Boolean(post.deletedAt) || deletedLocal;
  const canDelete =
    status === "authenticated" &&
    !isTemp &&
    !isDeletedEffective &&
    typeof post.id === "number" &&
    session?.user?.id === post.author.id;

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

  const handleDelete = async () => {
    if (!canDelete || typeof post.id !== "number") {
      return;
    }

    const confirmed = window.confirm("Удалить пост?");
    if (!confirmed) {
      return;
    }

    setDeleteStatus("sending");
    setMenuOpen(false);
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        setDeleteStatus("error");
        onDeleteError?.("Не удалось удалить");
        return;
      }

      setDeletedLocal(true);
      onDeleted?.(post.id);
      setDeleteStatus("idle");
    } catch {
      setDeleteStatus("error");
      onDeleteError?.("Не удалось удалить");
    }
  };

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition ${
        indent ? "ml-6 border-l-4 border-l-slate-200" : ""
      } ${highlight ? "ring-1 ring-emerald-200 bg-emerald-50/40" : ""}`}
    >
      <div className="flex items-start gap-3">
        {profileHref ? (
          <Link
            href={profileHref}
            onMouseEnter={handleProfilePrefetch}
            className="shrink-0"
          >
            {post.author.image ? (
              <img
                src={post.author.image}
                alt={displayName ?? handleLabel ?? "User"}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                {avatarInitial}
              </div>
            )}
          </Link>
        ) : post.author.image ? (
          <img
            src={post.author.image}
            alt={displayName ?? handleLabel ?? "User"}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
            {avatarInitial}
          </div>
        )}
        <div className="flex-1">
          {showDiscussionHint && hasDiscussion ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
              Обсуждают сейчас
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {displayName ? (
              <>
                {profileHref ? (
                  <Link
                    href={profileHref}
                    className="font-semibold text-slate-900"
                  >
                    {displayName}
                  </Link>
                ) : (
                  <span className="font-semibold text-slate-900">
                    {displayName}
                  </span>
                )}
                {handleLabel ? (
                  <span className="text-xs text-slate-500">{handleLabel}</span>
                ) : null}
              </>
            ) : handleLabel ? (
              profileHref ? (
                <Link href={profileHref} className="font-semibold text-slate-900">
                  {handleLabel}
                </Link>
              ) : (
                <span className="font-semibold text-slate-900">{handleLabel}</span>
              )
            ) : (
              <span className="font-semibold text-slate-900">User</span>
            )}
            <span className="text-xs text-slate-400">· {createdLabel}</span>
            {activityDot ? (
              <span className="text-xs text-emerald-500">•</span>
            ) : null}
            {canDelete ? (
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="rounded-full px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
                  aria-label="Меню"
                >
                  ⋯
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 z-10 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg">
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="w-full rounded-lg px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50"
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
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
              {isDeletedEffective ? (
                <div className="mt-2 space-y-2 text-xs text-amber-600">
                  <p>Пост удалён. Он виден только тебе.</p>
                  {canAppealHidden ? (
                    <AppealButton targetType="POST" targetId={String(post.id)} />
                  ) : null}
                </div>
              ) : (
                <Link href={`/p/${post.id}`}>
                  <p className="mt-2 text-sm text-slate-700">
                    {post.content || "Репост"}
                  </p>
                </Link>
              )}
            </>
          )}
          {showActions && !isHidden && !isDeletedEffective ? (
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
          {deleteStatus === "error" ? (
            <p className="mt-2 text-xs text-rose-500">Не удалось удалить.</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
