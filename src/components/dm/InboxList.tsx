"use client";

import { useEffect, useMemo, useState } from "react";

import ConversationRow from "@/components/dm/ConversationRow";
import { useI18n } from "@/lib/i18n/useI18n";

type Participant = {
  username: string | null;
  displayName: string | null;
  image: string | null;
};

type InboxItem = {
  id: string;
  participant: Participant | null;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

type InboxResponse = {
  data?: InboxItem[];
  nextCursor?: string | null;
  error?: string;
};

export default function InboxList() {
  const { t } = useI18n();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadInbox = async (cursor?: string | null, append = false) => {
    const url = new URL("/api/dm/inbox", window.location.origin);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(t("dm.inbox.error.load"));
    }

    const payload = (await response.json()) as InboxResponse;
    if (append) {
      setItems((current) => [...current, ...(payload.data ?? [])]);
    } else {
      setItems(payload.data ?? []);
    }
    setNextCursor(payload.nextCursor ?? null);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        await loadInbox(null, false);
      } catch (fetchError) {
        if (active) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t("dm.inbox.error.load_generic")
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    const interval = window.setInterval(() => {
      loadInbox(null, false).catch(() => {
        // ignore polling errors
      });
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      await loadInbox(nextCursor, true);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : t("dm.inbox.error.load_generic")
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const emptyState = useMemo(
    () =>
      !loading && !error && items.length === 0
        ? t("dm.inbox.empty")
        : "",
    [error, items.length, loading]
  );

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`dm-skeleton-${index}`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-3 w-28 rounded bg-slate-200" />
                  <div className="h-3 w-20 rounded bg-slate-200" />
                </div>
              </div>
              <div className="h-3 w-10 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {emptyState ? (
        <div className="rounded-xl border border-slate-200 bg-white/90 p-5 text-sm text-slate-500">
          {emptyState}
        </div>
      ) : null}
      {items.map((item) => (
        <ConversationRow
          key={item.id}
          conversationId={item.id}
          participant={item.participant}
          lastMessage={
            item.lastMessage
              ? {
                  content: item.lastMessage.content,
                  createdAt: item.lastMessage.createdAt,
                  senderId: item.lastMessage.senderId,
                }
              : null
          }
          unreadCount={item.unreadCount}
        />
      ))}
      {nextCursor ? (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
        className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 pressable"
      >
          {loadingMore ? t("dm.inbox.loading_more") : t("dm.inbox.load_more")}
      </button>
      ) : null}
    </div>
  );
}
