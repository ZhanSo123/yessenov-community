"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import PostCard from "@/components/PostCard";
import ReplyComposer from "@/components/ReplyComposer";
import { type PostWithMeta } from "@/lib/post-types";
import { useI18n } from "@/lib/i18n/useI18n";

type ThreadResponse = {
  data?: {
    post: PostWithMeta;
    replies: PostWithMeta[];
    nextCursor?: string | null;
  };
  error?: string;
};

type RepliesResponse = {
  data?: PostWithMeta[];
  nextCursor?: string | null;
};

type LikeToggleResponse = {
  data?: {
    postId: number;
    liked: boolean;
    likeCount: number;
  };
};

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = typeof params.id === "string" ? params.id : "";
  const postId = Number(idParam);
  const { data: session } = useSession();
  const { t } = useI18n();

  const [post, setPost] = useState<PostWithMeta | null>(null);
  const [replies, setReplies] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [likePending, setLikePending] = useState<Set<number>>(new Set());
  const [replyToast, setReplyToast] = useState("");
  const [highlightReplyId, setHighlightReplyId] = useState<number | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const mergeReplies = (current: PostWithMeta[], incoming: PostWithMeta[]) => {
    const ids = new Set(
      current
        .filter((reply) => typeof reply.id === "number")
        .map((reply) => reply.id as number)
    );

    const merged = [...current];
    incoming.forEach((reply) => {
      if (typeof reply.id !== "number") {
        return;
      }
      if (!ids.has(reply.id)) {
        merged.push(reply);
        ids.add(reply.id);
      }
    });

    return merged;
  };

  const loadThread = async () => {
    setLoading(true);
    setError("");
    setActionMessage("");

    try {
      const response = await fetch(`/api/posts/${idParam}`, {
        credentials: "include",
      });

      if (response.status === 404) {
        setPost(null);
        setReplies([]);
        setNextCursor(null);
        setError(t("thread.error.not_found"));
        return;
      }

      if (response.status === 403) {
        setPost(null);
        setReplies([]);
        setNextCursor(null);
        setError(t("thread.error.private"));
        return;
      }

      if (!response.ok) {
        throw new Error(t("thread.error.load"));
      }

      const payload = (await response.json()) as ThreadResponse;
      setPost(payload.data?.post ?? null);
      setReplies(payload.data?.replies ?? []);
      setNextCursor(payload.data?.nextCursor ?? null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : t("thread.error.load_generic")
      );
    } finally {
      setLoading(false);
    }
  };

  const loadMoreReplies = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const url = new URL(`/api/posts/${idParam}`, window.location.origin);
      url.searchParams.set("cursor", nextCursor);

      const response = await fetch(url.toString(), { credentials: "include" });
      if (!response.ok) {
        throw new Error(t("thread.error.replies"));
      }

      const payload = (await response.json()) as RepliesResponse;
      const incoming = payload.data ?? [];
      setReplies((current) => mergeReplies(current, incoming));
      setNextCursor(payload.nextCursor ?? null);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (idParam) {
      loadThread();
    }
  }, [idParam]);

  const handleToggleLike = async (targetId: number) => {
    if (likePending.has(targetId)) {
      return;
    }

    setActionMessage("");
    let previousLiked = false;
    let previousCount = 0;

    if (post && post.id === targetId) {
      previousLiked = post.viewerHasLiked;
      previousCount = post._count.likes;
      setPost({
        ...post,
        viewerHasLiked: !post.viewerHasLiked,
        _count: {
          ...post._count,
          likes: Math.max(0, post._count.likes + (post.viewerHasLiked ? -1 : 1)),
        },
      });
    } else {
      setReplies((current) =>
        current.map((reply) => {
          if (reply.id !== targetId) {
            return reply;
          }
          previousLiked = reply.viewerHasLiked;
          previousCount = reply._count.likes;
          const nextLiked = !reply.viewerHasLiked;
          return {
            ...reply,
            viewerHasLiked: nextLiked,
            _count: {
              ...reply._count,
              likes: Math.max(0, reply._count.likes + (nextLiked ? 1 : -1)),
            },
          };
        })
      );
    }

    setLikePending((current) => new Set(current).add(targetId));

    try {
      const response = await fetch("/api/likes/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: targetId }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setActionMessage(t("thread.action.like_requires_login"));
          throw new Error("unauthorized");
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
            setActionMessage(t("thread.error.banned", { until, reason }));
          } else if (payload?.error === "ONBOARDING_REQUIRED") {
            router.push("/onboarding");
            throw new Error("onboarding");
          } else {
            setActionMessage(t("thread.error.forbidden"));
          }
          throw new Error("forbidden");
        }
        throw new Error("failed");
      }

      const payload = (await response.json()) as LikeToggleResponse;
      if (!payload.data) {
        throw new Error("failed");
      }

      if (post && post.id === targetId) {
        setPost({
          ...post,
          viewerHasLiked: payload.data.liked,
          _count: { ...post._count, likes: payload.data.likeCount },
        });
      } else {
        setReplies((current) =>
          current.map((reply) =>
            reply.id === targetId
              ? {
                  ...reply,
                  viewerHasLiked: payload.data?.liked ?? reply.viewerHasLiked,
                  _count: {
                    ...reply._count,
                    likes: payload.data?.likeCount ?? reply._count.likes,
                  },
                }
              : reply
          )
        );
      }
    } catch {
      if (post && post.id === targetId) {
        setPost({
          ...post,
          viewerHasLiked: previousLiked,
          _count: { ...post._count, likes: previousCount },
        });
      } else {
        setReplies((current) =>
          current.map((reply) =>
            reply.id === targetId
              ? {
                  ...reply,
                  viewerHasLiked: previousLiked,
                  _count: { ...reply._count, likes: previousCount },
                }
              : reply
          )
        );
      }
    } finally {
      setLikePending((current) => {
        const next = new Set(current);
        next.delete(targetId);
        return next;
      });
    }
  };

  const handleReplyOptimistic = (reply: PostWithMeta) => {
    setReplies((current) => [...current, reply]);
  };

  const handleReplyCreated = (reply: PostWithMeta, tempId?: string) => {
    setReplies((current) =>
      tempId
        ? current.map((item) => (item.id === tempId ? reply : item))
        : [...current, reply]
    );

    if (session?.user?.email && postId) {
      try {
        const key = `yc:participation:${session.user.email}`;
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        const baseCount = post?._count.replies ?? 0;
        parsed[postId] = {
          replyCount: baseCount + 1,
          updatedAt: Date.now(),
        };
        window.localStorage.setItem(key, JSON.stringify(parsed));
      } catch {
        // ignore local storage issues
      }
    }

    if (post) {
      setPost({
        ...post,
        _count: { ...post._count, replies: post._count.replies + 1 },
      });
    }

    setReplyToast(t("thread.toast.reply_sent"));
    window.setTimeout(() => {
      setReplyToast("");
    }, 1800);

    if (typeof reply.id === "number") {
      window.setTimeout(() => {
        setHighlightReplyId(reply.id as number);
        window.setTimeout(() => setHighlightReplyId(null), 1200);
      }, 2000);
    }
  };

  const handleReplyFailed = (tempId: string) => {
    setReplies((current) => current.filter((item) => item.id !== tempId));
  };

  const handleDeleted = (targetId: number) => {
    setActionMessage("");
    setReplies((current) => current.filter((item) => item.id !== targetId));
    setPost((current) => {
      if (!current || current.id !== targetId) {
        return current;
      }
      return {
        ...current,
        deletedAt: new Date().toISOString(),
      };
    });
  };

  const handleDeleteError = (message: string) => {
    setActionMessage(message);
  };

  const canReply = Boolean(postId && !post?.deletedAt && post?.canViewDeleted !== false);
  const isNotAuthor =
    Boolean(session?.user?.id) &&
    Boolean(post?.author.id) &&
    session?.user?.id !== post?.author.id;

  const handleContinueDiscussion = () => {
    replyInputRef.current?.focus();
  };

  const canLoadMore = useMemo(
    () => Boolean(nextCursor) && !loadingMore,
    [nextCursor, loadingMore]
  );

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-16 pt-10">
        <Link href="/" className="text-xs text-slate-500">
          {t("thread.back")}
        </Link>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600">
            {actionMessage}
          </div>
        ) : null}
        {replyToast ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
            {replyToast}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        ) : null}

        {post ? (
          <div className="space-y-4">
            <PostCard
              post={post}
              onLike={handleToggleLike}
              onDeleted={handleDeleted}
              onDeleteError={handleDeleteError}
              showActions
            />
            {canReply ? (
              <ReplyComposer
                postId={postId}
                onOptimistic={handleReplyOptimistic}
                onCreated={handleReplyCreated}
                onFailed={handleReplyFailed}
                inputRef={replyInputRef}
              />
            ) : null}
          </div>
        ) : null}

        {replies.length ? (
          <div className="space-y-4">
            {replies.map((reply) => (
              <PostCard
                key={reply.id}
                post={reply}
                onLike={handleToggleLike}
                onDeleted={handleDeleted}
                onDeleteError={handleDeleteError}
                showActions
                indent
                highlight={highlightReplyId === reply.id}
              />
            ))}
            {canReply ? (
              <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
                <button
                  type="button"
                  onClick={handleContinueDiscussion}
                  className="font-semibold text-slate-900"
                >
                  {t("thread.continue")}
                </button>
                {isNotAuthor ? (
                  <span className="ml-2 text-xs text-slate-500">
                    {t("thread.prompt")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {nextCursor ? (
          <button
            type="button"
            onClick={loadMoreReplies}
            disabled={!canLoadMore}
            className="bubble-btn self-center rounded-full px-5 py-2 text-sm disabled:opacity-60 pressable"
          >
            {loadingMore ? t("common.loading_more") : t("common.load_more")}
          </button>
        ) : null}
      </main>
    </div>
  );
}
