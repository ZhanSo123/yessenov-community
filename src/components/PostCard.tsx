"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import AppealButton from "@/components/AppealButton";
import SharePostModal from "@/components/SharePostModal";
import { type PostWithMeta } from "@/lib/post-types";
import { useI18n } from "@/lib/i18n/useI18n";

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
  menuItems?: {
    key: string;
    label: string;
    onClick: () => void;
    tone?: "default" | "danger";
    disabled?: boolean;
  }[];
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
  menuItems,
}: PostCardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useI18n();
  const isTemp = typeof post.id === "string" || post.sending;
  if (process.env.NODE_ENV === "development" && !post.author.username) {
    console.warn("PostCard: missing author.username", { postId: post.id });
  }

  const formatRelativeTime = (value: string) => {
    if (isTemp) {
      return t("post.sending");
    }
    const createdAt = new Date(value);
    if (Number.isNaN(createdAt.getTime())) {
      return t("post.just_now");
    }
    const diffMs = Date.now() - createdAt.getTime();
    if (diffMs < 0) {
      return t("post.just_now");
    }
    const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    if (diffMinutes < 60) {
      return t("post.minutes_ago", { count: diffMinutes });
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return t("post.hours_ago", { count: diffHours });
    }
    if (diffHours < 48) {
      return t("post.yesterday");
    }
    const diffDays = Math.floor(diffHours / 24);
    return t("post.days_ago", { count: diffDays });
  };

  const createdLabel = formatRelativeTime(post.createdAt);
  const displayName = post.author.displayName?.trim() || null;
  const handleLabel = post.author.username ? `@${post.author.username}` : null;
  const profileHref = post.author.username
    ? `/u/${post.author.username}`
    : null;
  const handleProfilePrefetch = () => {
    if (profileHref) {
      void router.prefetch(profileHref);
    }
  };
  const avatarInitial = (displayName ?? post.author.username ?? t("common.user"))
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
  const [likePulse, setLikePulse] = useState(false);
  const prevLikedRef = useRef(post.viewerHasLiked);
  const [shareOpen, setShareOpen] = useState(false);
  const isDeletedEffective = Boolean(post.deletedAt) || deletedLocal;
  const canDelete =
    status === "authenticated" &&
    !isTemp &&
    !isDeletedEffective &&
    typeof post.id === "number" &&
    session?.user?.id === post.author.id;
  const reportTitle =
    reportStatus === "sent"
      ? t("post.report.sent")
      : reportStatus === "sending"
        ? t("post.report.sending")
        : reportStatus === "error"
          ? t("post.report.error")
          : t("post.report.cta");
  const canShare =
    !isTemp &&
    typeof post.id === "number" &&
    !isHidden &&
    !isDeletedEffective;
  const extraMenuItems = menuItems ?? [];
  const canShowMenu = canDelete || extraMenuItems.length > 0;

  useEffect(() => {
    const prev = prevLikedRef.current;
    if (!prev && post.viewerHasLiked) {
      setLikePulse(true);
      const timer = window.setTimeout(() => {
        setLikePulse(false);
      }, 220);
      prevLikedRef.current = post.viewerHasLiked;
      return () => window.clearTimeout(timer);
    }
    prevLikedRef.current = post.viewerHasLiked;
  }, [post.viewerHasLiked]);

  const handleReport = async () => {
    if (!canReport || typeof post.id !== "number") {
      return;
    }

    const reason = window
      .prompt(t("post.report.prompt"))?.trim();

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

    const confirmed = window.confirm(t("post.delete.confirm"));
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
        onDeleteError?.(t("post.delete.error"));
        return;
      }

      setDeletedLocal(true);
      onDeleted?.(post.id);
      setDeleteStatus("idle");
    } catch {
      setDeleteStatus("error");
      onDeleteError?.(t("post.delete.error"));
    }
  };

  return (
    <>
      <article
        className={`rounded-2xl p-4 bubble-surface transition sm:rounded-3xl sm:p-5 ${
          indent ? "ml-6 border-l-4 border-l-[color:var(--border)]" : ""
        } ${highlight ? "bubble-highlight" : ""}`}
      >
        <div className="flex items-start gap-3">
        {profileHref ? (
          <Link
            href={profileHref}
            onMouseEnter={handleProfilePrefetch}
            onTouchStart={handleProfilePrefetch}
            className="shrink-0"
          >
            {post.author.image ? (
              <img
                src={post.author.image}
                alt={displayName ?? handleLabel ?? t("common.user")}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--border)] text-sm font-semibold text-[color:var(--text-muted)]">
                {avatarInitial}
              </div>
            )}
          </Link>
        ) : post.author.image ? (
          <img
            src={post.author.image}
                alt={displayName ?? handleLabel ?? t("common.user")}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--border)] text-sm font-semibold text-[color:var(--text-muted)]">
            {avatarInitial}
          </div>
        )}
        <div className="flex-1">
          {showDiscussionHint && hasDiscussion ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
              {t("post.discussion_now")}
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
              <span className="font-semibold text-slate-900">
                {t("common.user")}
              </span>
            )}
            <span className="text-xs text-slate-400">· {createdLabel}</span>
            {activityDot ? (
              <span className="text-xs text-emerald-500">•</span>
            ) : null}
            {canReport || canDelete ? (
              <div className="relative ml-auto flex items-center gap-2">
                {canReport ? (
                  <button
                    type="button"
                    onClick={handleReport}
                    className={`bubble-icon-btn flex h-8 w-8 items-center justify-center rounded-full pressable ${
                      reportStatus === "sent"
                        ? "text-emerald-600"
                        : reportStatus === "error"
                          ? "text-rose-500"
                          : ""
                    }`}
                    aria-label={t("post.report.aria")}
                    title={reportTitle}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 4h9l-1.2 3H20l-4 6H6V4Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M6 13v7" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : null}
                {canShowMenu ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((open) => !open)}
                      className="bubble-icon-btn flex h-8 w-8 items-center justify-center rounded-full"
                      aria-label={t("post.menu.aria")}
                    >
                      ⋯
                    </button>
                    {menuOpen ? (
                      <div className="absolute right-0 z-10 mt-2 w-36 rounded-xl p-1 text-xs bubble-surface-strong">
                        {extraMenuItems.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              item.onClick();
                            }}
                            disabled={item.disabled}
                            className={`w-full rounded-lg px-3 py-2 text-left transition ${
                              item.tone === "danger"
                                ? "text-rose-600 hover:bg-rose-50"
                                : "text-slate-700 hover:bg-slate-50"
                            } disabled:opacity-60`}
                          >
                            {item.label}
                          </button>
                        ))}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={handleDelete}
                            className="w-full rounded-lg px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50"
                          >
                            {t("post.delete.label")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {isHidden ? (
            <div className="mt-2 space-y-2 text-sm text-slate-500">
              <p>{t("post.hidden_message")}</p>
              {canAppealHidden ? (
                <AppealButton targetType="POST" targetId={String(post.id)} />
              ) : null}
            </div>
          ) : isTemp ? (
            <p className="mt-2 text-sm text-slate-700">
              {post.content || t("post.repost_fallback")}
            </p>
          ) : (
            <>
              {isDeletedEffective ? (
                <div className="mt-2 space-y-2 text-xs text-amber-600">
                  <p>{t("post.deleted_message")}</p>
                  {canAppealHidden ? (
                    <AppealButton targetType="POST" targetId={String(post.id)} />
                  ) : null}
                </div>
              ) : (
                <Link href={`/p/${post.id}`}>
                  <p className="mt-2 text-sm text-slate-700">
                    {post.content || t("post.repost_fallback")}
                  </p>
                </Link>
              )}
            </>
          )}
          {showActions && !isHidden && !isDeletedEffective ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  if (navigator?.vibrate && post.viewerHasLiked === false) {
                    navigator.vibrate(8);
                  }
                  if (!isTemp && onLike && typeof post.id === "number") {
                    onLike(post.id);
                  }
                }}
                disabled={isTemp}
                className={`flex items-center gap-1 transition hover:text-slate-900 pressable ${
                  post.viewerHasLiked ? "text-[#6495ED]" : ""
                } ${likePulse ? "animate-pop" : ""}`}
                aria-label={t("post.actions.like")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill={post.viewerHasLiked ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path
                    d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.3A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{post._count.likes}</span>
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
                  className="flex items-center gap-1 transition hover:text-slate-900 pressable"
                  aria-label={t("post.actions.reply")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path
                      d="M10 7 5 12l5 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 12h7a7 7 0 0 1 7 7"
                      strokeLinecap="round"
                    />
                  </svg>
                  {showReplyCount ? <span>{post._count.replies}</span> : null}
                </button>
              ) : null}
              {canShare ? (
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="flex items-center gap-1 transition hover:text-slate-900 pressable"
                  aria-label={t("post.actions.share")}
                  title={t("post.actions.share")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 12h9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11 7l5 5-5 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M19 5v14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
          {deleteStatus === "error" ? (
            <p className="mt-2 text-xs text-rose-500">
              {t("post.error.delete_inline")}
            </p>
          ) : null}
        </div>
      </div>
      </article>
      {canShare ? (
        <SharePostModal
          post={post}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </>
  );
}
