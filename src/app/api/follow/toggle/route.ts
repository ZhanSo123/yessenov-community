import {
  FOLLOW_RATE_LIMIT_MAX,
  FOLLOW_RATE_LIMIT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { NextRequest } from "next/server";

import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  ensureInviteAccepted,
  ensureNotBanned,
  ensureOnboarded,
  requireUserApi,
} from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { FollowToggleSchema } from "@/lib/validators";

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

    const user = await requireUserApi();
    ensureInviteAccepted(user);
    ensureNotBanned(user);
    ensureOnboarded(user);

    if (!rateLimit(request, user.id)) {
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

    const usernameLower = parsed.data.username.toLowerCase();
    const target = await prisma.user.findUnique({
      where: { usernameLower },
      select: { id: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    if (target.id === user.id) {
      return apiError("BAD_REQUEST", 400);
    }

    const following = await prisma.$transaction(async (tx) => {
      const existing = await tx.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: user.id,
            followingId: target.id,
          },
        },
      });

      if (existing) {
        await tx.follow.delete({ where: { id: existing.id } });
        return false;
      }

      try {
        await tx.follow.create({
          data: {
            followerId: user.id,
            followingId: target.id,
          },
        });
        return true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
        return true;
      }
    });

    return apiSuccess({ data: { following } });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
