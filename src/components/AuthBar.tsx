"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProviders, signIn, signOut, useSession } from "next-auth/react";

import { useI18n } from "@/lib/i18n/useI18n";

export default function AuthBar() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const { t } = useI18n();
  const label =
    user?.displayName ?? user?.name ?? user?.email ?? t("common.user");
  const [hasGoogleProvider, setHasGoogleProvider] = useState(true);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    getProviders()
      .then((providers) => {
        if (!active) {
          return;
        }

        setHasGoogleProvider(Boolean(providers?.google));
        setProvidersLoaded(true);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setHasGoogleProvider(false);
        setProvidersLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated") {
      setUnreadCount(0);
      return () => {
        active = false;
      };
    }

    fetch("/api/notifications/unread-count", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload?.data) {
          return;
        }
        setUnreadCount(payload.data.count ?? 0);
      })
      .catch(() => {
        if (active) {
          setUnreadCount(0);
        }
      });

    return () => {
      active = false;
    };
  }, [status]);

  const googleMissing = providersLoaded && !hasGoogleProvider;
  const canSignIn = providersLoaded && hasGoogleProvider;

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {t("auth_bar.welcome")}
          </p>
          <p className="text-xs text-slate-600">
            {status === "loading"
              ? t("auth_bar.session_checking")
              : status === "authenticated"
              ? t("auth_bar.signed_in_as", { label })
              : googleMissing
              ? t("auth_bar.google_missing")
              : t("auth_bar.sign_in_prompt")}
          </p>
        </div>

        {status === "authenticated" ? (
          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className="bubble-btn relative rounded-full px-4 py-2 text-sm font-semibold pressable"
            >
              {t("auth_bar.notifications")}
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="bubble-btn-primary rounded-full px-4 py-2 text-sm font-semibold pressable"
            >
              {t("auth_bar.sign_out")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/welcome"
              className="bubble-btn-primary rounded-full px-4 py-2 text-sm font-semibold pressable"
            >
              {t("auth_bar.sign_in")}
            </Link>
            <button
              type="button"
              onClick={() => signIn("google")}
              disabled={!canSignIn || status === "loading"}
              className="bubble-btn rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 pressable"
            >
              {t("common.google")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
