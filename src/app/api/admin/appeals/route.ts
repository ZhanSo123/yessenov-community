import { type Prisma } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getCommunityScope, requireUserApi } from "@/lib/auth";
import { buildCursorString, parseCursorString } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return apiError("FORBIDDEN", 403);
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const query = searchParams.get("query")?.trim();
    const sortParam = searchParams.get("sort") ?? "desc";
    const sortDirection = sortParam === "asc" ? "asc" : "desc";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursorString(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const whereFilters: Prisma.AppealWhereInput[] = [];

    if (statusParam) {
      if (!["OPEN", "APPROVED", "DENIED"].includes(statusParam)) {
        return apiError("BAD_REQUEST", 400);
      }
      whereFilters.push({ status: statusParam as "OPEN" | "APPROVED" | "DENIED" });
    }

    if (query) {
      whereFilters.push({
        OR: [
          { reason: { contains: query, mode: "insensitive" } },
          { user: { email: { contains: query, mode: "insensitive" } } },
          { user: { username: { contains: query, mode: "insensitive" } } },
        ],
      });
    }

    if (fromParam) {
      const fromDate = new Date(fromParam);
      if (Number.isNaN(fromDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      whereFilters.push({ createdAt: { gte: fromDate } });
    }

    if (toParam) {
      const toDate = new Date(toParam);
      if (Number.isNaN(toDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      whereFilters.push({ createdAt: { lte: toDate } });
    }

    if (cursor) {
      whereFilters.push({
        OR:
          sortDirection === "asc"
            ? [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ]
            : [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
      });
    }

    if (communityIds) {
      whereFilters.push({ targetType: "POST" });
    }

    const appeals = await prisma.appeal.findMany({
      where: whereFilters.length ? { AND: whereFilters } : undefined,
      orderBy: [
        { createdAt: sortDirection },
        { id: sortDirection },
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
      ? await prisma.post.findMany({
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
      ? await prisma.user.findMany({
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

    const targetUserMap = new Map(
      targetUsers.map((user) => [user.id, user])
    );

    const hasMore = filtered.length > limit;
    const sliced = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return apiSuccess({
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
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
