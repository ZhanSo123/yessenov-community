import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { NotificationService } from "@/services/notification-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireOnboardedUserApi();
    const service = new NotificationService();
    const result = await service.getUnreadCount(user.id);

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
