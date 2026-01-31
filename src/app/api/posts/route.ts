import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { auth } from "@/auth";
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
  getOptionalUser,
} from "@/lib/auth";
import { canAccessCommunity, getAccessibleCommunityIds } from "@/lib/community-access";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { PostCreateSchema } from "@/lib/validators";
import {
  createMentionNotifications,
  createNotification,
} from "@/lib/notifications";

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

const ensureSeedUser = async () =>
  prisma.user.upsert({
    where: { email: SEED_USER.email },
    update: {
      username: SEED_USER.username,
      usernameLower: SEED_USER.username.toLowerCase(),
      name: SEED_USER.name,
      image: SEED_USER.image,
      hasOnboarded: true,
    },
    create: {
      email: SEED_USER.email,
      username: SEED_USER.username,
      usernameLower: SEED_USER.username.toLowerCase(),
      name: SEED_USER.name,
      image: SEED_USER.image,
      hasOnboarded: true,
    },
  });

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const communitySlug = searchParams.get("community")?.trim();
    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;
    const viewerCanModerate = viewer ? canModerate(viewer) : false;
    const accessibleCommunityIds = viewerCanModerate
      ? null
      : await getAccessibleCommunityIds(
          viewer
            ? {
                id: viewer.id,
                role: viewer.role,
                faculty: viewer.faculty ?? null,
                course: viewer.course ?? null,
              }
            : null
        );

    const where: Prisma.PostWhereInput = {
      replyToId: null,
      deletedAt: null,
    };
    const andFilters: Prisma.PostWhereInput[] = [];

    if (communitySlug) {
      const community = await prisma.community.findUnique({
        where: { slug: communitySlug },
        select: {
          id: true,
          type: true,
          isPrivate: true,
          facultyCode: true,
          courseYear: true,
        },
      });

      if (!community) {
        return apiError("NOT_FOUND", 404);
      }

      const hasAccess = await canAccessCommunity(
        community,
        viewer
          ? {
              id: viewer.id,
              role: viewer.role,
              faculty: viewer.faculty ?? null,
              course: viewer.course ?? null,
            }
          : null
      );
      if (!hasAccess) {
        return apiError("FORBIDDEN", 403, { message: "PRIVATE_COMMUNITY" });
      }

      where.communityId = community.id;
    } else if (accessibleCommunityIds !== null) {
      const allowed =
        accessibleCommunityIds.length > 0
          ? [
              { communityId: null },
              { communityId: { in: accessibleCommunityIds } },
            ]
          : [{ communityId: null }];
      andFilters.push({ OR: allowed });
    }

    if (!viewerCanModerate) {
      if (viewerId) {
        andFilters.push({
          OR: [
            { author: { shadowBannedAt: null } },
            { authorId: viewerId },
          ],
        });
      } else {
        where.author = { shadowBannedAt: null };
      }
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
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
        community: { select: { id: true, slug: true, title: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });

    const likedSet = viewerId
      ? new Set(
          (
            await prisma.like.findMany({
              where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
              select: { postId: true },
            })
          ).map((like) => like.postId)
        )
      : new Set<number>();

    return apiSuccess({
      data: posts.map((post) => ({
        ...post,
        viewerHasLiked: likedSet.has(post.id),
        canViewDeleted: true,
      })),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError("UNAUTHORIZED", 401);
    }

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

    const author = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!author) {
      return apiError("UNAUTHORIZED", 401);
    }
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

    const { content, replyToId, communityId, communitySlug } = parsed.data;
    const existingRootPosts = await prisma.post.count({
      where: { authorId: author.id, replyToId: null },
    });
    let resolvedCommunityId: number | null =
      typeof communityId === "number" ? communityId : null;

    if (!resolvedCommunityId && communitySlug) {
      const community = await prisma.community.findUnique({
        where: { slug: communitySlug },
        select: {
          id: true,
          type: true,
          isPrivate: true,
          facultyCode: true,
          courseYear: true,
        },
      });

      if (!community) {
        return apiError("BAD_REQUEST", 400);
      }

      resolvedCommunityId = community.id;

      const hasAccess = await canAccessCommunity(
        community,
        {
          id: author.id,
          role: author.role,
          faculty: author.faculty ?? null,
          course: author.course ?? null,
        }
      );
      if (!hasAccess) {
        return apiError("FORBIDDEN", 403, { message: "PRIVATE_COMMUNITY" });
      }
    }

    let rootPostId: number | null = null;
    let rootAuthorId: string | null = null;
    if (typeof replyToId === "number") {
      let cursorId: number | null = replyToId;
      let first = true;
      while (cursorId) {
        const parent: {
          id: number;
          deletedAt: Date | null;
          communityId: number | null;
          authorId: string;
          replyToId: number | null;
        } | null = await prisma.post.findUnique({
          where: { id: cursorId },
          select: {
            id: true,
            deletedAt: true,
            communityId: true,
            authorId: true,
            replyToId: true,
          },
        });

        if (!parent || parent.deletedAt) {
          return apiError("BAD_REQUEST", 400);
        }

        if (first) {
          resolvedCommunityId = parent.communityId ?? null;
          first = false;
        }

        if (!parent.replyToId) {
          rootPostId = parent.id;
          rootAuthorId = parent.authorId;
          break;
        }

        cursorId = parent.replyToId;
      }
    }

    if (resolvedCommunityId) {
      const community = await prisma.community.findUnique({
        where: { id: resolvedCommunityId },
        select: {
          id: true,
          type: true,
          isPrivate: true,
          facultyCode: true,
          courseYear: true,
        },
      });
      if (!community) {
        return apiError("BAD_REQUEST", 400);
      }
      const hasAccess = await canAccessCommunity(community, {
        id: author.id,
        role: author.role,
        faculty: author.faculty ?? null,
        course: author.course ?? null,
      });
      if (!hasAccess) {
        return apiError("FORBIDDEN", 403, { message: "PRIVATE_COMMUNITY" });
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

    let post = await prisma.post.create({
      data: {
        content,
        authorId: author.id,
        replyToId: replyToId ?? null,
        communityId: resolvedCommunityId,
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
        community: { select: { id: true, slug: true, title: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });

    if (!replyToId && existingRootPosts === 0) {
      const seedUser = await ensureSeedUser();
      if (seedUser.id !== author.id) {
        const seedContent =
          SEED_REPLIES[Math.floor(Math.random() * SEED_REPLIES.length)];
        await prisma.$transaction([
          prisma.post.create({
            data: {
              content: seedContent,
              authorId: seedUser.id,
              replyToId: post.id,
              communityId: post.communityId,
            },
          }),
          prisma.post.update({
            where: { id: post.id },
            data: { replyCount: { increment: 1 } },
          }),
        ]);
        post = {
          ...post,
          _count: {
            ...post._count,
            replies: post._count.replies + 1,
          },
        };
      }
    }

    if (replyToId && rootAuthorId && rootPostId && rootAuthorId !== author.id) {
      try {
        await createNotification({
          userId: rootAuthorId,
          actorId: author.id,
          type: "REPLY",
          postId: rootPostId,
          replyId: typeof post.id === "number" ? post.id : null,
        });
      } catch {
        // ignore
      }
    }

    try {
      await createMentionNotifications(content, author.id, post.id);
    } catch {
      // ignore
    }

    return apiSuccess(
      { data: { ...post, viewerHasLiked: false, canViewDeleted: true } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
