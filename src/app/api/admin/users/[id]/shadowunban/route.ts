import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireRoleApi("MOD");

    if (!rateLimitModeration(request, actor.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    if (target.id === actor.id) {
      return apiError("BAD_REQUEST", 400);
    }

    if (target.role === "ADMIN" && actor.role !== "ADMIN") {
      return apiError("FORBIDDEN", 403);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          shadowBannedAt: null,
          shadowBanReason: null,
        },
        select: {
          id: true,
          shadowBannedAt: true,
          shadowBanReason: true,
          role: true,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_SHADOWUNBAN",
        targetType: "User",
        targetId: user.id,
      });

      return user;
    });

    return apiSuccess({ data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
