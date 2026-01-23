"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

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
    return "сейчас";
  }
  const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (diffMinutes < 60) {
    return `${diffMinutes} мин`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ч`;
  }
  if (diffHours < 48) {
    return "вчера";
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} д`;
};

export default function ConversationRow({
  conversationId,
  participant,
  lastMessage,
  unreadCount,
}: ConversationRowProps) {
  const router = useRouter();
  const displayName = participant?.displayName || participant?.username || "User";
  const handle = participant?.username ? `@${participant.username}` : "@user";
  const avatarInitial = (displayName || "U").slice(0, 1).toUpperCase();
  const preview = lastMessage?.content ?? "Напишите первым";
  const timeLabel = formatRelativeTime(lastMessage?.createdAt ?? null);
  const href = `/messages/${conversationId}`;

  return (
    <Link
      href={href}
      onMouseEnter={() => router.prefetch(href)}
      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition hover:border-slate-300"
    >
      <div className="flex items-center gap-3">
        {participant?.image ? (
          <img
            src={participant.image}
            alt={displayName}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
            {avatarInitial}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{displayName}</p>
          <p className="text-xs text-slate-500">{handle}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{preview}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {timeLabel ? (
          <span className="text-[11px] text-slate-400">{timeLabel}</span>
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
