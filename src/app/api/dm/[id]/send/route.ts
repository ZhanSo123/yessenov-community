import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DmSendSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUserApi();
    const { id } = await context.params;
    if (!id) {
      return apiError("BAD_REQUEST", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = DmSendSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!conversation) {
      return apiError("NOT_FOUND", 404);
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: me.id,
        },
      },
      select: { userId: true },
    });

    if (!participant) {
      return apiError("FORBIDDEN", 403);
    }

    const created = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: me.id,
        content: parsed.data.content.trim(),
      },
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

    await prisma.$transaction([
      prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: created.createdAt,
          lastMessageId: created.id,
        },
      }),
      prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: id,
            userId: me.id,
          },
        },
        data: { lastReadAt: created.createdAt },
      }),
    ]);

    return apiSuccess({ data: created });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
