"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { type ViewerState } from "@/lib/post-types";

export type UserSearchItem = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  counts: {
    followers: number;
  };
  viewer: ViewerState;
};

type UserSearchCardProps = {
  item: UserSearchItem;
  isUnauthed: boolean;
  isPending?: boolean;
  onToggle?: (item: UserSearchItem) => void;
};

export default function UserSearchCard({
  item,
  isUnauthed,
  isPending = false,
  onToggle,
}: UserSearchCardProps) {
  const router = useRouter();
  const displayName = item.displayName?.trim() || null;
  const username = item.username;
  const handle = username ? `@${username}` : "@user";
  const title = displayName ?? handle;
  const profileHref = username ? `/u/${username}` : null;
  const avatarInitial = (displayName ?? username ?? "U")
    .slice(0, 1)
    .toUpperCase();

  const buttonLabel = isUnauthed
    ? "Войти"
    : item.viewer.isFriend
    ? "Друзья"
    : item.viewer.isFollowing
    ? "Вы подписаны"
    : "Подписаться";

  const canToggle = Boolean(username) && !item.viewer.isMe;
  const disabled = isUnauthed || isPending || !canToggle;

  const content = (
    <>
      {item.image ? (
        <img
          src={item.image}
          alt={title}
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
          {avatarInitial}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {displayName && username ? (
          <p className="text-xs text-slate-500">{handle}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
      {profileHref ? (
        <Link
          href={profileHref}
          onMouseEnter={() => router.prefetch(profileHref)}
          className="flex items-center gap-3"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-center gap-3">{content}</div>
      )}

      {canToggle ? (
        <button
          type="button"
          onClick={() => onToggle?.(item)}
          disabled={disabled}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-60"
        >
          {isPending ? "Обновляем..." : buttonLabel}
        </button>
      ) : null}
    </div>
  );
}
