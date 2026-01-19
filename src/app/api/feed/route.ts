import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser, requireUserApi } from "@/lib/auth";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

const DEFAULT_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") ?? "for-you";
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

    if (andFilters.length > 0) {
      baseWhere.AND = andFilters;
    }

    const baseQuery = {
      where: baseWhere,
      orderBy: [
        { createdAt: "desc" as const },
        { id: "desc" as const },
      ],
      take: limit + 1,
      include: {
        author: { select: { id: true, username: true, name: true, image: true } },
        _count: { select: { likes: true, replies: true } },
      },
    };

    if (mode === "following") {
      const user = await requireUserApi();
      const following = await prisma.follow.findMany({
        where: { followerId: user.id },
        select: { followingId: true },
      });
      const followingIds = following.map((item) => item.followingId);

      if (followingIds.length === 0) {
        return apiSuccess({ data: [], nextCursor: null });
      }

      const followingWhere: Prisma.PostWhereInput = {
        ...baseWhere,
        authorId: { in: followingIds },
      };

      const posts = await prisma.post.findMany({
        ...baseQuery,
        where: followingWhere,
      });

      const hasMore = posts.length > limit;
      const sliced = hasMore ? posts.slice(0, limit) : posts;
      const likedSet = viewerId
        ? new Set(
            (
              await prisma.like.findMany({
                where: {
                  userId: viewerId,
                  postId: { in: sliced.map((post) => post.id) },
                },
                select: { postId: true },
              })
            ).map((like) => like.postId)
          )
        : new Set<number>();

      const nextCursor = hasMore
        ? buildCursor(
            sliced[sliced.length - 1].createdAt,
            sliced[sliced.length - 1].id
          )
        : null;

      return apiSuccess({
        data: sliced.map((post) => ({
          ...post,
          viewerHasLiked: likedSet.has(post.id),
          canViewDeleted: true,
        })),
        nextCursor,
      });
    }

    const posts = await prisma.post.findMany(baseQuery);
    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const likedSet = viewerId
      ? new Set(
          (
            await prisma.like.findMany({
              where: {
                userId: viewerId,
                postId: { in: sliced.map((post) => post.id) },
              },
              select: { postId: true },
            })
          ).map((like) => like.postId)
        )
      : new Set<number>();

    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return apiSuccess({
      data: sliced.map((post) => ({
        ...post,
        viewerHasLiked: likedSet.has(post.id),
        canViewDeleted: true,
      })),
      nextCursor,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
