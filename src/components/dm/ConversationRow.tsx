"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useI18n } from "@/lib/i18n/useI18n";

type Participant = {
  username: string | null;
  displayName: string | null;
  image: string | null;
};

type ConversationRowProps = {
  conversationId: string;
  participant: Participant | null;
  lastMessage: {
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
};

export default function ConversationRow({
  conversationId,
  participant,
  lastMessage,
  unreadCount,
}: ConversationRowProps) {
  const router = useRouter();
  const { t } = useI18n();
  const formatRelativeTime = (value: string | null) => {
    if (!value) {
      return "";
    }
    const createdAt = new Date(value);
    if (Number.isNaN(createdAt.getTime())) {
      return "";
    }
    const diffMs = Date.now() - createdAt.getTime();
    if (diffMs < 0) {
      return t("dm.conversation.now");
    }
    const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    if (diffMinutes < 60) {
      return t("dm.conversation.minutes", { count: diffMinutes });
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return t("dm.conversation.hours", { count: diffHours });
    }
    if (diffHours < 48) {
      return t("dm.conversation.yesterday");
    }
    const diffDays = Math.floor(diffHours / 24);
    return t("dm.conversation.days", { count: diffDays });
  };
  const displayName =
    participant?.displayName || participant?.username || t("common.user");
  const handle = participant?.username ? `@${participant.username}` : "@user";
  const avatarInitial = (displayName || t("common.user"))
    .slice(0, 1)
    .toUpperCase();
  const preview = lastMessage?.content ?? t("dm.conversation.preview_default");
  const timeLabel = formatRelativeTime(lastMessage?.createdAt ?? null);
  const href = `/messages/${conversationId}`;

  return (
    <Link
      href={href}
      onMouseEnter={() => void router.prefetch(href)}
      onTouchStart={() => void router.prefetch(href)}
      className="bubble-surface flex items-center justify-between rounded-2xl px-4 py-3 transition hover:border-[color:var(--border-strong)]"
    >
      <div className="flex items-center gap-3">
        {participant?.image ? (
          <img
            src={participant.image}
            alt={displayName}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--border)] text-sm font-semibold text-[color:var(--text-muted)]">
            {avatarInitial}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--foreground)]">
            {displayName}
          </p>
          <p className="text-xs text-[color:var(--text-muted)]">{handle}</p>
          <p className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
            {preview}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {timeLabel ? (
          <span className="text-[11px] text-[color:var(--text-muted)]">
            {timeLabel}
          </span>
        ) : null}
        {unreadCount > 0 ? (
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
