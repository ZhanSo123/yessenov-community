import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { AppealCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = AppealCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireUserApi();

    if (!rateLimit(request, user.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    const { targetType, targetId, reason } = parsed.data;

    const existing = await prisma.appeal.findFirst({
      where: {
        userId: user.id,
        targetType,
        targetId,
        status: "OPEN",
      },
      select: { id: true },
    });

    if (existing) {
      return apiError("BAD_REQUEST", 400);
    }

    if (targetType === "POST") {
      const postId = Number(targetId);
      if (Number.isNaN(postId)) {
        return apiError("BAD_REQUEST", 400);
      }
      const postExists = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true },
      });
      if (!postExists) {
        return apiError("NOT_FOUND", 404);
      }
    }

    if (targetType.startsWith("USER")) {
      const userExists = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!userExists) {
        return apiError("NOT_FOUND", 404);
      }
    }

    const appeal = await prisma.$transaction(async (tx) => {
      const created = await tx.appeal.create({
        data: {
          userId: user.id,
          targetType,
          targetId,
          reason,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: user.id } },
        action: "APPEAL_CREATE",
        targetType: "Appeal",
        targetId: created.id,
        metadata: {
          targetType,
          targetId,
        },
      });

      return created;
    });

    return apiSuccess({ data: appeal }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
