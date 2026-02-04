import { performance } from "node:perf_hooks";
import { type Prisma } from "@prisma/client";

import { canModerate, type Role } from "@/lib/auth";
import { buildCursor } from "@/lib/pagination";
import { getInfrastructure } from "@/infrastructure";
import { LikeRepository } from "@/repositories/like-repository";
import { PostRepository } from "@/repositories/post-repository";

export type RepliesViewer = {
  id: string;
  role: Role;
  faculty?: string | null;
  course?: number | null;
};

export type RepliesParams = {
  postId: number;
  viewer: RepliesViewer | null;
  limit: number;
  cursor: { createdAt: Date; id: number } | null;
  logDb?: (query: string, ms: number) => void;
};

type ReplyItem = {
  id: number;
  content: string;
  createdAt: Date;
  replyToId: number | null;
  deletedAt: Date | null;
  authorId: string;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    image: string | null;
  };
  _count: { likes: number; replies: number };
  canViewDeleted: boolean;
  viewerHasLiked: boolean;
};

export type RepliesResult =
  | {
      ok: true;
      payload: { data: ReplyItem[]; nextCursor: string | null };
      cacheKey: string;
      cached: boolean;
    }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

const REPLIES_CACHE_TTL_MS = 18 * 1000;

export class RepliesService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly likeRepo = new LikeRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async listReplies(params: RepliesParams): Promise<RepliesResult> {
    const { postId, viewer, limit, cursor, logDb } = params;
    const viewerId = viewer?.id ?? null;
    const viewerRole = viewer?.role ?? "ANON";
    const viewerCanModerate = viewer ? canModerate(viewer) : false;
    const cacheKey = `post-replies:${postId}:${viewerId ?? "anon"}:${viewerRole}:${viewer?.faculty ?? "none"}:${viewer?.course ?? "none"}:${limit}:${cursor?.createdAt?.toISOString() ?? "none"}:${cursor?.id ?? "none"}`;

    const cached = await this.cache.get<{
      data: ReplyItem[];
      nextCursor: string | null;
    }>(cacheKey);
    if (cached) {
      return { ok: true, payload: cached, cacheKey, cached: true };
    }

    const parentStart = performance.now();
    const parent = await this.postRepo.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, deletedAt: true },
    });
    if (logDb) {
      logDb("post.findUnique.parent", performance.now() - parentStart);
    }

    if (!parent) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (parent.deletedAt && !viewerCanModerate && viewerId !== parent.authorId) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const repliesWhere: Prisma.PostWhereInput = {
      replyToId: postId,
      deletedAt: null,
    };

    if (cursor) {
      const andArray = Array.isArray(repliesWhere.AND)
        ? repliesWhere.AND
        : repliesWhere.AND
          ? [repliesWhere.AND]
          : [];
      repliesWhere.AND = [
        ...andArray,
        {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        },
      ];
    }

    if (!viewerCanModerate) {
      const andArray = Array.isArray(repliesWhere.AND)
        ? repliesWhere.AND
        : repliesWhere.AND
          ? [repliesWhere.AND]
          : [];
      repliesWhere.AND = [
        ...andArray,
        { author: { shadowBannedAt: null } },
      ];
    }

    const repliesStart = performance.now();
    const replies = await this.postRepo.findMany({
      where: repliesWhere,
      orderBy: [
        { createdAt: "asc" as const },
        { id: "asc" as const },
      ],
      take: limit + 1,
      select: {
        id: true,
        content: true,
        createdAt: true,
        replyToId: true,
        deletedAt: true,
        authorId: true,
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
            shadowBannedAt: true,
          },
        },
        _count: { select: { likes: true, replies: true } },
      },
    });
    if (logDb) {
      logDb("post.findMany.replies", performance.now() - repliesStart);
    }

    const hasMore = replies.length > limit;
    const sliced = hasMore ? replies.slice(0, limit) : replies;

    let likedSet = new Set<number>();
    if (viewerId) {
      const likesStart = performance.now();
      const likes = await this.likeRepo.findMany({
        where: { userId: viewerId, postId: { in: sliced.map((r) => r.id) } },
        select: { postId: true },
      });
      if (logDb) {
        logDb("like.findMany", performance.now() - likesStart);
      }
      likedSet = new Set(likes.map((like) => like.postId));
    }

    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    const payload = {
      data: sliced.map((reply) => {
        const isReplyShadowBanned = Boolean(reply.author.shadowBannedAt);
        const canViewReply =
          !reply.deletedAt &&
          (!isReplyShadowBanned ||
            viewerCanModerate ||
            (viewerId ? reply.authorId === viewerId : false));

        return {
          ...reply,
          author: {
            id: reply.author.id,
            username: reply.author.username,
            displayName: reply.author.displayName,
            image: reply.author.image,
          },
          canViewDeleted: canViewReply,
          viewerHasLiked: likedSet.has(reply.id),
        };
      }),
      nextCursor,
    };

    await this.cache.set(cacheKey, payload, REPLIES_CACHE_TTL_MS);

    return { ok: true, payload, cacheKey, cached: false };
  }
}
