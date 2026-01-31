import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { withApiMetrics } from "@/lib/api-metrics";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser, requireUserApi } from "@/lib/auth";
import { cacheGet, cacheSet } from "@/lib/cache";
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
    const mode = searchParams.get("mode") ?? "for-you";
    const interest = searchParams.get("interest")?.trim() ?? "";
    const interestTerms = interest
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    if (mode !== "for-you" && mode !== "following") {
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
    const baseWhere: Prisma.PostWhereInput = {
      replyToId: null,
      deletedAt: null,
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

    andFilters.push({
      OR: [
        { communityId: null },
        { community: { type: "OPEN", isPrivate: false } },
      ],
    });

    if (andFilters.length > 0) {
      baseWhere.AND = andFilters;
    }

    if (interestTerms.length > 0) {
      const interestOr = interestTerms.flatMap((term) => [
        { content: { contains: term, mode: "insensitive" as const } },
        { community: { title: { contains: term, mode: "insensitive" as const } } },
        { community: { slug: { contains: term, mode: "insensitive" as const } } },
        {
          community: {
            description: { contains: term, mode: "insensitive" as const },
          },
        },
      ]);
      const interestFilter: Prisma.PostWhereInput = {
        OR: interestOr,
      };
      baseWhere.AND = baseWhere.AND
        ? [...(baseWhere.AND as Prisma.PostWhereInput[]), interestFilter]
        : [interestFilter];
    }

    const postSelect: Prisma.PostSelect = {
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
    };

    const baseQuery = {
      where: baseWhere,
      orderBy: [
        { createdAt: "desc" as const },
        { id: "desc" as const },
      ],
      take: limit + 1,
      select: postSelect,
    };

    const cacheKey = `feed:${mode}:${viewerId ?? "guest"}:${viewerCanModerate ? "mod" : "user"}:${limit}:${cursor?.createdAt ?? "none"}:${cursor?.id ?? "none"}:${interest || "all"}`;

    if (mode === "following") {
      const cached = await cacheGet<{ posts: FeedPost[]; nextCursor: string | null }>(
        cacheKey
      );

      let posts: FeedPost[] = [];
      let cachedNextCursor: string | null = null;

      if (cached) {
        posts = cached.posts;
        cachedNextCursor = cached.nextCursor;
      } else {
        const user = await requireUserApi();
        const followingWhere: Prisma.PostWhereInput = {
          ...baseWhere,
          author: { followers: { some: { followerId: user.id } } },
        };

        const fetched = await prisma.post.findMany({
          ...baseQuery,
          where: followingWhere,
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
    }

    const cached = await cacheGet<{ posts: FeedPost[]; nextCursor: string | null }>(
      cacheKey
    );

    let posts: FeedPost[] = [];
    let cachedNextCursor: string | null = null;

    if (cached) {
      posts = cached.posts;
      cachedNextCursor = cached.nextCursor;
    } else {
      const fetched = await prisma.post.findMany(baseQuery);
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

    try {
      const url = new URL(request.url);
      console.error("api/feed error", {
        mode: url.searchParams.get("mode"),
        cursor: url.searchParams.get("cursor"),
        limit: url.searchParams.get("limit"),
        message: error instanceof Error ? error.message : String(error),
      });
    } catch {
      console.error("api/feed error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return apiError("INTERNAL_ERROR", 500);
  }
};

export const GET = withApiMetrics(handler);
