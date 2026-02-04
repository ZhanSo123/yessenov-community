import { buildCursor } from "@/lib/pagination";
import { FollowRepository } from "@/repositories/follow-repository";
import { UserRepository } from "@/repositories/user-repository";

export type FollowListViewer = {
  id: string;
};

type Cursor = { createdAt: Date; id: number } | null;

type FollowListItem = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  viewer: {
    isFollowing: boolean;
    isFriend: boolean;
    isMe: boolean;
  };
};

export type FollowListResult =
  | { ok: true; payload: { items: FollowListItem[]; nextCursor: string | null } }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

export class FollowListService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly followRepo = new FollowRepository()
  ) {}

  async listFollowers(params: {
    usernameLower: string;
    limit: number;
    cursor: Cursor;
    viewer: FollowListViewer | null;
  }): Promise<FollowListResult> {
    return this.list({ ...params, kind: "followers" });
  }

  async listFollowing(params: {
    usernameLower: string;
    limit: number;
    cursor: Cursor;
    viewer: FollowListViewer | null;
  }): Promise<FollowListResult> {
    return this.list({ ...params, kind: "following" });
  }

  private async list(params: {
    usernameLower: string;
    limit: number;
    cursor: Cursor;
    viewer: FollowListViewer | null;
    kind: "followers" | "following";
  }): Promise<FollowListResult> {
    const { usernameLower, limit, cursor, viewer, kind } = params;
    const target = await this.userRepo.findUnique({
      where: { usernameLower },
      select: { id: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const cursorFilter = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const followRecords = await this.followRepo.findMany({
      where:
        kind === "followers"
          ? { followingId: target.id, ...cursorFilter }
          : { followerId: target.id, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select:
        kind === "followers"
          ? {
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
            }
          : {
              id: true,
              createdAt: true,
              following: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  image: true,
                },
              },
            },
    });

    const hasMore = followRecords.length > limit;
    const sliced = hasMore ? followRecords.slice(0, limit) : followRecords;
    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    const users = sliced.map((item) =>
      kind === "followers" ? item.follower : item.following
    );

    const viewerId = viewer?.id ?? null;
    let viewerFollowing = new Set<string>();
    let viewerFollowers = new Set<string>();

    if (viewerId && users.length > 0) {
      const ids = users.map((user) => user.id);
      const [followingRecords, followerRecords] = await Promise.all([
        this.followRepo.findMany({
          where: { followerId: viewerId, followingId: { in: ids } },
          select: { followingId: true },
        }),
        this.followRepo.findMany({
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

    return {
      ok: true,
      payload: {
        items: users.map((user) => {
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
      },
    };
  }
}
