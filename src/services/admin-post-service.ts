import { type Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, getCommunityScope, type Role } from "@/lib/auth";
import { buildCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { CommunityRepository } from "@/repositories/community-repository";
import { PostRepository } from "@/repositories/post-repository";
import { publishDomainEvent } from "@/services/event-publisher";

export type AdminActor = {
  id: string;
  role: Role;
};

export type AdminPostListResult =
  | { ok: true; payload: { data: unknown[]; nextCursor: string | null } }
  | { ok: false; code: "FORBIDDEN" | "BAD_REQUEST"; status: 403 | 400 };

export type AdminPostDeleteResult =
  | { ok: true; payload: { data: unknown } }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN";
      status: 404 | 403;
    };

export type AdminPostRestoreResult =
  | { ok: true; payload: { data: unknown } }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN";
      status: 404 | 403;
    };

export class AdminPostService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly communityRepo = new CommunityRepository()
  ) {}

  async listPosts(params: {
    actor: AdminActor;
    query?: string | null;
    deleted?: "0" | "1" | null;
    communitySlug?: string | null;
    sortDirection: "asc" | "desc";
    fromDate?: Date | null;
    toDate?: Date | null;
    limit: number;
    cursor: { createdAt: Date; id: number } | null;
  }): Promise<AdminPostListResult> {
    const { actor } = params;
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const filters: Prisma.PostWhereInput[] = [];

    if (params.communitySlug) {
      const community = await this.communityRepo.findUnique({
        where: { slug: params.communitySlug },
        select: { id: true },
      });

      if (!community) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }

      filters.push({ communityId: community.id });
    }

    if (communityIds) {
      filters.push({ communityId: { in: communityIds } });
    }

    if (params.deleted === "1") {
      filters.push({ deletedAt: { not: null } });
    } else if (params.deleted === "0") {
      filters.push({ deletedAt: null });
    }

    if (params.query) {
      filters.push({
        OR: [
          { content: { contains: params.query, mode: "insensitive" } },
          { author: { username: { contains: params.query, mode: "insensitive" } } },
          { author: { email: { contains: params.query, mode: "insensitive" } } },
        ],
      });
    }

    if (params.fromDate) {
      filters.push({ createdAt: { gte: params.fromDate } });
    }

    if (params.toDate) {
      filters.push({ createdAt: { lte: params.toDate } });
    }

    if (params.cursor) {
      filters.push({
        OR:
          params.sortDirection === "asc"
            ? [
                { createdAt: { gt: params.cursor.createdAt } },
                { createdAt: params.cursor.createdAt, id: { gt: params.cursor.id } },
              ]
            : [
                { createdAt: { lt: params.cursor.createdAt } },
                { createdAt: params.cursor.createdAt, id: { lt: params.cursor.id } },
              ],
      });
    }

    const posts = await this.postRepo.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: [
        { createdAt: params.sortDirection },
        { id: params.sortDirection },
      ],
      take: params.limit + 1,
      include: {
        author: { select: { id: true, email: true, username: true, name: true } },
        deletedBy: { select: { id: true, email: true, username: true, name: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });

    const hasMore = posts.length > params.limit;
    const sliced = hasMore ? posts.slice(0, params.limit) : posts;
    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return { ok: true, payload: { data: sliced, nextCursor } };
  }

  async deletePost(params: {
    postId: number;
    actor: AdminActor;
    reason: string;
    request: Request;
  }): Promise<AdminPostDeleteResult> {
    const { postId, actor, reason, request } = params;

    const target = await this.postRepo.findUnique({
      where: { id: postId },
      select: { id: true, communityId: true, authorId: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (!canModerate(actor)) {
      if (!target.communityId) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }

      const role = await getCommunityModeratorRole(target.communityId, actor.id);
      if (!role) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
    }

    const post = await prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({
        where: { id: postId },
        data: {
          deletedAt: new Date(),
          deletedById: actor.id,
          deleteReason: reason ?? null,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "POST_DELETE",
        targetType: "Post",
        targetId: String(postId),
        metadata: { reason: reason ?? null },
      });

      return updated;
    });

    void publishDomainEvent("post.deleted", {
      postId,
      authorId: target.authorId,
      actorId: actor.id,
      reason: reason ?? null,
    });

    return { ok: true, payload: { data: post } };
  }

  async restorePost(params: {
    postId: number;
    actor: AdminActor;
    request: Request;
  }): Promise<AdminPostRestoreResult> {
    const { postId, actor, request } = params;

    const target = await this.postRepo.findUnique({
      where: { id: postId },
      select: { id: true, communityId: true, authorId: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (!canModerate(actor)) {
      if (!target.communityId) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }

      const role = await getCommunityModeratorRole(target.communityId, actor.id);
      if (!role) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
    }

    const post = await prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({
        where: { id: postId },
        data: {
          deletedAt: null,
          deletedById: null,
          deleteReason: null,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "POST_RESTORE",
        targetType: "Post",
        targetId: String(postId),
      });

      return updated;
    });

    void publishDomainEvent("post.restored", {
      postId,
      authorId: target.authorId,
      actorId: actor.id,
    });

    return { ok: true, payload: { data: post } };
  }
}
