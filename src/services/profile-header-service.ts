import { type Role } from "@/lib/auth";
import { getInfrastructure } from "@/infrastructure";
import { FollowRepository } from "@/repositories/follow-repository";
import { PostRepository } from "@/repositories/post-repository";
import { UserRepository } from "@/repositories/user-repository";

export type ProfileHeaderViewer = {
  id: string;
  role: Role;
};

export type ProfileHeaderResult =
  | {
      ok: true;
      payload: {
        data: {
          id: string;
          username: string | null;
          displayName: string | null;
          bio: string | null;
          image: string | null;
          createdAt: Date;
          pinnedPostId: number | null;
          stats: {
            postsCount: number;
            followersCount: number;
            followingCount: number;
          };
          viewer: {
            isMe: boolean;
            isFollowing: boolean;
            isFriend: boolean;
          } | null;
        };
      };
      cacheKey: string;
      cached: boolean;
    }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

const PROFILE_HEADER_TTL_MS = 20 * 1000;

export class ProfileHeaderService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly followRepo = new FollowRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async getProfileHeader(params: {
    usernameLower: string;
    viewer: ProfileHeaderViewer | null;
  }): Promise<ProfileHeaderResult> {
    const { usernameLower, viewer } = params;
    const viewerId = viewer?.id ?? null;
    const viewerRole = viewer?.role ?? "ANON";
    const cacheKey = `profile-header:${usernameLower}:${viewerId ?? "anon"}:${viewerRole}`;

    const cached = await this.cache.get<ProfileHeaderResult["payload"]>(cacheKey);
    if (cached) {
      return { ok: true, payload: cached, cacheKey, cached: true };
    }

    const user = await this.userRepo.findUnique({
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
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const isMe = Boolean(viewerId && viewerId === user.id);

    const [postsCount, followersCount, followingCount, viewerFollow, viewerBack] =
      await Promise.all([
        this.postRepo.count({
          where: { authorId: user.id, replyToId: null, deletedAt: null },
        }),
        this.followRepo.count({ where: { followingId: user.id } }),
        this.followRepo.count({ where: { followerId: user.id } }),
        viewerId
          ? this.followRepo.findUnique({
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
          ? this.followRepo.findUnique({
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

    const payload = {
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
    };

    await this.cache.set(cacheKey, payload, PROFILE_HEADER_TTL_MS);

    return { ok: true, payload, cacheKey, cached: false };
  }
}
