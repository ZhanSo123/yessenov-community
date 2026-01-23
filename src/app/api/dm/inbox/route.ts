import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { withApiMetrics } from "@/lib/api-metrics";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

type InboxCursor = {
  lastMessageAt: Date | null;
  id: string;
};

type LastMessageRow = {
  id: string;
  content: string;
  createdAt: Date;
  senderId: string;
};

const parseInboxCursor = (value: string | null | undefined): InboxCursor | null => {
  if (!value) {
    return null;
  }

  const [timePart, idPart] = value.split("|");
  if (!timePart || !idPart) {
    return null;
  }

  if (timePart === "null") {
    return { lastMessageAt: null, id: idPart };
  }

  const date = new Date(timePart);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return { lastMessageAt: date, id: idPart };
};

const buildInboxCursor = (value: Date | null, id: string) =>
  `${value ? value.toISOString() : "null"}|${id}`;

const handler = async (request: NextRequest) => {
  try {
    const me = await requireUserApi();
    const { searchParams } = new URL(request.url);

    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseInboxCursor(pagination.data.cursor);
    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const where: Prisma.ConversationParticipantWhereInput = { userId: me.id };

    if (cursor) {
      if (cursor.lastMessageAt === null) {
        where.conversation = {
          lastMessageAt: null,
          id: { lt: cursor.id },
        };
      } else {
        where.conversation = {
          OR: [
            { lastMessageAt: { lt: cursor.lastMessageAt } },
            { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } },
            { lastMessageAt: null },
          ],
        };
      }
    }

    const records = await prisma.conversationParticipant.findMany({
      where,
      orderBy: [
        { conversation: { lastMessageAt: "desc" } },
        { conversationId: "desc" },
      ],
      take: limit + 1,
      select: {
        conversationId: true,
        lastReadAt: true,
        conversation: {
          select: {
            id: true,
            lastMessageAt: true,
            lastMessageId: true,
            participants: {
              where: { userId: { not: me.id } },
              select: {
                user: {
                  select: {
                    username: true,
                    displayName: true,
                    image: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const hasMore = records.length > limit;
    const sliced = hasMore ? records.slice(0, limit) : records;
    const nextCursor = hasMore
      ? buildInboxCursor(
          sliced[sliced.length - 1].conversation.lastMessageAt,
          sliced[sliced.length - 1].conversationId
        )
      : null;

    const lastMessageIds = sliced
      .map((item) => item.conversation.lastMessageId)
      .filter((id): id is string => Boolean(id));

    const lastMessages = lastMessageIds.length
      ? await prisma.message.findMany({
          where: { id: { in: lastMessageIds }, deletedAt: null },
          select: { id: true, content: true, createdAt: true, senderId: true },
        })
      : [];

    const lastMessageMap = new Map(
      lastMessages.map((message) => [message.id, message])
    );

    const conversationIds = sliced.map((item) => item.conversationId);
    const unreadRows =
      conversationIds.length > 0
        ? await prisma.$queryRaw<
            { conversationId: string; count: number }[]
          >(Prisma.sql`
            SELECT
              m."conversationId" AS "conversationId",
              COUNT(*)::int AS "count"
            FROM "Message" m
            JOIN "ConversationParticipant" cp
              ON cp."conversationId" = m."conversationId"
            WHERE cp."userId" = ${me.id}
              AND m."conversationId" IN (${Prisma.join(conversationIds)})
              AND m."senderId" <> ${me.id}
              AND m."deletedAt" IS NULL
              AND m."createdAt" > cp."lastReadAt"
            GROUP BY m."conversationId"
          `)
        : [];

    const unreadMap = new Map(
      unreadRows.map((row) => [row.conversationId, row.count])
    );

    return apiSuccess({
      data: sliced.map((item) => {
        const participant = item.conversation.participants[0]?.user ?? null;
        const lastMessage =
          item.conversation.lastMessageId &&
          lastMessageMap.get(item.conversation.lastMessageId);

        return {
          id: item.conversationId,
          participant: participant
            ? {
                username: participant.username,
                displayName: participant.displayName,
                image: participant.image,
              }
            : null,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: lastMessage.content,
                createdAt: lastMessage.createdAt,
                senderId: lastMessage.senderId,
              }
            : null,
          lastMessageAt: item.conversation.lastMessageAt,
          unreadCount: unreadMap.get(item.conversationId) ?? 0,
        };
      }),
      nextCursor,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
};

export const GET = withApiMetrics(handler);
