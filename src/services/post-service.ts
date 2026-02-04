import { type Prisma } from "@prisma/client";

import {
  NEW_USER_AGE_MS,
  NEW_USER_POST_THRESHOLD,
  NEW_USER_POST_WINDOW_MS,
} from "@/lib/abuse-rules";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, type Role } from "@/lib/auth";
import {
  canAccessCommunity,
  getAccessibleCommunityIds,
} from "@/lib/community-access";
import { prisma } from "@/lib/prisma";
import { getInfrastructure } from "@/infrastructure";
import { CommunityRepository } from "@/repositories/community-repository";
import { LikeRepository } from "@/repositories/like-repository";
import { PostRepository } from "@/repositories/post-repository";
import { publishDomainEvent } from "@/services/event-publisher";

export type PostViewer = {
  id: string;
  role: Role;
  faculty?: string | null;
  course?: number | null;
};

export type PostAuthor = PostViewer & {
  createdAt: Date;
  shadowBannedAt: Date | null;
  username?: string | null;
  usernameLower?: string | null;
};

export type SeedConfig = {
  user: {
    email: string;
    username: string;
    name: string;
    image: string;
  };
  replies: string[];
};

type PostCard = {
  id: number;
  content: string;
  createdAt: Date;
  replyToId: number | null;
  deletedAt: Date | null;
  authorId: string;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    image: string | null;
  };
  community?: {
    id: number;
    slug: string;
    title: string;
  } | null;
  _count: { likes: number; replies: number };
  canViewDeleted: boolean;
  viewerHasLiked: boolean;
};

export type ListPostsResult =
  | {
      ok: true;
      payload: { data: PostCard[] };
      cacheKey: string;
      cached: boolean;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN";
      status: 404 | 403;
      meta?: { message?: string };
    };

export type CreatePostResult =
  | { ok: true; payload: { data: PostCard } }
  | {
      ok: false;
      code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND";
      status: 400 | 403 | 404;
      meta?: { message?: string };
    };

export type RepostResult =
  | { ok: true; payload: { data: Record<string, unknown> } }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

export type DeletePostUser = {
  id: string;
};

export type DeletePostResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; status: 404 | 403 };

const POSTS_CACHE_TTL_MS = 20 * 1000;

const COMMUNITY_SELECT = {
  id: true,
  type: true,
  isPrivate: true,
  facultyCode: true,
  courseYear: true,
};

export class PostService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly communityRepo = new CommunityRepository(),
    private readonly likeRepo = new LikeRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async listPosts(params: {
    communitySlug: string | null;
    viewer: PostViewer | null;
  }): Promise<ListPostsResult> {
    const { communitySlug, viewer } = params;
    const viewerId = viewer?.id ?? null;
    const viewerRole = viewer?.role ?? "ANON";
    const viewerCanModerate = viewer ? canModerate(viewer) : false;
    const cacheKey = `posts:${communitySlug ?? "all"}:${viewerId ?? "anon"}:${viewerRole}:${viewer?.faculty ?? "none"}:${viewer?.course ?? "none"}`;

    const cached = await this.cache.get<{ data: PostCard[] }>(cacheKey);
    if (cached) {
      return { ok: true, payload: cached, cacheKey, cached: true };
    }

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
      const community = await this.communityRepo.findUnique({
        where: { slug: communitySlug },
        select: COMMUNITY_SELECT,
      });

      if (!community) {
        return { ok: false, code: "NOT_FOUND", status: 404 };
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
        return {
          ok: false,
          code: "FORBIDDEN",
          status: 403,
          meta: { message: "PRIVATE_COMMUNITY" },
        };
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

    const posts = await this.postRepo.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        content: true,
        createdAt: true,
        replyToId: true,
        deletedAt: true,
        authorId: true,
        author: {
          select: {
            id: true,
            username: true,
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
            await this.likeRepo.findMany({
              where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
              select: { postId: true },
            })
          ).map((like) => like.postId)
        )
      : new Set<number>();

    const payload = {
      data: posts.map((post) => ({
        ...post,
        viewerHasLiked: likedSet.has(post.id),
        canViewDeleted: true,
      })),
    };

    await this.cache.set(cacheKey, payload, POSTS_CACHE_TTL_MS);

    return { ok: true, payload, cacheKey, cached: false };
  }

  async createRootPost(params: {
    content: string;
    communityId?: number | null;
    communitySlug?: string | null;
    author: PostAuthor;
    request: Request;
    seedConfig?: SeedConfig;
  }): Promise<CreatePostResult> {
    const { content, communityId, communitySlug, author, request, seedConfig } = params;

    const existingRootPost = await this.postRepo.findFirst({
      where: { authorId: author.id, replyToId: null },
      select: { id: true },
    });

    let resolvedCommunityId: number | null =
      typeof communityId === "number" ? communityId : null;
    let resolvedCommunity: {
      id: number;
      type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
      isPrivate: boolean;
      facultyCode: string | null;
      courseYear: number | null;
    } | null = null;

    if (!resolvedCommunityId && communitySlug) {
      const community = await this.communityRepo.findUnique({
        where: { slug: communitySlug },
        select: COMMUNITY_SELECT,
      });

      if (!community) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }

      resolvedCommunityId = community.id;
      resolvedCommunity = community;

      const hasAccess = await canAccessCommunity(community, {
        id: author.id,
        role: author.role,
        faculty: author.faculty ?? null,
        course: author.course ?? null,
      });
      if (!hasAccess) {
        return {
          ok: false,
          code: "FORBIDDEN",
          status: 403,
          meta: { message: "PRIVATE_COMMUNITY" },
        };
      }
    }

    if (resolvedCommunityId) {
      const community =
        resolvedCommunity ??
        (await this.communityRepo.findUnique({
          where: { id: resolvedCommunityId },
          select: COMMUNITY_SELECT,
        }));
      if (!community) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }
      const hasAccess = await canAccessCommunity(community, {
        id: author.id,
        role: author.role,
        faculty: author.faculty ?? null,
        course: author.course ?? null,
      });
      if (!hasAccess) {
        return {
          ok: false,
          code: "FORBIDDEN",
          status: 403,
          meta: { message: "PRIVATE_COMMUNITY" },
        };
      }
    }

    const isNewUser = author.createdAt.getTime() > Date.now() - NEW_USER_AGE_MS;
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

    let post = await this.postRepo.create({
      data: {
        content,
        authorId: author.id,
        replyToId: null,
        communityId: resolvedCommunityId,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        replyToId: true,
        deletedAt: true,
        authorId: true,
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
        community: { select: { id: true, slug: true, title: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });

    if (!existingRootPost && seedConfig && seedConfig.replies.length > 0) {
      const seedUser = await this.ensureSeedUser(seedConfig);
      if (seedUser.id !== author.id) {
        const seedContent =
          seedConfig.replies[
            Math.floor(Math.random() * seedConfig.replies.length)
          ];
        if (seedContent) {
          await prisma.$transaction([
            prisma.post.create({
              data: {
                content: seedContent,
                authorId: seedUser.id,
                replyToId: post.id,
                communityId: resolvedCommunityId,
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
    }

    const authorUsernameLower =
      author.usernameLower ?? author.username?.toLowerCase() ?? null;

    await this.cache.del("feed:");
    await this.cache.del("community-feed:");
    await this.cache.del("posts:");
    if (authorUsernameLower) {
      await this.cache.del(`profile-posts:${authorUsernameLower}:`);
      await this.cache.del(`profile-header:${authorUsernameLower}:`);
    } else {
      await this.cache.del("profile-posts:");
      await this.cache.del("profile-header:");
    }

    void publishDomainEvent("post.created", {
      postId: post.id,
      authorId: author.id,
      content,
      communityId: resolvedCommunityId ?? null,
      replyToId: null,
    });

    if (process.env.JOB_QUEUE_PROVIDER === "postgres") {
      const infra = getInfrastructure();
      void infra.jobQueue.enqueue({
        type: "abuse.scan.post",
        enqueuedAt: new Date(),
        payload: { postId: post.id },
      });
    }

    return {
      ok: true,
      payload: {
        data: {
          ...post,
          viewerHasLiked: false,
          canViewDeleted: true,
        },
      },
    };
  }

  async createReply(params: {
    content: string;
    replyToId: number;
    author: PostAuthor;
    request: Request;
    includeCommunity?: boolean;
  }): Promise<CreatePostResult> {
    const { content, replyToId, author, request, includeCommunity } = params;

    const parent = await this.postRepo.findUnique({
      where: { id: replyToId },
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
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (
      parent.author.shadowBannedAt &&
      !canModerate(author) &&
      parent.authorId !== author.id
    ) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (parent.communityId) {
      const community = await this.communityRepo.findUnique({
        where: { id: parent.communityId },
        select: COMMUNITY_SELECT,
      });
      if (!community) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }
      const hasAccess = await canAccessCommunity(community, {
        id: author.id,
        role: author.role,
        faculty: author.faculty ?? null,
        course: author.course ?? null,
      });
      if (!hasAccess) {
        return {
          ok: false,
          code: "FORBIDDEN",
          status: 403,
          meta: { message: "PRIVATE_COMMUNITY" },
        };
      }
    }

    let rootPostId = parent.id;
    let rootAuthorId = parent.authorId;
    if (parent.replyToId) {
      let cursorId: number | null = parent.replyToId;
      while (cursorId) {
        const root = await this.postRepo.findUnique({
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

    const isNewUser = author.createdAt.getTime() > Date.now() - NEW_USER_AGE_MS;
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

    const reply = await this.postRepo.create({
      data: {
        content,
        authorId: author.id,
        replyToId,
        communityId: parent.communityId ?? null,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        replyToId: true,
        deletedAt: true,
        authorId: true,
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
        ...(includeCommunity
          ? { community: { select: { id: true, slug: true, title: true } } }
          : {}),
        _count: { select: { likes: true, replies: true } },
      },
    });

    if (rootAuthorId !== author.id) {
      void publishDomainEvent("notification.dispatch", {
        userId: rootAuthorId,
        actorId: author.id,
        type: "REPLY",
        postId: rootPostId,
        replyId: reply.id,
      });
    }

    const authorUsernameLower =
      author.usernameLower ?? author.username?.toLowerCase() ?? null;
    const threadId = rootPostId ?? replyToId;

    await this.cache.del("feed:");
    await this.cache.del("community-feed:");
    await this.cache.del("posts:");
    if (threadId) {
      await this.cache.del(`post:${threadId}:`);
      await this.cache.del(`post-replies:${threadId}:`);
    }
    if (authorUsernameLower) {
      await this.cache.del(`profile-replies:${authorUsernameLower}:`);
      await this.cache.del(`profile-header:${authorUsernameLower}:`);
    } else {
      await this.cache.del("profile-replies:");
      await this.cache.del("profile-header:");
    }

    void publishDomainEvent("post.replied", {
      postId: reply.id,
      authorId: author.id,
      content,
      replyToId,
      rootPostId: rootPostId ?? null,
      communityId: parent.communityId ?? null,
    });

    if (process.env.JOB_QUEUE_PROVIDER === "postgres") {
      const infra = getInfrastructure();
      void infra.jobQueue.enqueue({
        type: "abuse.scan.post",
        enqueuedAt: new Date(),
        payload: { postId: reply.id },
      });
    }

    return {
      ok: true,
      payload: {
        data: {
          ...reply,
          viewerHasLiked: false,
          canViewDeleted: true,
        },
      },
    };
  }

  async createRepost(params: {
    repostOfId: number;
    author: PostAuthor;
  }): Promise<RepostResult> {
    const { repostOfId, author } = params;

    const parent = await this.postRepo.findUnique({
      where: { id: repostOfId },
      select: {
        id: true,
        deletedAt: true,
        communityId: true,
        authorId: true,
        author: { select: { shadowBannedAt: true } },
      },
    });

    if (!parent || parent.deletedAt) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (
      parent.author.shadowBannedAt &&
      !canModerate(author) &&
      parent.authorId !== author.id
    ) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const repost = await this.postRepo.create({
      data: {
        content: "",
        authorId: author.id,
        repostOfId,
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

    void publishDomainEvent("post.reposted", {
      postId: repost.id,
      authorId: author.id,
      repostOfId,
      communityId: parent.communityId ?? null,
    });

    return {
      ok: true,
      payload: {
        data: {
          ...repost,
          viewerHasLiked: false,
          canViewDeleted: true,
        },
      },
    };
  }

  async deletePost(postId: number, user: DeletePostUser): Promise<DeletePostResult> {
    const post = await this.postRepo.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, deletedAt: true },
    });

    if (!post) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (post.authorId !== user.id) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    if (!post.deletedAt) {
      await this.postRepo.update({
        where: { id: postId },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
        },
      });
    }

    await this.cache.del(`post:${postId}:`);
    await this.cache.del(`post-replies:${postId}:`);
    await this.cache.del("feed:");
    await this.cache.del("community-feed:");
    await this.cache.del("posts:");
    await this.cache.del("profile-posts:");
    await this.cache.del("profile-replies:");
    await this.cache.del("profile-header:");

    return { ok: true };
  }

  private async ensureSeedUser(seedConfig: SeedConfig) {
    const { user } = seedConfig;
    return prisma.user.upsert({
      where: { email: user.email },
      update: {
        username: user.username,
        usernameLower: user.username.toLowerCase(),
        name: user.name,
        image: user.image,
        hasOnboarded: true,
      },
      create: {
        email: user.email,
        username: user.username,
        usernameLower: user.username.toLowerCase(),
        name: user.name,
        image: user.image,
        hasOnboarded: true,
      },
    });
  }
}
