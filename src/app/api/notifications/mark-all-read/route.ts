import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { NotificationService } from "@/services/notification-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireOnboardedUserApi();

    const service = new NotificationService();
    const result = await service.markAllRead(user.id);

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
