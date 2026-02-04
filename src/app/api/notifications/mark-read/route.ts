import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { NotificationService } from "@/services/notification-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    if (!body || typeof body !== "object") {
      return apiError("BAD_REQUEST", 400);
    }

    const { id } = body as { id?: string };
    if (!id || typeof id !== "string") {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();

    const service = new NotificationService();
    const result = await service.markRead(user.id, id);

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
