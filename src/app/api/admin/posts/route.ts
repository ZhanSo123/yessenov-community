import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getCommunityScope, requireUserApi } from "@/lib/auth";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return apiError("FORBIDDEN", 403);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim();
    const deletedParam = searchParams.get("deleted");
    const communitySlug = searchParams.get("community")?.trim();
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
    const cursor = parseCursor(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const filters: Prisma.PostWhereInput[] = [];

    if (communitySlug) {
      const community = await prisma.community.findUnique({
        where: { slug: communitySlug },
        select: { id: true },
      });

      if (!community) {
        return apiError("BAD_REQUEST", 400);
      }

      filters.push({ communityId: community.id });
    }

    if (communityIds) {
      filters.push({ communityId: { in: communityIds } });
    }

    if (deletedParam === "1") {
      filters.push({ deletedAt: { not: null } });
    } else if (deletedParam === "0") {
      filters.push({ deletedAt: null });
    }

    if (query) {
      filters.push({
        OR: [
          { content: { contains: query, mode: "insensitive" } },
          { author: { username: { contains: query, mode: "insensitive" } } },
          { author: { email: { contains: query, mode: "insensitive" } } },
        ],
      });
    }

    if (fromParam) {
      const fromDate = new Date(fromParam);
      if (Number.isNaN(fromDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      filters.push({ createdAt: { gte: fromDate } });
    }

    if (toParam) {
      const toDate = new Date(toParam);
      if (Number.isNaN(toDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      filters.push({ createdAt: { lte: toDate } });
    }

    if (cursor) {
      filters.push({
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

    const posts = await prisma.post.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: [
        { createdAt: sortDirection },
        { id: sortDirection },
      ],
      take: limit + 1,
      include: {
        author: { select: { id: true, email: true, username: true, name: true } },
        deletedBy: { select: { id: true, email: true, username: true, name: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return apiSuccess({ data: sliced, nextCursor });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
