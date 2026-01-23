"use client";

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
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
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
