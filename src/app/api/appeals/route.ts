import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { AppealCreateSchema } from "@/lib/validators";
import { AppealService } from "@/services/appeal-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = AppealCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();

    if (!(await rateLimit(request, user.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    const { targetType, targetId, reason } = parsed.data;

    const service = new AppealService();
    const result = await service.createAppeal({
      actor: user,
      targetType,
      targetId,
      reason,
      request,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
