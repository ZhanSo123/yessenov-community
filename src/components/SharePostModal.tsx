"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type PostWithMeta } from "@/lib/post-types";

type SharePostModalProps = {
  post: PostWithMeta;
  open: boolean;
  onClose: () => void;
};

type SearchItem = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
};

type SearchResponse = {
  items?: SearchItem[];
  nextCursor?: string | null;
};

export default function SharePostModal({ post, open, onClose }: SharePostModalProps) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [recent, setRecent] = useState<SearchItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recommended, setRecommended] = useState<SearchItem[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, SearchItem>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sheetOffset, setSheetOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; offset: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setNote("");
      setItems([]);
      setRecent([]);
      setRecentLoading(false);
      setRecommended([]);
      setRecommendedLoading(false);
      setLoading(false);
      setSendingId(null);
      setSelected({});
      setError("");
      setSuccess("");
      setSheetOffset(0);
      return;
    }

    if (!query.trim()) {
      setItems([]);
      setLoading(false);
      setError("");
      return;
    }

    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const url = new URL("/api/search/users", window.location.origin);
        url.searchParams.set("q", query.trim());
        const response = await fetch(url.toString(), {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Не удалось загрузить пользователей.");
        }
        const payload = (await response.json()) as SearchResponse;
        setItems(payload.items ?? []);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Ошибка загрузки"
        );
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    const loadRecent = async () => {
      setRecentLoading(true);
      try {
        const url = new URL("/api/dm/inbox", window.location.origin);
        url.searchParams.set("limit", "6");
        const response = await fetch(url.toString(), { credentials: "include" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          data?: { participant?: SearchItem | null }[];
        };
        const participants = (payload.data ?? [])
          .map((item) => item.participant)
          .filter((item): item is SearchItem => Boolean(item));
        if (active) {
          setRecent(participants);
        }
      } finally {
        if (active) {
          setRecentLoading(false);
        }
      }
    };

    const loadRecommended = async () => {
      setRecommendedLoading(true);
      try {
        const me = await fetch("/api/me/profile", { credentials: "include" });
        if (!me.ok) {
          return;
        }
        const mePayload = (await me.json()) as {
          data?: { user?: { username?: string | null } };
        };
        const username = mePayload.data?.user?.username ?? null;
        if (!username) {
          return;
        }

        const url = new URL(`/api/users/${username}/following`, window.location.origin);
        url.searchParams.set("limit", "8");
        const response = await fetch(url.toString(), { credentials: "include" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          items?: SearchItem[];
        };
        if (active) {
          setRecommended(payload.items ?? []);
        }
      } finally {
        if (active) {
          setRecommendedLoading(false);
        }
      }
    };

    loadRecent();
    loadRecommended();
    return () => {
      active = false;
    };
  }, [open]);

  const handleSend = async (user: SearchItem) => {
    if (!user.username || typeof post.id !== "number") {
      return;
    }

    setSendingId(user.id);
    setError("");
    setSuccess("");

    try {
      const start = await fetch("/api/dm/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username }),
      });

      if (!start.ok) {
        throw new Error("Не удалось открыть диалог.");
      }

      const startPayload = (await start.json()) as {
        data?: { conversationId?: string };
      };
      const conversationId = startPayload.data?.conversationId;
      if (!conversationId) {
        throw new Error("Не удалось открыть диалог.");
      }

      const link = `${window.location.origin}/p/${post.id}`;
      const trimmedNote = note.trim();
      const message = trimmedNote ? `${trimmedNote}\nПост: ${link}` : `Пост: ${link}`;

      const send = await fetch(`/api/dm/${conversationId}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });

      if (!send.ok) {
        throw new Error("Не удалось отправить пост.");
      }

      setSuccess("Отправлено");
      setNote("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Не удалось отправить"
      );
    } finally {
      setSendingId(null);
    }
  };

  const handleToggleSelect = (user: SearchItem) => {
    if (!user.username) {
      return;
    }
    setSelected((current) => {
      if (current[user.id]) {
        const next = { ...current };
        delete next[user.id];
        return next;
      }
      return { ...current, [user.id]: user };
    });
  };

  const handleSendSelected = async () => {
    const entries = Object.values(selected);
    if (entries.length === 0 || typeof post.id !== "number") {
      return;
    }
    setSendingId("bulk");
    setError("");
    setSuccess("");
    const link = `${window.location.origin}/p/${post.id}`;
    const trimmedNote = note.trim();
    const message = trimmedNote ? `${trimmedNote}\nПост: ${link}` : `Пост: ${link}`;

    try {
      await Promise.all(
        entries.map(async (user) => {
          if (!user.username) {
            return;
          }
          const start = await fetch("/api/dm/start", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username }),
          });

          if (!start.ok) {
            throw new Error("Не удалось открыть диалог.");
          }

          const startPayload = (await start.json()) as {
            data?: { conversationId?: string };
          };
          const conversationId = startPayload.data?.conversationId;
          if (!conversationId) {
            throw new Error("Не удалось открыть диалог.");
          }

          const send = await fetch(`/api/dm/${conversationId}/send`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: message }),
          });

          if (!send.ok) {
            throw new Error("Не удалось отправить пост.");
          }
        })
      );

      setSuccess(`Отправлено (${entries.length})`);
      setNote("");
      setSelected({});
    } catch (bulkError) {
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : "Не удалось отправить"
      );
    } finally {
      setSendingId(null);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const handle = target.closest("[data-handle='sheet-handle']");
    if (!handle) {
      return;
    }
    setDragging(true);
    dragStartRef.current = { y: event.clientY, offset: sheetOffset };
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) {
      return;
    }
    const next = Math.max(
      0,
      event.clientY - dragStartRef.current.y + dragStartRef.current.offset
    );
    setSheetOffset(next);
  };

  const handleDragEnd = () => {
    if (!dragStartRef.current) {
      return;
    }
    const shouldClose = sheetOffset > 140;
    dragStartRef.current = null;
    setDragging(false);
    if (shouldClose) {
      onClose();
      return;
    }
    setSheetOffset(0);
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-end bg-black/40 px-4 pb-6 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg h-[50vh] rounded-t-3xl bg-white p-6 shadow-xl overflow-hidden"
        style={{
          transform: `translateY(${sheetOffset}px)`,
          transition: dragging ? "none" : "transform 220ms ease",
        }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pb-3">
          <button
            type="button"
            aria-label="Свайп"
            data-handle="sheet-handle"
            className="relative h-2 w-16 rounded-full bg-slate-200"
          >
            <span className="absolute inset-0 rounded-full bg-[#6495ED]/25 blur-sm" />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Переслать</h2>
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto">
          <input
            type="search"
            placeholder="Кому переслать?"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          />
          <textarea
            placeholder="Добавить сообщение"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          />

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              {success}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">Загрузка...</p>
          ) : items.length === 0 && query.trim() ? (
            <p className="text-sm text-slate-500">Никого не нашли</p>
          ) : null}

          {Object.keys(selected).length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              {Object.values(selected).map((user) => {
                const title = user.displayName || user.username || "User";
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleToggleSelect(user)}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[#6495ED]/40"
                  >
                    {user.image ? (
                      <img
                        src={user.image}
                        alt={title}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                        {title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    {title}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleSendSelected}
                disabled={sendingId === "bulk"}
                className="bubble-btn-primary ml-auto rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 pressable"
              >
                {sendingId === "bulk" ? "Отправляем..." : "Отправить"}
              </button>
            </div>
          ) : null}

          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
            {!query.trim() ? (
              recentLoading ? (
                <p className="text-sm text-slate-500">Загрузка последних...</p>
              ) : recent.length === 0 ? (
                <p className="text-sm text-slate-500">Нет последних диалогов</p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-400">
                    Последние диалоги
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {recent.map((item) => {
                      const title = item.displayName || item.username || "User";
                      const active = Boolean(selected[item.id]);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleToggleSelect(item)}
                          className={`flex shrink-0 flex-col items-center gap-2 rounded-2xl border px-3 py-2 transition ${
                            active
                              ? "border-[#6495ED] bg-[#6495ED]/10"
                              : "border-slate-200 bg-white hover:border-[#6495ED]/40"
                          }`}
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={title}
                              className="h-12 w-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                              {title.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span className="max-w-[72px] truncate text-[11px] text-slate-600">
                            {title}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {recent.map((item) => {
                    const title = item.displayName || item.username || "User";
                    const handle = item.username ? `@${item.username}` : "";
                    const disabled = sendingId !== null && sendingId !== item.id;
                    const active = Boolean(selected[item.id]);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleSelect(item)}
                        disabled={disabled}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
                          active
                            ? "border-[#6495ED] bg-[#6495ED]/10"
                            : "border-slate-200 bg-white hover:border-[#6495ED]/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={title}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                              {title.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {title}
                            </p>
                            {handle ? (
                              <p className="text-xs text-slate-500">{handle}</p>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#6495ED]">
                          {active ? "Выбрано" : "Выбрать"}
                        </span>
                      </button>
                    );
                  })}
                </>
              )
            ) : (
              items.map((item) => {
                const title = item.displayName || item.username || "User";
                const handle = item.username ? `@${item.username}` : "";
                const disabled = sendingId !== null && sendingId !== item.id;
                const active = Boolean(selected[item.id]);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleSelect(item)}
                    disabled={disabled}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
                      active
                        ? "border-[#6495ED] bg-[#6495ED]/10"
                        : "border-slate-200 bg-white hover:border-[#6495ED]/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.image ? (
                        <img
                        src={item.image}
                        alt={title}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                        {title.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {title}
                        </p>
                        {handle ? (
                          <p className="text-xs text-slate-500">{handle}</p>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#6495ED]">
                      {active ? "Выбрано" : "Выбрать"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {!query.trim() ? (
            recommendedLoading ? (
              <p className="text-sm text-slate-500">Загрузка рекомендаций...</p>
            ) : recommended.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400">
                  Рекомендуемые
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {recommended.map((item) => {
                    const title = item.displayName || item.username || "User";
                    const active = Boolean(selected[item.id]);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleSelect(item)}
                        className={`flex shrink-0 flex-col items-center gap-2 rounded-2xl border px-3 py-2 transition ${
                          active
                            ? "border-[#6495ED] bg-[#6495ED]/10"
                            : "border-slate-200 bg-white hover:border-[#6495ED]/40"
                        }`}
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={title}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                            {title.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <span className="max-w-[72px] truncate text-[11px] text-slate-600">
                          {title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null
          ) : null}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return modal;
  }

  return createPortal(modal, document.body);
}
