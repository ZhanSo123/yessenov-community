import { NextRequest } from "next/server";

import {
  LIKE_RATE_LIMIT_MAX,
  LIKE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  ensureNotBanned,
  requireOnboardedUserApi,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { LikeToggleSchema } from "@/lib/validators";
import { LikeService } from "@/services/like-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = LikeToggleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();
    ensureNotBanned(user);

    if (!(await rateLimit(request, user.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    const activity = checkActivityLimit(
      `like:${user.id}`,
      LIKE_RATE_LIMIT_WINDOW_MS,
      LIKE_RATE_LIMIT_MAX
    );

    if (!activity.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const service = new LikeService();
    const result = await service.toggleLike(parsed.data.postId, {
      id: user.id,
      role: user.role,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess({ data: result.payload });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
