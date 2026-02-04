import { publishDomainEvent } from "@/services/event-publisher";
import { getInfrastructure } from "@/infrastructure";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { FollowRepository } from "@/repositories/follow-repository";
import { UserRepository } from "@/repositories/user-repository";

export type FollowActor = {
  id: string;
  username?: string | null;
  usernameLower?: string | null;
};

export type FollowToggleResult =
  | { ok: true; payload: { following: boolean; isFriend: boolean } }
  | { ok: false; code: "NOT_FOUND" | "BAD_REQUEST"; status: 404 | 400 };

export class FollowService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly followRepo = new FollowRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async toggleFollow(username: string, actor: FollowActor): Promise<FollowToggleResult> {
    const usernameLower = username.toLowerCase();
    const target = await this.userRepo.findUnique({
      where: { usernameLower },
      select: { id: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (target.id === actor.id) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const following = await prisma.$transaction(async (tx) => {
      const existing = await tx.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: actor.id,
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
            followerId: actor.id,
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

    let isFriend = false;
    if (following) {
      const reverse = await this.followRepo.findUnique({
        where: {
          followerId_followingId: {
            followerId: target.id,
            followingId: actor.id,
          },
        },
        select: { id: true },
      });
      isFriend = Boolean(reverse);
    }

    if (following) {
      void publishDomainEvent("notification.dispatch", {
        userId: target.id,
        actorId: actor.id,
        type: "FOLLOW",
      });
    }

    const viewerUsernameLower =
      actor.usernameLower ?? actor.username?.toLowerCase() ?? null;

    await this.cache.del(`feed:following:${actor.id}:`);
    if (viewerUsernameLower) {
      await this.cache.del(`profile-posts:${viewerUsernameLower}:`);
      await this.cache.del(`profile-replies:${viewerUsernameLower}:`);
      await this.cache.del(`profile-header:${viewerUsernameLower}:`);
    } else {
      await this.cache.del("profile-posts:");
      await this.cache.del("profile-replies:");
      await this.cache.del("profile-header:");
    }
    await this.cache.del(`profile-posts:${usernameLower}:`);
    await this.cache.del(`profile-replies:${usernameLower}:`);
    await this.cache.del(`profile-header:${usernameLower}:`);

    if (following) {
      void publishDomainEvent("user.followed", {
        followerId: actor.id,
        followingId: target.id,
      });
    } else {
      void publishDomainEvent("user.unfollowed", {
        followerId: actor.id,
        followingId: target.id,
      });
    }

    return { ok: true, payload: { following, isFriend } };
  }
}
