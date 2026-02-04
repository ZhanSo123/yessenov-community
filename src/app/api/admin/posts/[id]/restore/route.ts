import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { rateLimitModeration } from "@/lib/rate-limit";
import { AdminPostService } from "@/services/admin-post-service";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = await requireUserApi();

    if (!(await rateLimitModeration(_request, actor.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    const postId = Number(id);
    if (Number.isNaN(postId)) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new AdminPostService();
    const result = await service.restorePost({
      postId,
      actor,
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
