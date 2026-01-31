import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { withApiMetrics } from "@/lib/api-metrics";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser } from "@/lib/auth";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getAccessibleCommunityIds } from "@/lib/community-access";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;
const FEED_CACHE_TTL_MS = 30 * 1000;
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

const handler = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursor(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;
    const viewerCanModerate = viewer ? canModerate(viewer) : false;

    let closedCommunityIds: number[] = [];

    if (viewerCanModerate) {
      const allClosed = await prisma.community.findMany({
        where: {
          OR: [{ type: { not: "OPEN" } }, { isPrivate: true }],
        },
        select: { id: true },
      });
      closedCommunityIds = allClosed.map((item) => item.id);
    } else {
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

      if (accessibleIds) {
        const closed = await prisma.community.findMany({
          where: {
            id: { in: accessibleIds },
            OR: [{ type: { not: "OPEN" } }, { isPrivate: true }],
          },
          select: { id: true },
        });
        closedCommunityIds = closed.map((item) => item.id);
      }
    }

    if (closedCommunityIds.length === 0) {
      return apiSuccess({ data: [], nextCursor: null });
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
          {
            createdAt: cursor.createdAt,
            id: { lt: cursor.id },
          },
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

    const cacheKey = `community-feed:${viewerId ?? "guest"}:${viewerCanModerate ? "mod" : "user"}:${limit}:${cursor?.createdAt ?? "none"}:${cursor?.id ?? "none"}`;
    const cached = await cacheGet<{ posts: FeedPost[]; nextCursor: string | null }>(
      cacheKey
    );

    let posts: FeedPost[] = [];
    let cachedNextCursor: string | null = null;

    if (cached) {
      posts = cached.posts;
      cachedNextCursor = cached.nextCursor;
    } else {
      const fetched = await prisma.post.findMany({
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
      cachedNextCursor = hasMore
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

      posts = mapped;
      await cacheSet(
        cacheKey,
        { posts: mapped, nextCursor: cachedNextCursor },
        FEED_CACHE_TTL_MS
      );
    }

    return apiSuccess({
      data: posts,
      nextCursor: cachedNextCursor,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
};

export const GET = withApiMetrics(handler);
