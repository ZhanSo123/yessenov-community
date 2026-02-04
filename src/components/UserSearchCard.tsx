"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { type ViewerState } from "@/lib/post-types";
import { useI18n } from "@/lib/i18n/useI18n";

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
  const { t } = useI18n();
  const displayName = item.displayName?.trim() || null;
  const username = item.username;
  const handle = username ? `@${username}` : "@user";
  const title = displayName ?? handle;
  const profileHref = username ? `/u/${username}` : null;
  const avatarInitial = (displayName ?? username ?? t("common.user"))
    .slice(0, 1)
    .toUpperCase();

  const buttonLabel = isUnauthed
    ? t("user_search.action.sign_in")
    : item.viewer.isFriend
    ? t("user_search.action.friends")
    : item.viewer.isFollowing
    ? t("user_search.action.following")
    : t("user_search.action.follow");

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
        className="bubble-btn rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 pressable"
      >
          {isPending ? t("user_search.action.pending") : buttonLabel}
      </button>
      ) : null}
    </div>
  );
}
