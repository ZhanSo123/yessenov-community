import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;
    const trimmed = username.trim();
    if (!trimmed) {
      return apiError("BAD_REQUEST", 400);
    }

    const usernameLower = trimmed.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { usernameLower },
      select: {
        username: true,
        displayName: true,
        bio: true,
        image: true,
        createdAt: true,
        id: true,
        pinnedPostId: true,
      },
    });

    if (!user) {
      return apiError("NOT_FOUND", 404);
    }

    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;
    const isMe = Boolean(viewerId && viewerId === user.id);

    const [postsCount, followersCount, followingCount, viewerFollow, viewerBack] =
      await Promise.all([
        prisma.post.count({
          where: { authorId: user.id, replyToId: null, deletedAt: null },
        }),
        prisma.follow.count({ where: { followingId: user.id } }),
        prisma.follow.count({ where: { followerId: user.id } }),
        viewerId
          ? prisma.follow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: viewerId,
                  followingId: user.id,
                },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
        viewerId
          ? prisma.follow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: user.id,
                  followingId: viewerId,
                },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

    return apiSuccess({
      data: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        image: user.image,
        createdAt: user.createdAt,
        pinnedPostId: user.pinnedPostId,
        stats: {
          postsCount,
          followersCount,
          followingCount,
        },
        viewer: viewerId
          ? {
              isMe,
              isFollowing: Boolean(viewerFollow),
              isFriend: Boolean(viewerFollow && viewerBack),
            }
          : null,
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
