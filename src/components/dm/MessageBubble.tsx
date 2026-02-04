"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/lib/i18n/useI18n";

type MessageSender = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
};

type MessageBubbleProps = {
  content: string;
  createdAt: string;
  sender: MessageSender;
  isMine: boolean;
  showAvatar?: boolean;
};

type PostPreview = {
  id: number;
  content: string;
  createdAt: string;
  author: {
    username: string | null;
    displayName: string | null;
    image: string | null;
  };
};

const postLinkRegex = /(?:https?:\/\/[^\s]+)?\/p\/(\d+)/i;

export default function MessageBubble({
  content,
  createdAt,
  sender,
  isMine,
  showAvatar = false,
}: MessageBubbleProps) {
  const { t } = useI18n();
  const formatRelativeTime = (value: string) => {
    const createdAtDate = new Date(value);
    if (Number.isNaN(createdAtDate.getTime())) {
      return t("dm.bubble.just_now");
    }
    const diffMs = Date.now() - createdAtDate.getTime();
    if (diffMs < 0) {
      return t("dm.bubble.just_now");
    }
    const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    if (diffMinutes < 60) {
      return t("dm.bubble.minutes_ago", { count: diffMinutes });
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return t("dm.bubble.hours_ago", { count: diffHours });
    }
    if (diffHours < 48) {
      return t("dm.bubble.yesterday");
    }
    const diffDays = Math.floor(diffHours / 24);
    return t("dm.bubble.days_ago", { count: diffDays });
  };
  const displayName = sender.displayName || sender.username || t("common.user");
  const timeLabel = formatRelativeTime(createdAt);
  const avatarInitial = (displayName || t("common.user"))
    .slice(0, 1)
    .toUpperCase();
  const [preview, setPreview] = useState<PostPreview | null>(null);

  const postId = useMemo(() => {
    const match = content.match(postLinkRegex);
    return match ? Number(match[1]) : null;
  }, [content]);

  const cleanedContent = useMemo(() => {
    if (!postId) {
      return content.trim();
    }
    return content
      .replace(postLinkRegex, "")
      .replace(/(Пост|Post):\s*/i, "")
      .trim();
  }, [content, postId]);

  useEffect(() => {
    let active = true;
    if (!postId) {
      setPreview(null);
      return () => {
        active = false;
      };
    }

    const loadPreview = async () => {
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          data?: { post?: PostPreview };
        };
        if (active) {
          setPreview(payload.data?.post ?? null);
        }
      } catch {
        if (active) {
          setPreview(null);
        }
      }
    };

    loadPreview();
    return () => {
      active = false;
    };
  }, [postId]);

  return (
    <div className={`flex items-end gap-2 ${isMine ? "justify-end" : ""}`}>
      {!isMine && showAvatar ? (
        sender.image ? (
          <img
            src={sender.image}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--border)] text-xs font-semibold text-[color:var(--text-muted)]">
            {avatarInitial}
          </div>
        )
      ) : !isMine ? (
        <div className="h-8 w-8" />
      ) : null}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isMine
            ? "bg-[color:var(--brand-strong)] text-white"
            : "border border-[color:var(--border)] bg-[color:var(--surface-strong)] text-[color:var(--foreground)]"
        }`}
      >
        {preview && postId ? (
          <Link
            href={`/p/${postId}`}
            className={`block rounded-xl border px-3 py-2 text-sm transition hover:border-[#6495ED]/40 ${
              isMine
                ? "border-white/20 bg-white/10 text-white"
                : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)]"
            }`}
          >
            <p className="text-xs font-semibold">
              {preview.author.displayName ||
                preview.author.username ||
                t("common.user")}
            </p>
            {preview.author.username ? (
              <p className="text-[11px] text-[color:var(--text-muted)]">
                @{preview.author.username}
              </p>
            ) : null}
            <p className="mt-2 text-sm">
              {preview.content.length > 140
                ? `${preview.content.slice(0, 140)}…`
                : preview.content}
            </p>
          </Link>
        ) : null}
        {cleanedContent ? (
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">
            {cleanedContent}
          </p>
        ) : null}
        <p
          className={`mt-2 text-[11px] ${
            isMine ? "text-white/80" : "text-[color:var(--text-muted)]"
          }`}
        >
          {timeLabel}
        </p>
      </div>
    </div>
  );
}
