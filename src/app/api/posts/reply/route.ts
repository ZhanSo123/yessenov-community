import { NextRequest } from "next/server";

import {
  POST_RATE_LIMIT_MAX,
  POST_RATE_LIMIT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  ensureNotBanned,
  requireOnboardedUserApi,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { PostCreateSchema } from "@/lib/validators";
import { PostService } from "@/services/post-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = PostCreateSchema.safeParse(body);
    if (!parsed.success || typeof parsed.data.replyToId !== "number") {
      return apiError("BAD_REQUEST", 400);
    }

    const author = await requireOnboardedUserApi();
    ensureNotBanned(author);

    if (!(await rateLimit(request, author.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    const activity = checkActivityLimit(
      `post:${author.id}`,
      POST_RATE_LIMIT_WINDOW_MS,
      POST_RATE_LIMIT_MAX
    );

    if (!activity.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const service = new PostService();
    const result = await service.createReply({
      content: parsed.data.content,
      replyToId: parsed.data.replyToId,
      author: {
        id: author.id,
        role: author.role,
        faculty: author.faculty ?? null,
        course: author.course ?? null,
        createdAt: author.createdAt,
        shadowBannedAt: author.shadowBannedAt,
        username: author.username,
        usernameLower: author.usernameLower,
      },
      request,
      includeCommunity: false,
    });

    if (!result.ok) {
      return apiError(result.code, result.status, result.meta);
    }

    return apiSuccess(result.payload, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
