import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { AdminMetricsService } from "@/services/admin-metrics-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRoleApi("ADMIN");

    const service = new AdminMetricsService();
    const {
      usersTotal,
      usersInvitedAccepted,
      usersOnboarded,
      postsLast24h,
      repliesLast24h,
      feedbackLast24h,
    } = await service.getAlphaMetrics();

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
