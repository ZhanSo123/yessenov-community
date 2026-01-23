import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

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

    const target = await prisma.user.findUnique({
      where: { usernameLower },
      select: { id: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    const pagination = PaginationSchema.safeParse({
      limit: _request.nextUrl.searchParams.get("limit") ?? undefined,
      cursor: _request.nextUrl.searchParams.get("cursor") ?? undefined,
    });
    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursor(pagination.data.cursor);
    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const cursorFilter = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const followers = await prisma.follow.findMany({
      where: { followingId: target.id, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        follower: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
      },
    });

    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;

    const hasMore = followers.length > limit;
    const sliced = hasMore ? followers.slice(0, limit) : followers;
    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    const followerUsers = sliced.map((item) => item.follower);

    let viewerFollowing = new Set<string>();
    let viewerFollowers = new Set<string>();

    if (viewerId && followerUsers.length > 0) {
      const ids = followerUsers.map((user) => user.id);
      const [followingRecords, followerRecords] = await Promise.all([
        prisma.follow.findMany({
          where: { followerId: viewerId, followingId: { in: ids } },
          select: { followingId: true },
        }),
        prisma.follow.findMany({
          where: { followingId: viewerId, followerId: { in: ids } },
          select: { followerId: true },
        }),
      ]);

      viewerFollowing = new Set(
        followingRecords.map((record) => record.followingId)
      );
      viewerFollowers = new Set(
        followerRecords.map((record) => record.followerId)
      );
    }

    return apiSuccess({
      items: followerUsers.map((user) => {
        const isFollowing = viewerId ? viewerFollowing.has(user.id) : false;
        const isFriend = viewerId
          ? isFollowing && viewerFollowers.has(user.id)
          : false;
        const isMe = viewerId ? viewerId === user.id : false;
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          image: user.image,
          viewer: {
            isFollowing,
            isFriend,
            isMe,
          },
        };
      }),
      nextCursor,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
