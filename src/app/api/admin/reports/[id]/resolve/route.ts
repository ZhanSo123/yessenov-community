import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";
import { ReportResolveSchema } from "@/lib/validators";

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = ReportResolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const { status, note } = parsed.data;
    const action = status === "REJECTED" ? "REPORT_REJECT" : "REPORT_RESOLVE";

    const target = await prisma.report.findUnique({
      where: { id },
      select: {
        id: true,
        post: { select: { communityId: true } },
      },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    if (!canModerate(actor)) {
      const communityId = target.post.communityId;
      if (!communityId) {
        return apiError("FORBIDDEN", 403);
      }

      const role = await getCommunityModeratorRole(communityId, actor.id);
      if (!role) {
        return apiError("FORBIDDEN", 403);
      }
    }

    const report = await prisma.$transaction(async (tx) => {
      const updated = await tx.report.update({
        where: { id },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedById: actor.id,
          resolutionNote: note ?? null,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action,
        targetType: "Report",
        targetId: updated.id,
        metadata: { status, note: note ?? null },
      });

      return updated;
    });

    return apiSuccess({ data: report });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
