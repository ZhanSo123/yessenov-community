import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;
    const usernameLower = username.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { usernameLower },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        image: true,
        createdAt: true,
      },
    });

    if (!user) {
      return apiError("NOT_FOUND", 404);
    }

    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;
    const isSelf = Boolean(viewerId && viewerId === user.id);
    const viewerCanModerate = viewer ? canModerate(viewer) : false;

    const visibilityFilter =
      viewerCanModerate || isSelf
        ? {}
        : { deletedAt: null, author: { shadowBannedAt: null } };

    const [followersCount, followingCount, postsCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: user.id } }),
      prisma.follow.count({ where: { followerId: user.id } }),
      prisma.post.count({
        where: {
          authorId: user.id,
          replyToId: null,
          ...visibilityFilter,
        },
      }),
    ]);

    const viewerFollows = viewerId
      ? Boolean(
          await prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: viewerId,
                followingId: user.id,
              },
            },
          })
        )
      : false;

    return apiSuccess({
      data: {
        user,
        stats: { followersCount, followingCount, postsCount },
        viewerFollows: !isSelf && viewerFollows,
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
