import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { rateLimitModeration } from "@/lib/rate-limit";
import { AdminUserService } from "@/services/admin-user-service";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = await requireRoleApi("MOD");

    if (!(await rateLimitModeration(_request, actor.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    const service = new AdminUserService();
    const result = await service.unbanUser({
      actor,
      targetId: id,
      request: _request,
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
