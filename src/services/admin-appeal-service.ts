import { type Prisma } from "@prisma/client";

import { canModerate, getCommunityScope, type Role } from "@/lib/auth";
import { buildCursorString } from "@/lib/pagination";
import { AppealRepository } from "@/repositories/appeal-repository";
import { PostRepository } from "@/repositories/post-repository";
import { UserRepository } from "@/repositories/user-repository";

export type AdminAppealActor = { id: string; role: Role };

export type AdminAppealListResult =
  | { ok: true; payload: { data: unknown[]; nextCursor: string | null } }
  | { ok: false; code: "FORBIDDEN"; status: 403 };

const DEFAULT_LIMIT = 50;

export class AdminAppealService {
  constructor(
    private readonly appealRepo = new AppealRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly userRepo = new UserRepository()
  ) {}

  async listAppeals(params: {
    actor: AdminAppealActor;
    status?: "OPEN" | "APPROVED" | "DENIED" | null;
    query?: string | null;
    sortDirection: "asc" | "desc";
    fromDate?: Date | null;
    toDate?: Date | null;
    limit?: number | null;
    cursor: { createdAt: Date; id: string } | null;
  }): Promise<AdminAppealListResult> {
    const { actor } = params;
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const limit = params.limit ?? DEFAULT_LIMIT;
    const whereFilters: Prisma.AppealWhereInput[] = [];

    if (params.status) {
      whereFilters.push({ status: params.status });
    }

    if (params.query) {
      whereFilters.push({
        OR: [
          { reason: { contains: params.query, mode: "insensitive" } },
          { user: { email: { contains: params.query, mode: "insensitive" } } },
          { user: { username: { contains: params.query, mode: "insensitive" } } },
        ],
      });
    }

    if (params.fromDate) {
      whereFilters.push({ createdAt: { gte: params.fromDate } });
    }

    if (params.toDate) {
      whereFilters.push({ createdAt: { lte: params.toDate } });
    }

    if (params.cursor) {
      whereFilters.push({
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

    if (communityIds) {
      whereFilters.push({ targetType: "POST" });
    }

    const appeals = await this.appealRepo.findMany({
      where: whereFilters.length ? { AND: whereFilters } : undefined,
      orderBy: [
        { createdAt: params.sortDirection },
        { id: params.sortDirection },
      ],
      take: limit + 1,
      include: {
        user: { select: { id: true, email: true, username: true, name: true } },
        resolvedBy: { select: { id: true, email: true, username: true, name: true } },
      },
    });

    const postIds = appeals
      .filter((appeal) => appeal.targetType === "POST")
      .map((appeal) => Number(appeal.targetId))
      .filter((id) => !Number.isNaN(id));

    const posts = postIds.length
      ? await this.postRepo.findMany({
          where: {
            id: { in: postIds },
            ...(communityIds ? { communityId: { in: communityIds } } : {}),
          },
          select: {
            id: true,
            content: true,
            communityId: true,
            author: { select: { id: true, username: true, name: true } },
          },
        })
      : [];

    const postMap = new Map(posts.map((post) => [post.id, post]));

    let filtered = appeals;
    if (communityIds) {
      filtered = appeals.filter((appeal) => {
        if (appeal.targetType !== "POST") {
          return false;
        }
        const postId = Number(appeal.targetId);
        return postMap.has(postId);
      });
    }

    const userTargetIds = filtered
      .filter((appeal) => appeal.targetType.startsWith("USER"))
      .map((appeal) => appeal.targetId);

    const targetUsers = userTargetIds.length
      ? await this.userRepo.findMany({
          where: { id: { in: userTargetIds } },
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            bannedUntil: true,
            shadowBannedAt: true,
          },
        })
      : [];

    const targetUserMap = new Map(targetUsers.map((user) => [user.id, user]));

    const hasMore = filtered.length > limit;
    const sliced = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return {
      ok: true,
      payload: {
        data: sliced.map((appeal) => ({
          ...appeal,
          targetPost:
            appeal.targetType === "POST"
              ? postMap.get(Number(appeal.targetId)) ?? null
              : null,
          targetUser: appeal.targetType.startsWith("USER")
            ? targetUserMap.get(appeal.targetId) ?? null
            : null,
        })),
        nextCursor,
      },
    };
  }
}
