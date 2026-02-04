"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useI18n } from "@/lib/i18n/useI18n";

const iconClass = "h-6 w-6";

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    className={iconClass}
    aria-hidden="true"
  >
    <path
      d="M4 10.5L12 4l8 6.5v7.5a1 1 0 0 1-1 1h-5v-5.5h-4V19H5a1 1 0 0 1-1-1v-7.5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {active ? (
      <path
        d="M9.2 20v-4.2h5.6V20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : null}
  </svg>
);

const CreateIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={iconClass}
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const ProfileIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    className={iconClass}
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="3.2" />
    <path
      d="M5 19c1.7-3 4.2-4.5 7-4.5s5.3 1.5 7 4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {active ? (
      <circle cx="12" cy="8" r="2.2" fill="currentColor" />
    ) : null}
  </svg>
);

const CommunitiesIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    className={iconClass}
    aria-hidden="true"
  >
    <circle cx="8" cy="9" r="2.6" />
    <circle cx="16.5" cy="9.5" r="2.2" />
    <path
      d="M3.5 18c1.6-2.6 3.9-3.9 6.5-3.9s4.9 1.3 6.5 3.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {active ? <circle cx="8" cy="9" r="1.6" fill="currentColor" /> : null}
  </svg>
);

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const username = session?.user?.username ?? null;
  const { t } = useI18n();

  const profileHref =
    status === "authenticated"
      ? username
        ? `/u/${username}`
        : "/profile"
      : "/welcome";

  const isHome = pathname === "/" || pathname === "/welcome";
  const isCommunities = pathname.startsWith("/communities");
  const isCreate = pathname.startsWith("/create");
  const isMessages = pathname.startsWith("/messages");
  const isSettings = pathname.startsWith("/settings");
  const isProfile =
    pathname.startsWith("/u/") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings/profile");

  const prefetch = (href: string) => () => {
    void router.prefetch(href);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 animate-fade-up">
      <div className="bubble-surface mx-auto flex w-full max-w-xl items-center justify-between rounded-full px-4 py-2 sm:px-5 sm:py-2.5">
        <Link
          href="/"
          aria-label={t("nav.feed")}
          onTouchStart={prefetch("/")}
          className={`nav-item ${isHome ? "nav-item-active" : "hover:text-[#6495ED]"}`}
        >
          <HomeIcon active={isHome} />
        </Link>
        <Link
          href="/communities"
          aria-label={t("nav.communities")}
          onTouchStart={prefetch("/communities")}
          className={`nav-item ${
            isCommunities ? "nav-item-active" : "hover:text-[#6495ED]"
          }`}
        >
          <CommunitiesIcon active={isCommunities} />
        </Link>
        <Link
          href="/messages"
          aria-label={t("nav.messages")}
          onTouchStart={prefetch("/messages")}
          className={`nav-item relative ${
            isMessages ? "nav-item-active" : "hover:text-[#6495ED]"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className={iconClass}
            aria-hidden="true"
          >
            <path
              d="M5 6.5h14a2 2 0 0 1 2 2v6.2a2 2 0 0 1-2 2H10l-4.5 3.3a.5.5 0 0 1-.8-.4V16.7H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {status === "authenticated" ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#6495ED] shadow animate-pop" />
          ) : null}
        </Link>
        <Link
          href="/create"
          aria-label={t("nav.create")}
          onTouchStart={prefetch("/create")}
          className={`nav-item pressable ${
            isCreate ? "nav-item-active" : "hover:text-[#6495ED]"
          }`}
        >
          <CreateIcon />
        </Link>
        <Link
          href="/settings"
          aria-label={t("nav.settings")}
          onTouchStart={prefetch("/settings")}
          className={`nav-item ${
            isSettings ? "nav-item-active" : "hover:text-[#6495ED]"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className={iconClass}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3.2" />
            <path
              d="M19.4 15.2l1.2-2.1-1.2-2.1-2.4.1a6.8 6.8 0 0 0-1.2-1.2l.1-2.4-2.1-1.2-2.1 1.2-.1 2.4a6.8 6.8 0 0 0-1.2 1.2l-2.4-.1-1.2 2.1 1.2 2.1 2.4-.1a6.8 6.8 0 0 0 1.2 1.2l-.1 2.4 2.1 1.2 2.1-1.2.1-2.4a6.8 6.8 0 0 0 1.2-1.2l2.4.1Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <Link
          href={profileHref}
          aria-label={t("nav.profile")}
          onTouchStart={prefetch(profileHref)}
          className={`nav-item ${isProfile ? "nav-item-active" : "hover:text-[#6495ED]"}`}
        >
          <ProfileIcon active={isProfile} />
        </Link>
      </div>
    </nav>
  );
}
