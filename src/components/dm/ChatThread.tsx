"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import MessageBubble from "@/components/dm/MessageBubble";
import MessageComposer from "@/components/dm/MessageComposer";

type Participant = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
};

type MessageItem = {
  id: string;
  content: string;
  createdAt: string;
  sender: Participant;
  sending?: boolean;
};

type ConversationResponse = {
  data?: {
    conversation: {
      id: string;
      participants: Participant[];
    };
    messages: MessageItem[];
  };
  nextCursor?: string | null;
  error?: string;
};

type SendResponse = {
  data?: MessageItem;
  error?: string;
};

export default function ChatThread({ conversationId }: { conversationId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [conversation, setConversation] = useState<ConversationResponse["data"] | null>(
    null
  );
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const currentUserId = session?.user?.id ?? null;

  const otherParticipant = useMemo(() => {
    const participants = conversation?.conversation.participants ?? [];
    if (!currentUserId) {
      return participants[0] ?? null;
    }
    return participants.find((item) => item.id !== currentUserId) ?? null;
  }, [conversation, currentUserId]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const loadConversation = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dm/${conversationId}`, {
        credentials: "include",
      });

      if (response.status === 403) {
        setError("Доступ запрещён.");
        return;
      }

      if (response.status === 404) {
        setError("Диалог не найден.");
        return;
      }

      if (!response.ok) {
        throw new Error("Не удалось загрузить диалог.");
      }

      const payload = (await response.json()) as ConversationResponse;
      const incoming = payload.data?.messages ?? [];
      setConversation(payload.data ?? null);
      setMessages(incoming.slice().reverse());
      setNextCursor(payload.nextCursor ?? null);

      fetch(`/api/dm/${conversationId}/read`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        // ignore
      });
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (conversationId) {
      loadConversation();
    }
  }, [conversationId]);

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [loading, messages.length]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const url = new URL(`/api/dm/${conversationId}`, window.location.origin);
      url.searchParams.set("cursor", nextCursor);

      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить сообщения.");
      }

      const payload = (await response.json()) as ConversationResponse;
      const incoming = payload.data?.messages ?? [];
      setMessages((current) => [...incoming.reverse(), ...current]);
      setNextCursor(payload.nextCursor ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Ошибка загрузки"
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSend = async (content: string) => {
    if (!currentUserId || !conversation) {
      return false;
    }

    setSendError("");
    const tempId = `temp-${Date.now()}`;
    const sender = conversation.conversation.participants.find(
      (participant) => participant.id === currentUserId
    );

    const tempMessage: MessageItem = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      sender: sender ?? {
        id: currentUserId,
        username: session?.user?.username ?? null,
        displayName: session?.user?.displayName ?? null,
        image: session?.user?.image ?? null,
      },
      sending: true,
    };

    setMessages((current) => [...current, tempMessage]);
    scrollToBottom();

    try {
      const response = await fetch(`/api/dm/${conversationId}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/welcome");
          return false;
        }
        throw new Error("Не удалось отправить сообщение.");
      }

      const payload = (await response.json()) as SendResponse;
      if (!payload.data) {
        throw new Error("Не удалось отправить сообщение.");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === tempId ? payload.data! : message
        )
      );
      setNextCursor((current) => current);
      return true;
    } catch (sendError) {
      setMessages((current) => current.filter((msg) => msg.id !== tempId));
      setSendError(
        sendError instanceof Error
          ? sendError.message
          : "Не удалось отправить сообщение."
      );
      return false;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ef] text-slate-900">
      <div className="border-b border-slate-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          {otherParticipant?.image ? (
            <img
              src={otherParticipant.image}
              alt={otherParticipant.displayName ?? otherParticipant.username ?? "User"}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {(otherParticipant?.displayName || otherParticipant?.username || "U")
                .slice(0, 1)
                .toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {otherParticipant?.displayName || otherParticipant?.username || "Диалог"}
            </p>
            {otherParticipant?.username ? (
              <p className="text-xs text-slate-500">@{otherParticipant.username}</p>
            ) : null}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-6">
        {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {nextCursor ? (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="self-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-60"
          >
            {loadingMore ? "Загружаем..." : "Показать ещё"}
          </button>
        ) : null}

        <div className="flex flex-col gap-3">
          {messages.map((message, index) => {
            const prev = messages[index - 1];
            const isMine = message.sender.id === currentUserId;
            const showAvatar = !isMine && prev?.sender.id !== message.sender.id;
            return (
              <MessageBubble
                key={message.id}
                content={message.content}
                createdAt={message.createdAt}
                sender={message.sender}
                isMine={isMine}
                showAvatar={showAvatar}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>

        {sendError ? (
          <p className="text-xs text-rose-500">{sendError}</p>
        ) : null}

        <MessageComposer onSend={handleSend} disabled={Boolean(error)} />
      </main>
    </div>
  );
}
