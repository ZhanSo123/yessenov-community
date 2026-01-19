import { type Prisma } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser } from "@/lib/auth";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

const DEFAULT_LIMIT = 20;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const postId = Number(params.id);
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
            username: true,
            name: true,
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
              username: post.author.username,
              name: post.author.name,
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

    const repliesWhere: Prisma.PostWhereInput = { replyToId: post.id };

    if (cursor) {
      repliesWhere.AND = [
        ...(repliesWhere.AND ?? []),
        {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        },
      ];
    }

    if (!viewerCanModerate) {
      if (viewerId) {
        repliesWhere.AND = [
          ...(repliesWhere.AND ?? []),
          {
            OR: [
              { deletedAt: null, author: { shadowBannedAt: null } },
              { authorId: viewerId },
            ],
          },
        ];
      } else {
        repliesWhere.AND = [
          ...(repliesWhere.AND ?? []),
          { deletedAt: null },
          { author: { shadowBannedAt: null } },
        ];
      }
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
            username: true,
            name: true,
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
            username: post.author.username,
            name: post.author.name,
            image: post.author.image,
          },
          canViewDeleted: true,
          viewerHasLiked: likedSet.has(post.id),
        },
        replies: slicedReplies.map((reply) => {
          const isReplyShadowBanned = Boolean(reply.author.shadowBannedAt);
          const canViewReply =
            (!reply.deletedAt && !isReplyShadowBanned) ||
            viewerCanModerate ||
            (viewerId ? reply.authorId === viewerId : false);

          return {
            ...reply,
            author: {
              id: reply.author.id,
              username: reply.author.username,
              name: reply.author.name,
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
