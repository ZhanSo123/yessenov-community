import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser } from "@/lib/auth";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 10;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;
    const trimmed = username.trim();
    if (!trimmed) {
      return apiError("BAD_REQUEST", 400);
    }
    const usernameLower = trimmed.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { usernameLower },
      select: { id: true },
    });

    if (!user) {
      return apiError("NOT_FOUND", 404);
    }

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

    const cursorFilter = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const visibilityFilter: {
      deletedAt: null;
      author?: { shadowBannedAt: null };
    } = { deletedAt: null };

    if (!viewerCanModerate && viewerId !== user.id) {
      visibilityFilter.author = { shadowBannedAt: null };
    }

    const [totalCount, posts] = await Promise.all([
      prisma.post.count({
        where: {
          authorId: user.id,
          replyToId: null,
          ...visibilityFilter,
        },
      }),
      prisma.post.findMany({
        where: {
          authorId: user.id,
          replyToId: null,
          ...visibilityFilter,
          ...cursorFilter,
        },
        orderBy: [
          { createdAt: "desc" as const },
          { id: "desc" as const },
        ],
        take: limit + 1,
        include: {
          author: {
            select: {
              id: true,
              email: true,
              username: true,
              name: true,
              displayName: true,
              image: true,
            },
          },
          community: { select: { id: true, slug: true, title: true } },
          _count: { select: { likes: true, replies: true } },
        },
      }),
    ]);

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;

    const likedSet = viewerId
      ? new Set(
          (
            await prisma.like.findMany({
              where: { userId: viewerId, postId: { in: sliced.map((p) => p.id) } },
              select: { postId: true },
            })
          ).map((like) => like.postId)
        )
      : new Set<number>();

    const nextCursor = hasMore
      ? buildCursor(sliced[sliced.length - 1].createdAt, sliced[sliced.length - 1].id)
      : null;

    return apiSuccess({
      data: sliced.map((post) => ({
        ...post,
        viewerHasLiked: likedSet.has(post.id),
        canViewDeleted: true,
      })),
      nextCursor,
      totalCount,
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
