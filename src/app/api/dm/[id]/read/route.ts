import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUserApi();
    const { id } = await context.params;
    if (!id) {
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

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: me.id,
        },
      },
      data: { lastReadAt: new Date() },
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
