import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRoleApi("ADMIN");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      usersInvitedAccepted,
      usersOnboarded,
      postsLast24h,
      repliesLast24h,
      feedbackLast24h,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({
        where: { inviteAcceptedAt: { not: null } },
      }),
      prisma.user.count({
        where: { username: { not: null } },
      }),
      prisma.post.count({
        where: { replyToId: null, createdAt: { gte: since } },
      }),
      prisma.post.count({
        where: { replyToId: { not: null }, createdAt: { gte: since } },
      }),
      prisma.feedback.count({
        where: { createdAt: { gte: since } },
      }),
    ]);

    return apiSuccess({
      data: {
        usersTotal,
        usersInvitedAccepted,
        usersOnboarded,
        postsLast24h,
        repliesLast24h,
        feedbackLast24h,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
