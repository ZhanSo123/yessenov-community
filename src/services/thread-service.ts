import { performance } from "node:perf_hooks";
import { type Prisma } from "@prisma/client";

import { canModerate, type Role } from "@/lib/auth";
import { canAccessCommunity } from "@/lib/community-access";
import { buildCursor } from "@/lib/pagination";
import { getInfrastructure } from "@/infrastructure";
import { CommunityRepository } from "@/repositories/community-repository";
import { LikeRepository } from "@/repositories/like-repository";
import { PostRepository } from "@/repositories/post-repository";

export type ThreadViewer = {
  id: string;
  role: Role;
  faculty?: string | null;
  course?: number | null;
};

export type ThreadParams = {
  postId: number;
  viewer: ThreadViewer | null;
  limit: number;
  cursor: { createdAt: Date; id: number } | null;
  logDb?: (query: string, ms: number) => void;
};

type ThreadPost = {
  id: number;
  content: string;
  createdAt: Date;
  replyToId: number | null;
  deletedAt: Date | null;
  authorId: string;
  communityId?: number | null;
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

type ThreadReply = ThreadPost;

export type ThreadPayload = {
  data: {
    post: ThreadPost;
    replies: ThreadReply[];
    nextCursor: string | null;
  };
};

export type ThreadResult = {
  ok: true;
  payload: ThreadPayload;
  cacheKey: string;
  cached: boolean;
};

export type ThreadError = {
  ok: false;
  code: "NOT_FOUND" | "FORBIDDEN";
  status: 404 | 403;
  meta?: { message?: string };
};

const THREAD_CACHE_TTL_MS = 20 * 1000;

export class ThreadService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly communityRepo = new CommunityRepository(),
    private readonly likeRepo = new LikeRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async getThread(params: ThreadParams): Promise<ThreadResult | ThreadError> {
    const { postId, viewer, limit, cursor, logDb } = params;
    const viewerId = viewer?.id ?? null;
    const viewerRole = viewer?.role ?? "ANON";
    const viewerCanModerate = viewer ? canModerate(viewer) : false;
    const cacheKey = `post:${postId}:${viewerId ?? "anon"}:${viewerRole}:${viewer?.faculty ?? "none"}:${viewer?.course ?? "none"}:${limit}:${cursor?.createdAt?.toISOString() ?? "none"}:${cursor?.id ?? "none"}`;

    const cached = await this.cache.get<ThreadPayload>(cacheKey);
    if (cached) {
      return { ok: true, payload: cached, cacheKey, cached: true };
    }

    const postStart = performance.now();
    const post = await this.postRepo.findUnique({
      where: { id: postId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        replyToId: true,
        deletedAt: true,
        authorId: true,
        communityId: true,
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
      logDb("post.findUnique", performance.now() - postStart);
    }

    if (!post) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (post.communityId) {
      const communityStart = performance.now();
      const community = await this.communityRepo.findUnique({
        where: { id: post.communityId },
        select: {
          id: true,
          type: true,
          isPrivate: true,
          facultyCode: true,
          courseYear: true,
        },
      });
      if (logDb) {
        logDb("community.findUnique", performance.now() - communityStart);
      }

      if (!community) {
        return { ok: false, code: "NOT_FOUND", status: 404 };
      }

      const hasAccess = await canAccessCommunity(
        community,
        viewer
          ? {
              id: viewer.id,
              role: viewer.role,
              faculty: viewer.faculty ?? null,
              course: viewer.course ?? null,
            }
          : null
      );

      if (!hasAccess) {
        return {
          ok: false,
          code: "FORBIDDEN",
          status: 403,
          meta: { message: "PRIVATE_COMMUNITY" },
        };
      }
    }

    if (post.deletedAt && !viewerCanModerate && viewerId !== post.authorId) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const canViewDeleted =
      !post.deletedAt || viewerCanModerate || viewerId === post.authorId;
    const isShadowBanned =
      Boolean(post.author.shadowBannedAt) &&
      !viewerCanModerate &&
      viewerId !== post.authorId;

    if (!canViewDeleted || isShadowBanned) {
      const payload: ThreadPayload = {
        data: {
          post: {
            ...post,
            author: {
              id: post.author.id,
              username: post.author.username,
              displayName: post.author.displayName,
              image: post.author.image,
            },
            content: "",
            canViewDeleted: false,
            viewerHasLiked: false,
          },
          replies: [],
          nextCursor: null,
        },
      };
      await this.cache.set(cacheKey, payload, THREAD_CACHE_TTL_MS);
      return { ok: true, payload, cacheKey, cached: false };
    }

    const repliesWhere: Prisma.PostWhereInput = {
      replyToId: post.id,
      deletedAt: null,
    };
    const replyFilters: Prisma.PostWhereInput[] = [];

    if (cursor) {
      replyFilters.push({
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ],
      });
    }

    if (!viewerCanModerate) {
      replyFilters.push({ author: { shadowBannedAt: null } });
    }

    if (replyFilters.length > 0) {
      repliesWhere.AND = replyFilters;
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
    const slicedReplies = hasMore ? replies.slice(0, limit) : replies;

    let likedSet = new Set<number>();
    if (viewerId) {
      const likesStart = performance.now();
      const likes = await this.likeRepo.findMany({
        where: {
          userId: viewerId,
          postId: {
            in: [post.id, ...slicedReplies.map((reply) => reply.id)],
          },
        },
        select: { postId: true },
      });
      if (logDb) {
        logDb("like.findMany", performance.now() - likesStart);
      }
      likedSet = new Set(likes.map((like) => like.postId));
    }

    const nextCursor = hasMore
      ? buildCursor(
          slicedReplies[slicedReplies.length - 1].createdAt,
          slicedReplies[slicedReplies.length - 1].id
        )
      : null;

    const payload: ThreadPayload = {
      data: {
        post: {
          ...post,
          author: {
            id: post.author.id,
            username: post.author.username,
            displayName: post.author.displayName,
            image: post.author.image,
          },
          canViewDeleted: true,
          viewerHasLiked: likedSet.has(post.id),
        },
        replies: slicedReplies.map((reply) => {
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
      },
    };

    await this.cache.set(cacheKey, payload, THREAD_CACHE_TTL_MS);

    return { ok: true, payload, cacheKey, cached: false };
  }
}
