import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { rateLimitModeration } from "@/lib/rate-limit";
import { UserBanSchema } from "@/lib/validators";
import { AdminUserService } from "@/services/admin-user-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = await requireRoleApi("MOD");

    if (!(await rateLimitModeration(request, actor.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = UserBanSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    if (!parsed.data.reason) {
      return apiError("BAD_REQUEST", 400);
    }

    const days = parsed.data.days ?? 7;
    const service = new AdminUserService();
    const result = await service.banUser({
      actor,
      targetId: id,
      days,
      reason: parsed.data.reason,
      request,
    });

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
