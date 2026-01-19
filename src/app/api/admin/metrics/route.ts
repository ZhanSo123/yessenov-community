import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const parseRange = (value: string | null) => {
  if (value === "24h") {
    return 24 * 60 * 60 * 1000;
  }
  if (value === "7d") {
    return 7 * 24 * 60 * 60 * 1000;
  }
  return null;
};

export async function GET(request: Request) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams.get("range"));
    if (!range) {
      return apiError("BAD_REQUEST", 400);
    }

    const since = new Date(Date.now() - range);

    const [
      newUsers,
      newPosts,
      deletedPosts,
      openReports,
      resolvedReports,
      bans,
      shadowbans,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.post.count({ where: { createdAt: { gte: since } } }),
      prisma.post.count({ where: { deletedAt: { gte: since } } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.report.count({ where: { resolvedAt: { gte: since } } }),
      prisma.auditLog.count({
        where: { action: "USER_BAN", createdAt: { gte: since } },
      }),
      prisma.auditLog.count({
        where: { action: "USER_SHADOWBAN", createdAt: { gte: since } },
      }),
    ]);

    return apiSuccess({
      data: {
        range: searchParams.get("range"),
        newUsers,
        newPosts,
        deletedPosts,
        openReports,
        resolvedReports,
        bans,
        shadowbans,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
