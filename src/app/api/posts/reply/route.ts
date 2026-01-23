import { NextRequest } from "next/server";

import {

  NEW_USER_AGE_MS,
  NEW_USER_POST_THRESHOLD,
  NEW_USER_POST_WINDOW_MS,
  POST_RATE_LIMIT_MAX,
  POST_RATE_LIMIT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import {
  canModerate,
  ensureNotBanned,
  requireUserApi,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { PostCreateSchema } from "@/lib/validators";
import {
  createMentionNotifications,
  createNotification,
} from "@/lib/notifications";

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

    const author = await requireUserApi();
    ensureNotBanned(author);

    if (!rateLimit(request, author.id)) {
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

    const parent = await prisma.post.findUnique({
      where: { id: parsed.data.replyToId },
      select: {
        id: true,
        deletedAt: true,
        communityId: true,
        authorId: true,
        replyToId: true,
        author: { select: { shadowBannedAt: true } },
      },
    });

    if (!parent || parent.deletedAt) {
      return apiError("NOT_FOUND", 404);
    }

    if (
      parent.author.shadowBannedAt &&
      !canModerate(author) &&
      parent.authorId !== author.id
    ) {
      return apiError("NOT_FOUND", 404);
    }

    let rootPostId = parent.id;
    let rootAuthorId = parent.authorId;
    if (parent.replyToId) {
      let cursorId: number | null = parent.replyToId;
      while (cursorId) {
        const root: {
          id: number;
          authorId: string;
          replyToId: number | null;
          deletedAt: Date | null;
        } | null = await prisma.post.findUnique({
          where: { id: cursorId },
          select: { id: true, authorId: true, replyToId: true, deletedAt: true },
        });

        if (!root || root.deletedAt) {
          break;
        }

        rootPostId = root.id;
        rootAuthorId = root.authorId;
        cursorId = root.replyToId ?? null;
      }
    }

    const isNewUser =
      author.createdAt.getTime() > Date.now() - NEW_USER_AGE_MS;
    const newUserActivity = checkActivityLimit(
      `post:new:${author.id}`,
      NEW_USER_POST_WINDOW_MS,
      NEW_USER_POST_THRESHOLD
    );

    if (isNewUser && !newUserActivity.allowed && !author.shadowBannedAt) {
      const reason = "Auto-shadowban: high posting rate for new account";
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: author.id },
          data: {
            shadowBannedAt: new Date(),
            shadowBanReason: reason,
          },
        });

        await tx.moderationAction.create({
          data: {
            source: "AUTO",
            action: "USER_SHADOWBAN",
            actorId: author.id,
            targetType: "User",
            targetId: author.id,
            reason,
            metadata: {
              count: newUserActivity.count,
              windowMs: NEW_USER_POST_WINDOW_MS,
            },
          },
        });

        await createAuditLog(tx, request, {
          actor: { connect: { id: author.id } },
          action: "USER_SHADOWBAN_AUTO",
          targetType: "User",
          targetId: author.id,
          metadata: {
            reason,
            count: newUserActivity.count,
            windowMs: NEW_USER_POST_WINDOW_MS,
          },
        });
      });
    }

    const reply = await prisma.post.create({
      data: {
        content: parsed.data.content,
        authorId: author.id,
        replyToId: parsed.data.replyToId,
        communityId: parent.communityId ?? null,
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            displayName: true,
            image: true,
          },
        },
        _count: { select: { likes: true, replies: true } },
      },
    });

    if (rootAuthorId !== author.id) {
      try {
        await createNotification({
          userId: rootAuthorId,
          actorId: author.id,
          type: "REPLY",
          postId: rootPostId,
          replyId: reply.id,
        });
      } catch {
        // ignore
      }
    }

    try {
      await createMentionNotifications(parsed.data.content, author.id, reply.id);
    } catch {
      // ignore
    }

    return apiSuccess(
      { data: { ...reply, viewerHasLiked: false, canViewDeleted: true } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
