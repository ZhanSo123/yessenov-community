import { type Prisma } from "@prisma/client";

import { buildCursor } from "@/lib/pagination";
import { canModerate, type Role } from "@/lib/auth";
import { getAccessibleCommunityIds } from "@/lib/community-access";
import { getInfrastructure } from "@/infrastructure";
import { CommunityRepository } from "@/repositories/community-repository";
import { PostRepository } from "@/repositories/post-repository";

export type CommunityFeedViewer = {
  id: string;
  role: Role;
  faculty?: string | null;
  course?: number | null;
};

type FeedPost = {
  id: number;
  content: string;
  createdAt: Date;
  replyToId: number | null;
  deletedAt: Date | null;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    image: string | null;
  };
  _count: { likes: number; replies: number };
  viewerHasLiked: boolean;
  canViewDeleted: boolean;
};

export type CommunityFeedResult = {
  payload: { data: FeedPost[]; nextCursor: string | null };
  cacheKey: string;
  cached: boolean;
};

const FEED_CACHE_TTL_MS = 30 * 1000;

export class CommunityFeedService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly communityRepo = new CommunityRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async getFeed(params: {
    viewer: CommunityFeedViewer | null;
    limit: number;
    cursor: { createdAt: Date; id: number } | null;
  }): Promise<CommunityFeedResult> {
    const { viewer, limit, cursor } = params;
    const viewerId = viewer?.id ?? null;
    const viewerRole = viewer?.role ?? "ANON";
    const viewerCanModerate = viewer ? canModerate(viewer) : false;

    const cacheKey = `community-feed:${viewerId ?? "anon"}:${viewerRole}:${viewer?.faculty ?? "none"}:${viewer?.course ?? "none"}:${limit}:${cursor?.createdAt?.toISOString() ?? "none"}:${cursor?.id ?? "none"}`;
    const cached = await this.cache.get<{
      posts: FeedPost[];
      nextCursor: string | null;
    }>(cacheKey);

    if (cached) {
      return {
        payload: { data: cached.posts, nextCursor: cached.nextCursor },
        cacheKey,
        cached: true,
      };
    }

    const closedCommunityIds = await this.resolveClosedCommunityIds(
      viewer,
      viewerCanModerate
    );

    if (closedCommunityIds.length === 0) {
      const emptyPayload = { data: [], nextCursor: null };
      await this.cache.set(cacheKey, { posts: [], nextCursor: null }, FEED_CACHE_TTL_MS);
      return { payload: emptyPayload, cacheKey, cached: false };
    }

    const baseWhere: Prisma.PostWhereInput = {
      replyToId: null,
      deletedAt: null,
      communityId: { in: closedCommunityIds },
    };
    const andFilters: Prisma.PostWhereInput[] = [];

    if (cursor) {
      andFilters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    if (!viewerCanModerate) {
      if (viewerId) {
        andFilters.push({
          OR: [
            { author: { shadowBannedAt: null } },
            { authorId: viewerId },
          ],
        });
      } else {
        baseWhere.author = { shadowBannedAt: null };
      }
    }

    if (andFilters.length > 0) {
      baseWhere.AND = andFilters;
    }

    const fetched = await this.postRepo.findMany({
      where: baseWhere,
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
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
        _count: { select: { likes: true, replies: true } },
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { id: true },
              },
            }
          : {}),
      },
    });

    const hasMore = fetched.length > limit;
    const sliced = hasMore ? fetched.slice(0, limit) : fetched;
    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    const mapped = sliced.map((post) => {
      const { likes, ...rest } = post as typeof post & {
        likes?: Array<{ id: number }>;
      };
      return {
        ...rest,
        viewerHasLiked: Boolean(likes && likes.length > 0),
        canViewDeleted: true,
      } as FeedPost;
    });

    await this.cache.set(
      cacheKey,
      { posts: mapped, nextCursor },
      FEED_CACHE_TTL_MS
    );

    return {
      payload: { data: mapped, nextCursor },
      cacheKey,
      cached: false,
    };
  }

  private async resolveClosedCommunityIds(
    viewer: CommunityFeedViewer | null,
    viewerCanModerate: boolean
  ) {
    if (viewerCanModerate) {
      const allClosed = await this.communityRepo.findMany({
        where: {
          OR: [{ type: { not: "OPEN" } }, { isPrivate: true }],
        },
        select: { id: true },
      });
      return allClosed.map((item) => item.id);
    }

    const accessibleIds = await getAccessibleCommunityIds(
      viewer
        ? {
            id: viewer.id,
            role: viewer.role,
            faculty: viewer.faculty ?? null,
            course: viewer.course ?? null,
          }
        : null
    );

    if (!accessibleIds || accessibleIds.length === 0) {
      return [];
    }

    const closed = await this.communityRepo.findMany({
      where: {
        id: { in: accessibleIds },
        OR: [{ type: { not: "OPEN" } }, { isPrivate: true }],
      },
      select: { id: true },
    });
    return closed.map((item) => item.id);
  }
}
