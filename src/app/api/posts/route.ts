import { NextRequest } from "next/server";

import {
  POST_RATE_LIMIT_MAX,
  POST_RATE_LIMIT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  ensureNotBanned,
  getOptionalUser,
  requireOnboardedUserApi,
} from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { rateLimit } from "@/lib/rate-limit";
import { PostCreateSchema } from "@/lib/validators";
import { PostService } from "@/services/post-service";

export const runtime = "nodejs";

const SEED_USER = {
  email: "seed@yessenov.local",
  username: "campus_bot",
  name: "Campus Bot",
  image: "https://api.dicebear.com/7.x/bottts/svg?seed=campus",
};

const SEED_REPLIES = [
  "Интересная мысль!",
  "Согласен.",
  "Классно звучит.",
  "Поддерживаю!",
  "Хороший старт.",
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const communitySlug = searchParams.get("community")?.trim() ?? null;
    const viewer = await getOptionalUser();
    const service = new PostService();
    const result = await service.listPosts({
      communitySlug,
      viewer: viewer
        ? {
            id: viewer.id,
            role: viewer.role,
            faculty: viewer.faculty ?? null,
            course: viewer.course ?? null,
          }
        : null,
    });

    if (!result.ok) {
      return apiError(result.code, result.status, result.meta);
    }

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = PostCreateSchema.safeParse(body);
    if (!parsed.success) {
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

    const { content, replyToId, communityId, communitySlug } = parsed.data;
    const service = new PostService();
    const authorContext = {
      id: author.id,
      role: author.role,
      faculty: author.faculty ?? null,
      course: author.course ?? null,
      createdAt: author.createdAt,
      shadowBannedAt: author.shadowBannedAt,
      username: author.username,
      usernameLower: author.usernameLower,
    };

    const result =
      typeof replyToId === "number"
        ? await service.createReply({
            content,
            replyToId,
            author: authorContext,
            request,
            includeCommunity: true,
          })
        : await service.createRootPost({
            content,
            communityId,
            communitySlug,
            author: authorContext,
            request,
            seedConfig: {
              user: SEED_USER,
              replies: SEED_REPLIES,
            },
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
