import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";
import { AppealResolveSchema } from "@/lib/validators";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = await requireUserApi();

    if (!rateLimitModeration(request, actor.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = AppealResolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const appeal = await prisma.appeal.findUnique({
      where: { id },
      select: { id: true, targetType: true, targetId: true },
    });

    if (!appeal) {
      return apiError("NOT_FOUND", 404);
    }

    if (!canModerate(actor)) {
      if (appeal.targetType !== "POST") {
        return apiError("FORBIDDEN", 403);
      }

      const postId = Number(appeal.targetId);
      if (Number.isNaN(postId)) {
        return apiError("BAD_REQUEST", 400);
      }

      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { communityId: true },
      });

      if (!post?.communityId) {
        return apiError("FORBIDDEN", 403);
      }

      const role = await getCommunityModeratorRole(post.communityId, actor.id);
      if (!role) {
        return apiError("FORBIDDEN", 403);
      }
    }

    const { status, note } = parsed.data;
    const resolutionAction =
      status === "APPROVED" ? "APPEAL_APPROVE" : "APPEAL_DENY";

    const updated = await prisma.$transaction(async (tx) => {
      const resolved = await tx.appeal.update({
        where: { id },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedById: actor.id,
          resolutionNote: note ?? null,
        },
      });

      if (status === "APPROVED") {
        if (appeal.targetType === "POST") {
          const postId = Number(appeal.targetId);
          if (!Number.isNaN(postId)) {
            await tx.post.update({
              where: { id: postId },
              data: {
                deletedAt: null,
                deletedById: null,
                deleteReason: null,
              },
            });
          }
        }

        if (appeal.targetType.startsWith("USER")) {
          await tx.user.update({
            where: { id: appeal.targetId },
            data: {
              bannedUntil: null,
              banReason: null,
              shadowBannedAt: null,
              shadowBanReason: null,
            },
          });
        }
      }

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: resolutionAction,
        targetType: "Appeal",
        targetId: resolved.id,
        metadata: {
          status,
          note: note ?? null,
          targetType: appeal.targetType,
          targetId: appeal.targetId,
        },
      });

      return resolved;
    });

    return apiSuccess({ data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
