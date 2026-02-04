import {
  FOLLOW_RATE_LIMIT_MAX,
  FOLLOW_RATE_LIMIT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { NextRequest } from "next/server";

import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  ensureNotBanned,
  requireOnboardedUserApi,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { FollowToggleSchema } from "@/lib/validators";
import { FollowService } from "@/services/follow-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = FollowToggleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();
    ensureNotBanned(user);

    if (!(await rateLimit(request, user.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    const activity = checkActivityLimit(
      `follow:${user.id}`,
      FOLLOW_RATE_LIMIT_WINDOW_MS,
      FOLLOW_RATE_LIMIT_MAX
    );

    if (!activity.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const service = new FollowService();
    const result = await service.toggleFollow(parsed.data.username, {
      id: user.id,
      username: user.username,
      usernameLower: user.usernameLower,
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
