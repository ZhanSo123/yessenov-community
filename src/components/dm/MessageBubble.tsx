"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

const postLinkRegex = /(?:https?:\\/\\/[^\\s]+)?\\/p\\/(\\d+)/i;

const formatRelativeTime = (value: string) => {
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

export default function MessageBubble({
  content,
  createdAt,
  sender,
  isMine,
  showAvatar = false,
}: MessageBubbleProps) {
  const displayName = sender.displayName || sender.username || "User";
  const timeLabel = formatRelativeTime(createdAt);
  const avatarInitial = (displayName || "U").slice(0, 1).toUpperCase();
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
      .replace(/Пост:\s*/i, "")
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
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {avatarInitial}
          </div>
        )
      ) : !isMine ? (
        <div className="h-8 w-8" />
      ) : null}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isMine
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-900"
        }`}
      >
        {preview && postId ? (
          <Link
            href={`/p/${postId}`}
            className={`block rounded-xl border px-3 py-2 text-sm transition hover:border-[#6495ED]/40 ${
              isMine
                ? "border-white/20 bg-white/10 text-white"
                : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            <p className="text-xs font-semibold">
              {preview.author.displayName ||
                preview.author.username ||
                "User"}
            </p>
            {preview.author.username ? (
              <p className="text-[11px] text-slate-400">
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
            isMine ? "text-slate-200" : "text-slate-400"
          }`}
        >
          {timeLabel}
        </p>
      </div>
    </div>
  );
}
