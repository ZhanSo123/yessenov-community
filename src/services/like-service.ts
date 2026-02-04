import { canModerate, type Role } from "@/lib/auth";
import { publishDomainEvent } from "@/services/event-publisher";
import { getInfrastructure } from "@/infrastructure";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { PostRepository } from "@/repositories/post-repository";

export type LikeActor = {
  id: string;
  role: Role;
};

export type LikeToggleResult =
  | {
      ok: true;
      payload: { postId: number; liked: boolean; likeCount: number };
    }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

export class LikeService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async toggleLike(postId: number, user: LikeActor): Promise<LikeToggleResult> {
    const post = await this.postRepo.findUnique({
      where: { id: postId },
      select: {
        id: true,
        deletedAt: true,
        replyToId: true,
        authorId: true,
        author: { select: { shadowBannedAt: true } },
      },
    });

    if (!post || post.deletedAt) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (
      post.author.shadowBannedAt &&
      !canModerate(user) &&
      post.authorId !== user.id
    ) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.like.findUnique({
        where: {
          userId_postId: {
            userId: user.id,
            postId,
          },
        },
      });

      if (existing) {
        await tx.like.delete({ where: { id: existing.id } });
        const likeCount = await tx.like.count({ where: { postId } });
        return { liked: false, likeCount };
      }

      try {
        await tx.like.create({
          data: {
            userId: user.id,
            postId,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }

      const likeCount = await tx.like.count({ where: { postId } });
      return { liked: true, likeCount };
    });

    if (result.liked && post.authorId !== user.id) {
      void publishDomainEvent("notification.dispatch", {
        userId: post.authorId,
        actorId: user.id,
        type: "LIKE",
        postId: post.id,
      });
    }

    const threadId = post.replyToId ?? post.id;
    await this.cache.del("feed:");
    await this.cache.del("community-feed:");
    await this.cache.del("posts:");
    await this.cache.del(`post:${threadId}:`);
    await this.cache.del(`post-replies:${threadId}:`);
    await this.cache.del("profile-posts:");
    await this.cache.del("profile-replies:");
    await this.cache.del("profile-header:");

    if (result.liked) {
      void publishDomainEvent("post.liked", {
        postId: post.id,
        actorId: user.id,
      });
    } else {
      void publishDomainEvent("post.unliked", {
        postId: post.id,
        actorId: user.id,
      });
    }

    return {
      ok: true,
      payload: {
        postId,
        liked: result.liked,
        likeCount: result.likeCount,
      },
    };
  }
}
