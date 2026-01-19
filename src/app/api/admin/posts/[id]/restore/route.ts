import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await requireUserApi();

    if (!rateLimitModeration(_request, actor.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    const postId = Number(id);
    if (Number.isNaN(postId)) {
      return apiError("BAD_REQUEST", 400);
    }

    const target = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, communityId: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    if (!canModerate(actor)) {
      if (!target.communityId) {
        return apiError("FORBIDDEN", 403);
      }

      const role = await getCommunityModeratorRole(target.communityId, actor.id);
      if (!role) {
        return apiError("FORBIDDEN", 403);
      }
    }

    const post = await prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({
        where: { id: postId },
        data: {
          deletedAt: null,
          deletedById: null,
          deleteReason: null,
        },
      });

      await createAuditLog(tx, _request, {
        actor: { connect: { id: actor.id } },
        action: "POST_RESTORE",
        targetType: "Post",
        targetId: String(postId),
      });

      return updated;
    });

    return apiSuccess({ data: post });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
