import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateUsername, DmStartSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let actorId: string | null = null;
  let targetUserId: string | null = null;
  let targetUsernameLower: string | null = null;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400, { message: "INVALID_INPUT" });
    }

    const parsed = DmStartSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, { message: "INVALID_INPUT" });
    }

    const usernameResult = validateUsername(parsed.data.username);
    if (!usernameResult.ok) {
      return apiError("BAD_REQUEST", 400, { message: "INVALID_INPUT" });
    }
    targetUsernameLower = usernameResult.usernameLower;

    const me = await requireUserApi();
    actorId = me.id;
    const target = await prisma.user.findUnique({
      where: { usernameLower: usernameResult.usernameLower },
      select: { id: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404, { message: "USER_NOT_FOUND" });
    }

    targetUserId = target.id;

    if (target.id === me.id) {
      return apiError("BAD_REQUEST", 400, { message: "CANNOT_MESSAGE_SELF" });
    }

    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: me.id } } },
          { participants: { some: { userId: target.id } } },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return apiSuccess({ data: { conversationId: existing.id } });
    }

    const created = await prisma.$transaction(async (tx) => {
      const again = await tx.conversation.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: me.id } } },
            { participants: { some: { userId: target.id } } },
          ],
        },
        select: { id: true },
      });

      if (again) {
        return again;
      }

      return tx.conversation.create({
        data: {
          participants: {
            create: [{ userId: me.id }, { userId: target.id }],
          },
        },
        select: { id: true },
      });
    });

    return apiSuccess({ data: { conversationId: created.id } });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("dm.start.failed", {
      requestId,
      userId: actorId,
      targetUserId,
      targetUsernameLower,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : { message: String(error) },
    });

    return apiError("INTERNAL_ERROR", 500);
  }
}
