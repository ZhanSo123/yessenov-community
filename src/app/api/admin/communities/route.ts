import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getCommunityScope, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);

    if (!canModerate(actor)) {
      const owned = (scope ?? []).filter((item) => item.role === "OWNER");
      if (owned.length === 0) {
        return apiError("FORBIDDEN", 403);
      }

      const communities = await prisma.community.findMany({
        where: { id: { in: owned.map((item) => item.communityId) } },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { posts: true, moderators: true } } },
      });

      return apiSuccess({ data: communities });
    }

    const communities = await prisma.community.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { posts: true, moderators: true } } },
    });

    return apiSuccess({ data: communities });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
