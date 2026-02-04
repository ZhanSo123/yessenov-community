import { performance } from "node:perf_hooks";
import { type Prisma } from "@prisma/client";

import { canModerate, type Role } from "@/lib/auth";
import { getAccessibleCommunityIds } from "@/lib/community-access";
import { buildCursor } from "@/lib/pagination";
import { getInfrastructure } from "@/infrastructure";
import { LikeRepository } from "@/repositories/like-repository";
import { PostRepository } from "@/repositories/post-repository";
import { UserRepository } from "@/repositories/user-repository";

export type ProfileViewer = {
  id: string;
  role: Role;
  faculty?: string | null;
  course?: number | null;
};

type ProfilePost = {
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
  community: { id: string; slug: string; title: string } | null;
  _count: { likes: number; replies: number };
  viewerHasLiked: boolean;
  canViewDeleted: boolean;
};

export type ProfileListResult =
  | {
      ok: true;
      payload: {
        data: ProfilePost[];
        nextCursor: string | null;
        totalCount: number;
      };
      cacheKey: string;
      cached: boolean;
    }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

const PROFILE_POSTS_CACHE_TTL_MS = 20 * 1000;
const PROFILE_REPLIES_CACHE_TTL_MS = 20 * 1000;
const USER_ID_CACHE_TTL_MS = 5 * 60 * 1000;

const buildCursorFilter = (cursor: { createdAt: Date; id: number } | null) =>
  cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};

export class ProfileContentService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly likeRepo = new LikeRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async listUserPosts(params: {
    usernameLower: string;
    viewer: ProfileViewer | null;
    limit: number;
    cursor: { createdAt: Date; id: number } | null;
    logDb?: (query: string, ms: number) => void;
  }): Promise<ProfileListResult> {
    return this.listUserContent({ ...params, kind: "posts" });
  }

  async listUserReplies(params: {
    usernameLower: string;
    viewer: ProfileViewer | null;
    limit: number;
    cursor: { createdAt: Date; id: number } | null;
    logDb?: (query: string, ms: number) => void;
  }): Promise<ProfileListResult> {
    return this.listUserContent({ ...params, kind: "replies" });
  }

  private async listUserContent(params: {
    usernameLower: string;
    viewer: ProfileViewer | null;
    limit: number;
    cursor: { createdAt: Date; id: number } | null;
    kind: "posts" | "replies";
    logDb?: (query: string, ms: number) => void;
  }): Promise<ProfileListResult> {
    const { usernameLower, viewer, limit, cursor, kind, logDb } = params;
    const viewerId = viewer?.id ?? null;
    const viewerRole = viewer?.role ?? "ANON";
    const viewerCanModerate = viewer ? canModerate(viewer) : false;
    const cacheKey = `profile-${kind}:${usernameLower}:${viewerId ?? "anon"}:${viewerRole}:${viewer?.faculty ?? "none"}:${viewer?.course ?? "none"}:${limit}:${cursor?.createdAt?.toISOString() ?? "none"}:${cursor?.id ?? "none"}`;

    const cached = await this.cache.get<{
      data: ProfilePost[];
      nextCursor: string | null;
      totalCount: number;
    }>(cacheKey);
    if (cached) {
      return { ok: true, payload: cached, cacheKey, cached: true };
    }

    const userId = await this.resolveUserId(usernameLower, logDb);
    if (!userId) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    let accessibleCommunityIds: number[] | null = null;
    if (viewerCanModerate || viewerId === userId) {
      accessibleCommunityIds = null;
    } else {
      const accessStart = performance.now();
      accessibleCommunityIds = await getAccessibleCommunityIds(
        viewer
          ? {
              id: viewer.id,
              role: viewer.role,
              faculty: viewer.faculty ?? null,
              course: viewer.course ?? null,
            }
          : null
      );
      if (logDb) {
        logDb("community.access", performance.now() - accessStart);
      }
    }

    const cursorFilter = buildCursorFilter(cursor);

    const visibilityFilter: {
      deletedAt: null;
      author?: { shadowBannedAt: null };
    } = { deletedAt: null };

    if (!viewerCanModerate && viewerId !== userId) {
      visibilityFilter.author = { shadowBannedAt: null };
    }

    const accessFilter =
      accessibleCommunityIds !== null
        ? {
            OR:
              accessibleCommunityIds.length > 0
                ? [
                    { communityId: null },
                    { communityId: { in: accessibleCommunityIds } },
                  ]
                : [{ communityId: null }],
          }
        : {};

    const replyToFilter =
      kind === "posts" ? { replyToId: null } : { replyToId: { not: null } };

    const countStart = performance.now();
    const countPromise = this.postRepo
      .count({
        where: {
          authorId: userId,
          ...replyToFilter,
          ...visibilityFilter,
          ...accessFilter,
        },
      })
      .then((value) => {
        if (logDb) {
          logDb("post.count", performance.now() - countStart);
        }
        return value;
      });

    const postsStart = performance.now();
    const postsPromise = this.postRepo
      .findMany({
        where: {
          authorId: userId,
          ...replyToFilter,
          ...visibilityFilter,
          ...accessFilter,
          ...cursorFilter,
        },
        orderBy: [
          { createdAt: "desc" as const },
          { id: "desc" as const },
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
            },
          },
          community: { select: { id: true, slug: true, title: true } },
          _count: { select: { likes: true, replies: true } },
        },
      })
      .then((value) => {
        if (logDb) {
          logDb("post.findMany", performance.now() - postsStart);
        }
        return value;
      });

    const [totalCount, posts] = await Promise.all([countPromise, postsPromise]);

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;

    let likedSet = new Set<number>();
    if (viewerId) {
      const likesStart = performance.now();
      const likes = await this.likeRepo.findMany({
        where: { userId: viewerId, postId: { in: sliced.map((p) => p.id) } },
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
      data: sliced.map((post) => ({
        ...post,
        viewerHasLiked: likedSet.has(post.id),
        canViewDeleted: true,
      })),
      nextCursor,
      totalCount,
    };

    await this.cache.set(
      cacheKey,
      payload,
      kind === "posts" ? PROFILE_POSTS_CACHE_TTL_MS : PROFILE_REPLIES_CACHE_TTL_MS
    );

    return { ok: true, payload, cacheKey, cached: false };
  }

  private async resolveUserId(
    usernameLower: string,
    logDb?: (query: string, ms: number) => void
  ) {
    const userIdCacheKey = `user-by-username:${usernameLower}`;
    const cached = await this.cache.get<string>(userIdCacheKey);
    if (cached) {
      return cached;
    }

    const userStart = performance.now();
    const user = await this.userRepo.findUnique({
      where: { usernameLower },
      select: { id: true },
    });
    if (logDb) {
      logDb("user.findUnique", performance.now() - userStart);
    }

    if (!user) {
      return null;
    }

    await this.cache.set(userIdCacheKey, user.id, USER_ID_CACHE_TTL_MS);
    return user.id;
  }
}
