import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getCommunityScope, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return apiError("FORBIDDEN", 403);
    }

    const now = new Date();

    const [openReports, deletedPosts, bannedUsers, shadowBannedUsers] =
      await Promise.all([
        prisma.report.count({
          where: {
            status: "OPEN",
            ...(communityIds
              ? { post: { communityId: { in: communityIds } } }
              : {}),
          },
        }),
        prisma.post.count({
          where: {
            deletedAt: { not: null },
            ...(communityIds ? { communityId: { in: communityIds } } : {}),
          },
        }),
        canModerate(actor)
          ? prisma.user.count({ where: { bannedUntil: { gt: now } } })
          : Promise.resolve(0),
        canModerate(actor)
          ? prisma.user.count({ where: { shadowBannedAt: { not: null } } })
          : Promise.resolve(0),
      ]);

    return apiSuccess({
      data: {
        openReports,
        deletedPosts,
        bannedUsers,
        shadowBannedUsers,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
