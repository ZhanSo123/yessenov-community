import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";
import { UserBanSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;
    const actor = await requireRoleApi("MOD");

    if (!rateLimitModeration(request, actor.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = UserBanSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    if (!parsed.data.reason) {
      return apiError("BAD_REQUEST", 400);
    }

    const target = await prisma.user.findUnique({
      where: { id },
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

    const days = parsed.data.days ?? 7;
    const bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          bannedUntil,
          banReason: parsed.data.reason ?? null,
        },
        select: {
          id: true,
          bannedUntil: true,
          banReason: true,
          role: true,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_BAN",
        targetType: "User",
        targetId: user.id,
        metadata: {
          days,
          reason: parsed.data.reason ?? null,
        },
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
