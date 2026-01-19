import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";
import { UserRoleSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireRoleApi("ADMIN");

    if (!rateLimitModeration(request, actor.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    if (actor.id === params.id) {
      return apiError("BAD_REQUEST", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = UserRoleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { role: parsed.data.role },
        select: { id: true, role: true },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_ROLE_CHANGE",
        targetType: "User",
        targetId: user.id,
        metadata: { from: target.role, to: parsed.data.role },
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
