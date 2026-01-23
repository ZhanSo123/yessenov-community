import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { buildCursorString, parseCursorString } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUserApi();
    const { id } = await context.params;
    if (!id) {
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
    const cursor = parseCursorString(pagination.data.cursor);
    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        participants: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return apiError("NOT_FOUND", 404);
    }

    const isParticipant = conversation.participants.some(
      (participant) => participant.userId === me.id
    );
    if (!isParticipant) {
      return apiError("FORBIDDEN", 403);
    }

    const messageWhere = cursor
      ? {
          conversationId: id,
          deletedAt: null,
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : { conversationId: id, deletedAt: null };

    const messages = await prisma.message.findMany({
      where: messageWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        content: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const sliced = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return apiSuccess({
      data: {
        conversation: {
          id: conversation.id,
          participants: conversation.participants.map((participant) => ({
            id: participant.user.id,
            username: participant.user.username,
            displayName: participant.user.displayName,
            image: participant.user.image,
          })),
        },
        messages: sliced.map((message) => ({
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
          sender: message.sender,
        })),
      },
      nextCursor,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
