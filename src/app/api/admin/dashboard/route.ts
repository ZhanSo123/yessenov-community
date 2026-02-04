import { apiError, apiSuccess } from "@/lib/api-errors";
import { getCommunityScope, requireUserApi } from "@/lib/auth";
import { AdminDashboardService } from "@/services/admin-dashboard-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    const service = new AdminDashboardService();
    const result = await service.getDashboard({ actor, communityIds });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
