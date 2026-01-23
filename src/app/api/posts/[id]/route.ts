import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser, requireUserApi } from "@/lib/auth";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const postId = Number(id);
    if (Number.isNaN(postId)) {
      return apiError("BAD_REQUEST", 400);
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

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            displayName: true,
            image: true,
            shadowBannedAt: true,
          },
        },
        _count: { select: { likes: true, replies: true } },
      },
    });

    if (!post) {
      return apiError("NOT_FOUND", 404);
    }

    if (post.deletedAt && !viewerCanModerate && viewerId !== post.authorId) {
      return apiError("NOT_FOUND", 404);
    }

    const canViewDeleted =
      !post.deletedAt || viewerCanModerate || viewerId === post.authorId;
    const isShadowBanned =
      Boolean(post.author.shadowBannedAt) &&
      !viewerCanModerate &&
      viewerId !== post.authorId;

    if (!canViewDeleted || isShadowBanned) {
      return apiSuccess({
        data: {
          post: {
            ...post,
            author: {
              id: post.author.id,
              email: post.author.email,
              username: post.author.username,
              name: post.author.name,
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
      });
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

    const replies = await prisma.post.findMany({
      where: repliesWhere,
      orderBy: [
        { createdAt: "asc" as const },
        { id: "asc" as const },
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
            shadowBannedAt: true,
          },
        },
        _count: { select: { likes: true, replies: true } },
      },
    });

    const hasMore = replies.length > limit;
    const slicedReplies = hasMore ? replies.slice(0, limit) : replies;

    const likedSet = viewerId
      ? new Set(
          (
            await prisma.like.findMany({
              where: {
                userId: viewerId,
                postId: {
                  in: [post.id, ...slicedReplies.map((reply) => reply.id)],
                },
              },
              select: { postId: true },
            })
          ).map((like) => like.postId)
        )
      : new Set<number>();

    const nextCursor = hasMore
      ? buildCursor(
          slicedReplies[slicedReplies.length - 1].createdAt,
          slicedReplies[slicedReplies.length - 1].id
        )
      : null;

    return apiSuccess({
      data: {
        post: {
          ...post,
          author: {
            id: post.author.id,
            email: post.author.email,
            username: post.author.username,
            name: post.author.name,
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
              email: reply.author.email,
              username: reply.author.username,
              name: reply.author.name,
              displayName: reply.author.displayName,
              image: reply.author.image,
            },
            canViewDeleted: canViewReply,
            viewerHasLiked: likedSet.has(reply.id),
          };
        }),
        nextCursor,
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const postId = Number(id);
    if (Number.isNaN(postId)) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireUserApi();

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, deletedAt: true },
    });

    if (!post) {
      return apiError("NOT_FOUND", 404);
    }

    if (post.authorId !== user.id) {
      return apiError("FORBIDDEN", 403);
    }

    if (!post.deletedAt) {
      await prisma.post.update({
        where: { id: postId },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
        },
      });
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
