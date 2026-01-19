import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";
import { AdminPostDeleteSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;
    const actor = await requireUserApi();

    if (!rateLimitModeration(request, actor.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    const postId = Number(id);
    if (Number.isNaN(postId)) {
      return apiError("BAD_REQUEST", 400);
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = AdminPostDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    if (!parsed.data.reason) {
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
          deletedAt: new Date(),
          deletedById: actor.id,
          deleteReason: parsed.data.reason ?? null,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "POST_DELETE",
        targetType: "Post",
        targetId: String(postId),
        metadata: { reason: parsed.data.reason ?? null },
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
