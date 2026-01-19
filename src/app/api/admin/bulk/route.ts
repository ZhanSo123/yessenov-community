import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityScope, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitModeration } from "@/lib/rate-limit";
import { BulkActionSchema } from "@/lib/validators";

const MAX_BULK = 50;

export async function POST(request: Request) {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return apiError("FORBIDDEN", 403);
    }

    if (!rateLimitModeration(request, actor.id)) {
      return apiError("RATE_LIMIT", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = BulkActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const { action, ids, reason, days, note } = parsed.data;

    if (ids.length === 0 || ids.length > MAX_BULK) {
      return apiError("BAD_REQUEST", 400);
    }

    const destructiveActions = new Set(["POST_DELETE", "USER_BAN"]);
    if (destructiveActions.has(action) && !reason) {
      return apiError("BAD_REQUEST", 400);
    }

    if (!canModerate(actor) && (action === "USER_BAN" || action === "USER_UNBAN")) {
      return apiError("FORBIDDEN", 403);
    }

    const postActions = new Set(["POST_DELETE", "POST_RESTORE"]);
    const reportActions = new Set(["REPORT_RESOLVE", "REPORT_REJECT"]);

    const postIds = ids.filter((id): id is number => typeof id === "number");
    const reportIds = ids.filter((id): id is string => typeof id === "string");

    const postMap = new Map<number, { communityId: number | null }>();
    const reportMap = new Map<string, { communityId: number | null }>();

    if (postActions.has(action) && postIds.length) {
      const posts = await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, communityId: true },
      });
      posts.forEach((post) => postMap.set(post.id, { communityId: post.communityId }));
    }

    if (reportActions.has(action) && reportIds.length) {
      const reports = await prisma.report.findMany({
        where: { id: { in: reportIds } },
        select: { id: true, post: { select: { communityId: true } } },
      });
      reports.forEach((report) =>
        reportMap.set(report.id, { communityId: report.post.communityId })
      );
    }

    const errors: Array<{ id: string | number; error: string }> = [];
    let okCount = 0;

    for (const id of ids) {
      try {
        if (action === "POST_DELETE") {
          if (typeof id !== "number") {
            throw new Error("INVALID_ID");
          }

          const target = postMap.get(id);
          if (!target) {
            throw new Error("NOT_FOUND");
          }

          if (communityIds) {
            if (!target.communityId || !communityIds.includes(target.communityId)) {
              throw new Error("FORBIDDEN");
            }
          }

          await prisma.$transaction(async (tx) => {
            await tx.post.update({
              where: { id },
              data: {
                deletedAt: new Date(),
                deletedById: actor.id,
                deleteReason: reason ?? null,
              },
            });

            await createAuditLog(tx, request, {
              actor: { connect: { id: actor.id } },
              action: "POST_DELETE",
              targetType: "Post",
              targetId: String(id),
              metadata: { reason: reason ?? null, bulk: true },
            });
          });
        } else if (action === "POST_RESTORE") {
          if (typeof id !== "number") {
            throw new Error("INVALID_ID");
          }

          const target = postMap.get(id);
          if (!target) {
            throw new Error("NOT_FOUND");
          }

          if (communityIds) {
            if (!target.communityId || !communityIds.includes(target.communityId)) {
              throw new Error("FORBIDDEN");
            }
          }

          await prisma.$transaction(async (tx) => {
            await tx.post.update({
              where: { id },
              data: {
                deletedAt: null,
                deletedById: null,
                deleteReason: null,
              },
            });

            await createAuditLog(tx, request, {
              actor: { connect: { id: actor.id } },
              action: "POST_RESTORE",
              targetType: "Post",
              targetId: String(id),
              metadata: { bulk: true },
            });
          });
        } else if (action === "USER_BAN") {
          if (typeof id !== "string") {
            throw new Error("INVALID_ID");
          }

          const target = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true },
          });

          if (!target) {
            throw new Error("NOT_FOUND");
          }

          if (target.id === actor.id) {
            throw new Error("SELF");
          }

          if (target.role === "ADMIN" && actor.role !== "ADMIN") {
            throw new Error("FORBIDDEN");
          }

          const banDays = days ?? 7;
          const bannedUntil = new Date(Date.now() + banDays * 86400000);

          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id },
              data: {
                bannedUntil,
                banReason: reason ?? null,
              },
            });

            await createAuditLog(tx, request, {
              actor: { connect: { id: actor.id } },
              action: "USER_BAN",
              targetType: "User",
              targetId: id,
              metadata: { days: banDays, reason: reason ?? null, bulk: true },
            });
          });
        } else if (action === "USER_UNBAN") {
          if (typeof id !== "string") {
            throw new Error("INVALID_ID");
          }

          const target = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true },
          });

          if (!target) {
            throw new Error("NOT_FOUND");
          }

          if (target.id === actor.id) {
            throw new Error("SELF");
          }

          if (target.role === "ADMIN" && actor.role !== "ADMIN") {
            throw new Error("FORBIDDEN");
          }

          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id },
              data: {
                bannedUntil: null,
                banReason: null,
              },
            });

            await createAuditLog(tx, request, {
              actor: { connect: { id: actor.id } },
              action: "USER_UNBAN",
              targetType: "User",
              targetId: id,
              metadata: { bulk: true },
            });
          });
        } else if (action === "REPORT_RESOLVE" || action === "REPORT_REJECT") {
          if (typeof id !== "string") {
            throw new Error("INVALID_ID");
          }

          const target = reportMap.get(id);
          if (!target) {
            throw new Error("NOT_FOUND");
          }

          if (communityIds) {
            if (!target.communityId || !communityIds.includes(target.communityId)) {
              throw new Error("FORBIDDEN");
            }
          }

          const nextStatus =
            action === "REPORT_RESOLVE" ? "RESOLVED" : "REJECTED";

          await prisma.$transaction(async (tx) => {
            await tx.report.update({
              where: { id },
              data: {
                status: nextStatus,
                resolvedAt: new Date(),
                resolvedById: actor.id,
                resolutionNote: note ?? null,
              },
            });

            await createAuditLog(tx, request, {
              actor: { connect: { id: actor.id } },
              action: action === "REPORT_RESOLVE" ? "REPORT_RESOLVE" : "REPORT_REJECT",
              targetType: "Report",
              targetId: id,
              metadata: { status: nextStatus, note: note ?? null, bulk: true },
            });
          });
        }

        okCount += 1;
      } catch (error) {
        errors.push({
          id,
          error: error instanceof Error ? error.message : "UNKNOWN",
        });
      }
    }

    return apiSuccess({
      data: {
        okCount,
        failCount: errors.length,
        errors,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
