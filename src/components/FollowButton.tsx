"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { useI18n } from "@/lib/i18n/useI18n";

type FollowButtonProps = {
  username: string;
  initialFollowing: boolean;
};

export default function FollowButton({
  username,
  initialFollowing,
}: FollowButtonProps) {
  const { data: session, status } = useSession();
  const { t } = useI18n();
  const [following, setFollowing] = useState(initialFollowing);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevFollowingRef = useRef(initialFollowing);

  const isUnauthed = status === "unauthenticated";
  const isLoading = status === "loading";

  useEffect(() => {
    if (!prevFollowingRef.current && following) {
      setPulse(true);
      const timer = window.setTimeout(() => setPulse(false), 220);
      prevFollowingRef.current = following;
      return () => window.clearTimeout(timer);
    }
    prevFollowingRef.current = following;
  }, [following]);

  const handleToggle = async () => {
    setMessage("");

    if (isUnauthed) {
      setMessage(t("follow.error.sign_in"));
      return;
    }

    const previous = following;
    if (navigator?.vibrate && !previous) {
      navigator.vibrate(10);
    }
    setFollowing(!previous);
    setLoading(true);
    try {
      const response = await fetch("/api/follow/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (response.status === 401) {
        setMessage(t("follow.error.session_expired"));
        setFollowing(previous);
        return;
      }

      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; bannedUntil?: string; banReason?: string }
          | null;
        if (payload?.error === "BANNED") {
          const until = payload.bannedUntil
            ? new Date(payload.bannedUntil).toLocaleDateString()
            : t("common.unknown");
          const reason = payload.banReason
            ? ` ${t("common.reason", { reason: payload.banReason })}`
            : "";
          setMessage(t("follow.error.banned", { until, reason }));
        } else {
          setMessage(t("follow.error.forbidden"));
        }
        setFollowing(previous);
        return;
      }

      if (!response.ok) {
        setMessage(t("follow.error.update_failed"));
        setFollowing(previous);
        return;
      }

      const payload = (await response.json()) as {
        data?: { following: boolean };
      };
      setFollowing(Boolean(payload.data?.following));
    } catch {
      setMessage(t("follow.error.update_failed"));
      setFollowing(previous);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading || loading}
        className={`bubble-btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 pressable ${
          pulse ? "animate-pop" : ""
        }`}
      >
        {loading
          ? t("follow.action.pending")
          : following
            ? t("follow.action.unfollow")
            : t("follow.action.follow")}
      </button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
