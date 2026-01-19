import {
  LIKE_RATE_LIMIT_MAX,
  LIKE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  canModerate,
  ensureNotBanned,
  ensureInviteAccepted,
  ensureOnboarded,
  requireUserApi,
} from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { LikeToggleSchema } from "@/lib/validators";

export async function POST(request: Request) {
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

    const user = await requireUserApi();
    ensureInviteAccepted(user);
    ensureNotBanned(user);
    ensureOnboarded(user);

    if (!rateLimit(request, user.id)) {
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

    const post = await prisma.post.findUnique({
      where: { id: parsed.data.postId },
      select: {
        id: true,
        deletedAt: true,
        authorId: true,
        author: { select: { shadowBannedAt: true } },
      },
    });

    if (!post || post.deletedAt) {
      return apiError("NOT_FOUND", 404);
    }

    if (
      post.author.shadowBannedAt &&
      !canModerate(user) &&
      post.authorId !== user.id
    ) {
      return apiError("NOT_FOUND", 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.like.findUnique({
        where: {
          userId_postId: {
            userId: user.id,
            postId: parsed.data.postId,
          },
        },
      });

      if (existing) {
        await tx.like.delete({ where: { id: existing.id } });
        const likeCount = await tx.like.count({
          where: { postId: parsed.data.postId },
        });
        return { liked: false, likeCount };
      }

      try {
        await tx.like.create({
          data: {
            userId: user.id,
            postId: parsed.data.postId,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }

      const likeCount = await tx.like.count({
        where: { postId: parsed.data.postId },
      });

      return { liked: true, likeCount };
    });

    return apiSuccess({
      data: {
        postId: parsed.data.postId,
        liked: result.liked,
        likeCount: result.likeCount,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
