import {
  REPORT_AUTO_HIDE_THRESHOLD,
  REPORT_SEVERITY_AUTO_HIDE,
  REPORT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, ensureNotBanned, requireUserApi } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { ReportCreateSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = ReportCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireUserApi();
    ensureNotBanned(user);

    if (!rateLimit(request, user.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    const post = await prisma.post.findUnique({
      where: { id: parsed.data.postId },
      select: {
        id: true,
        deletedAt: true,
        authorId: true,
        author: { select: { shadowBannedAt: true } },
      },
    });

    if (!post || post.deletedAt) {
      return apiError("NOT_FOUND", 404);
    }

    if (
      post.author.shadowBannedAt &&
      !canModerate(user) &&
      post.authorId !== user.id
    ) {
      return apiError("NOT_FOUND", 404);
    }

    try {
      const report = await prisma.report.create({
        data: {
          postId: parsed.data.postId,
          reporterId: user.id,
          reason: parsed.data.reason,
          category: parsed.data.category ?? null,
          severity: parsed.data.severity ?? null,
        },
      });

      const severity = parsed.data.severity ?? 1;
      const reportWindowStart = new Date(Date.now() - REPORT_WINDOW_MS);
      const recentCount = await prisma.report.count({
        where: {
          postId: parsed.data.postId,
          createdAt: { gte: reportWindowStart },
        },
      });

      const shouldAutoHide =
        severity >= REPORT_SEVERITY_AUTO_HIDE ||
        recentCount >= REPORT_AUTO_HIDE_THRESHOLD;

      if (shouldAutoHide) {
        const reason = "Auto-hide: report threshold";
        const now = new Date();

        await prisma.$transaction(async (tx) => {
          const updated = await tx.post.updateMany({
            where: { id: parsed.data.postId, deletedAt: null },
            data: {
              deletedAt: now,
              deleteReason: reason,
              deletedById: null,
            },
          });

          if (updated.count > 0) {
            await tx.moderationAction.create({
              data: {
                source: "AUTO",
                action: "POST_HIDE",
                actorId: user.id,
                targetType: "Post",
                targetId: String(parsed.data.postId),
                reason,
                metadata: {
                  reportCount: recentCount,
                  severity,
                },
              },
            });

            await createAuditLog(tx, request, {
              actor: { connect: { id: user.id } },
              action: "POST_AUTO_HIDE",
              targetType: "Post",
              targetId: String(parsed.data.postId),
              metadata: {
                reason,
                reportCount: recentCount,
                severity,
              },
            });
          }
        });
      }

      return apiSuccess({ data: report }, { status: 201 });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return apiError("BAD_REQUEST", 400);
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
